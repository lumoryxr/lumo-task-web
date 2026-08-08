import { Hono } from "hono";
import { validate } from "../lib/validate.js";
import { z } from "zod";
import { BreakdownRequestSchema } from "@lumo/contracts";
import { query, queryOne, execute, batch } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { hlcNow } from "../lib/hlc.js";
import { decryptSecret } from "../lib/crypto.js";
import { callLLMWithTools, appendToolResults, type ChatMessage, type LLMConfig } from "../lib/ai-client.js";
import { TASK_TOOLS, executeTool } from "../lib/ai-tools.js";
import type { Variables } from "../env.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

// AI rate limits — keyed by authenticated userId (post-auth middleware)
const chatRateLimit     = createRateLimiter<{ Variables: Variables }>(10, 60_000, (c) => c.get("userId") as string);
const classifyRateLimit = createRateLimiter<{ Variables: Variables }>(20, 60_000, (c) => c.get("userId") as string);

// ── Shared helpers ────────────────────────────────────────────────────────────

const CLOUD_FREE_LIMIT = 100;

interface ProviderResult {
  apiKey: string | null;
  llmConfig: LLMConfig | null;
  usingCloud: boolean;
  limitReached: boolean;
}

async function getProviderConfig(userId: string): Promise<ProviderResult> {
  const settings = await queryOne<any>(
    "SELECT ai_provider, ai_configs, ai_cloud_used, ai_cloud_month FROM settings WHERE user_id = :uid",
    { uid: userId }
  );

  const activeProvider = (settings?.ai_provider ?? "openai") as "openai" | "deepseek" | "claude" | "custom";
  let configs: Record<string, any> = {};
  try { configs = JSON.parse(settings?.ai_configs ?? "{}"); } catch {}
  const providerCfg = configs[activeProvider] ?? {};
  const apiKey = decryptSecret(providerCfg.key).trim() || null;

  // User has their own key — use it directly
  if (apiKey) {
    return {
      apiKey,
      llmConfig: { provider: activeProvider, apiKey, baseUrl: providerCfg.baseUrl ?? null, model: providerCfg.model ?? null },
      usingCloud: false,
      limitReached: false,
    };
  }

  // Fall back to Lumo Cloud (server-side key)
  const cloudKey = (process.env.LUMO_AI_KEY ?? "").trim() || null;
  if (!cloudKey) return { apiKey: null, llmConfig: null, usingCloud: false, limitReached: false };

  const user = await queryOne<any>("SELECT plan FROM users WHERE id = :uid", { uid: userId });
  const limit = user?.plan === "pro" ? 999_999 : CLOUD_FREE_LIMIT;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const storedMonth = settings?.ai_cloud_month ?? "";
  const used = storedMonth === currentMonth ? (settings?.ai_cloud_used ?? 0) : 0;

  if (used >= limit) {
    return { apiKey: null, llmConfig: null, usingCloud: true, limitReached: true };
  }

  return {
    apiKey: cloudKey,
    llmConfig: { provider: "claude", apiKey: cloudKey, baseUrl: null, model: "claude-haiku-4-5-20251001" },
    usingCloud: true,
    limitReached: false,
  };
}

async function incrementCloudUsage(userId: string) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const s = await queryOne<any>(
    "SELECT ai_cloud_used, ai_cloud_month FROM settings WHERE user_id = :uid",
    { uid: userId }
  );
  const used = (s?.ai_cloud_month ?? "") === currentMonth ? (s?.ai_cloud_used ?? 0) : 0;
  await execute(
    "UPDATE settings SET ai_cloud_used = :used, ai_cloud_month = :month WHERE user_id = :uid",
    { used: used + 1, month: currentMonth, uid: userId }
  );
}

function heuristicQuadrant(task: any, today: string): { q: string; confidence: number } {
  if (task.due && task.due <= today) return { q: "Q1", confidence: 0.85 };
  if (task.due) {
    const days = Math.ceil((new Date(task.due).getTime() - Date.now()) / 86_400_000);
    if (days <= 7) return { q: "Q2", confidence: 0.75 };
    return { q: "Q3", confidence: 0.65 };
  }
  if (task.duration <= 15) return { q: "Q4", confidence: 0.6 };
  return { q: "Q3", confidence: 0.6 };
}

// POST /ai/classify — LLM-powered semantic classification (heuristic fallback)
app.post("/classify", classifyRateLimit, validate("json", z.object({}).strict()), async (c) => {
  const userId = c.get("userId") as string;
  try {
  const today = new Date().toISOString().slice(0, 10);

  const tasks = await query<any>(
    "SELECT * FROM tasks WHERE user_id = :uid AND completed = 0 AND deleted_at IS NULL AND quadrant = 'unclassified'",
    { uid: userId }
  );

  type Suggestion = { task_id: string; quadrant: string; confidence: number; reason?: string };
  const suggestions: Suggestion[] = [];

  if (tasks.length === 0) return c.json({ suggestions });

  const { llmConfig, usingCloud, limitReached } = await getProviderConfig(userId);

  // One UPDATE statement per classified task, flushed as a single atomic batch
  // instead of N sequential round-trips (avoids the N+1 write pattern).
  // The `id` fed to this UPDATE on the LLM happy-path comes straight from the
  // model's parsed output (see below), and a task title — which is attacker-
  // controllable — is injected into the classify prompt. A prompt-injection could
  // coax the model into returning another tenant's task id, so the write MUST be
  // self-defending: `AND user_id` guarantees classify can never touch a row the
  // caller doesn't own, regardless of what the model returns.
  const SUGGEST_SQL = "UPDATE tasks SET ai_suggest = :q, updated_at = :now WHERE id = :id AND user_id = :uid";
  const suggestStmt = (q: string, id: string) => ({ sql: SUGGEST_SQL, args: { q, now: hlcNow(), id, uid: userId } });
  const flush = async (stmts: ReturnType<typeof suggestStmt>[]) => {
    if (stmts.length) await batch(stmts);
  };

  if (limitReached) {
    // Quota exhausted — fall through to heuristic, surface the flag
    const stmts = tasks.map((task: any) => {
      const h = heuristicQuadrant(task, today);
      suggestions.push({ task_id: task.id, quadrant: h.q, confidence: h.confidence });
      return suggestStmt(h.q, task.id);
    });
    await flush(stmts);
    return c.json({ suggestions, cloudLimitReached: true });
  }

  if (llmConfig) {
    const taskList = tasks.map((t: any) => ({
      id: t.id,
      title: t.title_en || t.title_zh || "Untitled",
      desc: t.desc_en || "",
      due: t.due || null,
      duration: t.duration || 0,
    }));

    const prompt = `You are a productivity expert classifying tasks using the Eisenhower Matrix.
Today: ${today}

Quadrant rules:
- Q1 (Urgent + Important): overdue, hard deadlines within 48h, critical issues, crises
- Q2 (Important + Not Urgent): planning, long-term goals, learning, upcoming deadlines 3-30 days out
- Q3 (Urgent + Not Important): interruptions, favors, most meetings, quick unimportant requests
- Q4 (Not Urgent + Not Important): time-wasters, trivial tasks, low-value activities

Tasks to classify:
${taskList.map((t: any) => `[${t.id}] "${t.title}"${t.due ? ` (due:${t.due})` : ""}${t.duration ? ` (${t.duration}min)` : ""}${t.desc ? ` — ${t.desc}` : ""}`).join("\n")}

Return ONLY a JSON array, no markdown:
[{"task_id":"...","quadrant":"Q1|Q2|Q3|Q4","confidence":0.0-1.0,"reason":"one short sentence why"}]`;

    try {
      const result = await callLLMWithTools(llmConfig, [{ role: "user", content: prompt }], []);
      if (result.finish === "text") {
        const m = result.text.match(/\[[\s\S]*\]/);
        const parsed = JSON.parse(m ? m[0] : result.text) as any[];
        const covered = new Set<string>();
        const stmts: ReturnType<typeof suggestStmt>[] = [];

        for (const item of parsed) {
          const q = ["Q1","Q2","Q3","Q4"].includes(item.quadrant) ? item.quadrant : "Q3";
          const confidence = typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : 0.7;
          const reason = typeof item.reason === "string" ? item.reason.slice(0, 200) : undefined;
          stmts.push(suggestStmt(q, item.task_id));
          suggestions.push({ task_id: item.task_id, quadrant: q, confidence, reason });
          covered.add(item.task_id);
        }

        // Heuristic fallback for any tasks the LLM missed
        for (const task of tasks) {
          if (!covered.has(task.id)) {
            const h = heuristicQuadrant(task, today);
            stmts.push(suggestStmt(h.q, task.id));
            suggestions.push({ task_id: task.id, quadrant: h.q, confidence: h.confidence });
          }
        }

        await flush(stmts);
        if (usingCloud) await incrementCloudUsage(userId);
        return c.json({ suggestions });
      }
    } catch (err: any) {
      log("warn", { requestId: c.get("requestId"), route: "POST /v1/ai/classify", fallback: "heuristic", msg: err?.message ?? String(err) });
    }
  }

  // Pure heuristic (no API key or LLM failed)
  const heuristicStmts = tasks.map((task: any) => {
    const h = heuristicQuadrant(task, today);
    suggestions.push({ task_id: task.id, quadrant: h.q, confidence: h.confidence });
    return suggestStmt(h.q, task.id);
  });
  await flush(heuristicStmts);

  return c.json({ suggestions });
  } catch (err: any) {
    log("error", { requestId: c.get("requestId"), route: "POST /v1/ai/classify", msg: err?.message ?? String(err) });
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// POST /ai/recommend — LLM-reasoned recommendation (SQL sort fallback)
app.post("/recommend", classifyRateLimit, validate("json", z.object({}).strict()), async (c) => {
  const userId = c.get("userId") as string;
  try {
  const q1Tasks = await query<any>(
    `SELECT * FROM tasks
    WHERE user_id = :uid AND completed = 0 AND deleted_at IS NULL AND quadrant = 'Q1' AND today = 1
    ORDER BY conviction DESC NULLS LAST, due ASC NULLS LAST`,
    { uid: userId }
  );

  if (q1Tasks.length === 0) return c.json({ task: null });

  const topTask = q1Tasks[0];
  const { llmConfig, usingCloud } = await getProviderConfig(userId);

  if (llmConfig && q1Tasks.length >= 1) {
    const today = new Date().toISOString().slice(0, 10);
    const taskList = q1Tasks.slice(0, 5).map((t: any) => ({
      id: t.id,
      title: t.title_en || t.title_zh || "Untitled",
      due: t.due,
      duration: t.duration,
    }));

    const prompt = `You are a productivity assistant. Today is ${today}.
The user's Q1 (Urgent + Important) tasks for today:
${taskList.map((t: any, i: number) => `${i+1}. [${t.id}] "${t.title}"${t.due ? ` due:${t.due}` : ""}${t.duration ? ` (${t.duration}min)` : ""}`).join("\n")}

Choose the single most critical task to work on RIGHT NOW. Return ONLY valid JSON:
{"task_id":"...","conviction":0.0-1.0,"reason":"one concise sentence why this is most critical right now","next_step":"one concrete action to start immediately"}`;

    try {
      const result = await callLLMWithTools(llmConfig, [{ role: "user", content: prompt }], []);
      if (result.finish === "text") {
        const m = result.text.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(m ? m[0] : result.text);
        const picked = q1Tasks.find((t: any) => t.id === parsed.task_id) ?? topTask;
        const conviction = typeof parsed.conviction === "number" ? Math.min(1, Math.max(0, parsed.conviction)) : 0.85;
        const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : null;
        const nextStep = typeof parsed.next_step === "string" ? parsed.next_step.slice(0, 300) : null;

        await execute("UPDATE tasks SET conviction = :c, reason_en = :r, next_step_en = :ns, updated_at = :now WHERE id = :id AND user_id = :uid",
          { c: conviction, r: reason, ns: nextStep, now: hlcNow(), id: picked.id, uid: userId });

        if (usingCloud) await incrementCloudUsage(userId);
        return c.json({
          task: {
            id: picked.id,
            title: { en: picked.title_en, ...(picked.title_zh ? { zh: picked.title_zh } : {}) },
            quadrant: picked.quadrant,
            conviction,
            ...(reason ? { reason: { en: reason } } : {}),
            ...(nextStep ? { next_step: { en: nextStep } } : {}),
          },
        });
      }
    } catch (err: any) {
      log("warn", { requestId: c.get("requestId"), route: "POST /v1/ai/recommend", fallback: "sql-sort", msg: err?.message ?? String(err) });
    }
  }

  // Heuristic fallback
  const conviction = 0.85;
  await execute("UPDATE tasks SET conviction = :c, updated_at = :now WHERE id = :id AND user_id = :uid",
    { c: conviction, now: hlcNow(), id: topTask.id, uid: userId });

  return c.json({
    task: {
      id: topTask.id,
      title: { en: topTask.title_en, ...(topTask.title_zh ? { zh: topTask.title_zh } : {}) },
      quadrant: topTask.quadrant,
      conviction,
    },
  });
  } catch (err: any) {
    log("error", { requestId: c.get("requestId"), route: "POST /v1/ai/recommend", msg: err?.message ?? String(err) });
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// POST /ai/parse — natural language task parser
const ParseBody = z.object({
  text: z.string().min(1).max(500),
  locale: z.enum(["en", "zh"]).optional(),
});

app.post("/parse", classifyRateLimit, validate("json", ParseBody), async (c) => {
  const userId = c.get("userId") as string;
  const { text, locale } = c.req.valid("json");

  const { llmConfig, usingCloud } = await getProviderConfig(userId);

  if (!llmConfig) {
    return c.json({ title: text.trim(), quadrant: "unclassified", due: null, duration: null, confidence: 0 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const langNote = locale === "zh" ? "The user may write in Chinese." : "";

  const prompt = `You are a task parser. Today is ${today}. ${langNote}
Extract task details from the user's input. Return ONLY valid JSON (no markdown):
{"title":"string","quadrant":"Q1"|"Q2"|"Q3"|"Q4"|"unclassified","due":"YYYY-MM-DD or null","duration":minutes_or_null,"confidence":0.0_to_1.0}
Quadrants: Q1=urgent+important, Q2=important not urgent, Q3=urgent not important, Q4=neither.
Input: "${text}"`;

  try {
    const result = await callLLMWithTools(llmConfig, [{ role: "user", content: prompt }], []);
    if (result.finish === "text") {
      try {
        const m = result.text.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(m ? m[0] : result.text);
        const dueRaw = typeof parsed.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due) ? parsed.due : null;
        const durationRaw = typeof parsed.duration === "number" && parsed.duration >= 0 && parsed.duration <= 1440 ? Math.round(parsed.duration) : null;
        if (usingCloud) await incrementCloudUsage(userId);
        return c.json({
          title: typeof parsed.title === "string" ? parsed.title.trim() || text.trim() : text.trim(),
          quadrant: ["Q1","Q2","Q3","Q4","unclassified"].includes(parsed.quadrant) ? parsed.quadrant : "unclassified",
          due: dueRaw,
          duration: durationRaw,
          confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.7,
        });
      } catch {
        return c.json({ title: text.trim(), quadrant: "unclassified", due: null, duration: null, confidence: 0 });
      }
    }
    return c.json({ title: text.trim(), quadrant: "unclassified", due: null, duration: null, confidence: 0 });
  } catch (err: any) {
    log("warn", { requestId: c.get("requestId"), route: "POST /v1/ai/parse", fallback: "raw-title", msg: err?.message ?? String(err) });
    return c.json({ title: text.trim(), quadrant: "unclassified", due: null, duration: null, confidence: 0 });
  }
});

// ── Chat ──────────────────────────────────────────────────────────────────────

const ChatBody = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(5000),
  })).max(20),
  context: z.object({
    page: z.string().max(200).optional(),
    todayTasks: z.array(z.object({
      id: z.string(),
      title: z.string().max(500),
      quadrant: z.string().max(20),
    })).max(50).optional(),
    q1Count: z.number().int().optional(),
    recentCompleted: z.array(z.object({
      title: z.string().max(500),
      completedAt: z.string(),
    })).max(20).optional(),
    locale: z.enum(["en", "zh"]).optional(),
    userName: z.string().max(100).optional(),
    species: z.enum(["dog", "cat", "fox", "panda", "robot"]).optional(),
    petName: z.string().max(50).optional(),
    // Hours booked in the user's imported calendar today (#172 V2). Bounded so a
    // malformed client value can't distort planning; feeds generate_today_plan.
    calendarBusyHours: z.number().nonnegative().max(24).optional(),
  }).optional(),
});

// Fallback canned responses when no LLM is configured
function fallbackReply(ctx: {
  q1Count?: number;
  locale?: string;
  userName?: string;
  userMessage?: string;
}): string {
  const zh = ctx.locale === "zh";
  const hour = new Date().getHours();
  const q1 = ctx.q1Count ?? 0;
  const name = ctx.userName ? (zh ? ctx.userName : ctx.userName) : (zh ? "你" : "there");

  if (q1 > 3) return zh
    ? `嘿 ${name}，你有 ${q1} 个紧急重要任务，先专注 Q1 吧！`
    : `Hey ${name}, you've got ${q1} urgent Q1 tasks — let's tackle those first!`;

  if (hour < 10) return zh
    ? `早上好 ${name}！今天想先从哪个任务开始？`
    : `Good morning, ${name}! What would you like to start with today?`;

  if (hour >= 18) return zh
    ? `快下班了 ${name}，把今天剩下的任务收个尾？`
    : `Evening, ${name}! Let's wrap up what's left for today.`;

  return zh
    ? `嗨 ${name}！有什么我可以帮你的？（提示：去设置里配置 AI 解锁完整对话能力）`
    : `Hi ${name}! How can I help? (Tip: configure AI in Settings to unlock full chat)`;
}

function inferMood(reply: string, q1Count: number): "idle" | "happy" | "excited" {
  if (q1Count > 5) return "excited";
  if (/[!🎉✓🌟🐾🚀]/.test(reply)) return "happy";
  return "idle";
}

const SPECIES_PERSONALITY: Record<string, { en: string; zh: string }> = {
  dog: {
    en: "You are a loyal, warm, and occasionally playful dog companion. You use 🐾 and 🐕 occasionally. You're enthusiastic, direct, and genuinely care about the user's progress.",
    zh: "你是一只忠诚、温暖、偶尔调皮的狗狗伙伴。偶尔用 🐾 和 🐕。你热情、直接，真心关心用户的进展。",
  },
  cat: {
    en: "You are a sophisticated, slightly aloof cat companion. You're smart, discerning, and offer wisdom with a hint of dry wit. Use 🐱 occasionally. You're helpful but on your own terms.",
    zh: "你是一只高冷、优雅的猫咪伙伴。你聪明、挑剔，偶尔带点冷幽默。偶尔用 🐱。你很有帮助，但有自己的原则。",
  },
  fox: {
    en: "You are a clever, mischievous fox companion. You love wordplay, creative solutions, and thinking outside the box. Use 🦊 occasionally. You're witty and love a good challenge.",
    zh: "你是一只聪明、调皮的狐狸伙伴。你喜欢文字游戏、创意思路和跳出框框思考。偶尔用 🦊。你机智，喜欢挑战。",
  },
  panda: {
    en: "You are a gentle, zen panda companion. You're calm, wise, and speak with quiet confidence. Use 🐼 occasionally. You help the user find balance and focus without stress.",
    zh: "你是一只温柔、禅意十足的熊猫伙伴。你平静、智慧，说话轻声而有力。偶尔用 🐼。帮助用户找到平衡和专注，而不是焦虑。",
  },
  robot: {
    en: "You are a precise, logical robot assistant. You communicate clearly and efficiently, favor structured responses, and use technical metaphors. No excessive emojis. You excel at systematic planning.",
    zh: "你是一个精确、逻辑严谨的机器人助手。你表达清晰高效，偏好结构化回答，喜欢用技术比喻。不用过多表情符号。你擅长系统性规划。",
  },
};

function buildSystemPrompt(ctx: {
  userName?: string;
  page?: string;
  todayTasks?: { id: string; title: string; quadrant: string }[];
  q1Count?: number;
  recentCompleted?: { title: string; completedAt: string }[];
  locale?: string;
  species?: string;
  petName?: string;
}): string {
  const locale = ctx.locale ?? "en";
  const species = ctx.species ?? "dog";
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });

  const todayList = (ctx.todayTasks ?? [])
    .slice(0, 8)
    .map((t) => `- [${t.quadrant}] ${t.title} (id: ${t.id})`)
    .join("\n") || "  (none)";

  const recentList = (ctx.recentCompleted ?? [])
    .slice(0, 3)
    .map((e) => `- ${e.title}`)
    .join("\n") || "  (none)";

  const langInstruction = locale === "zh"
    ? "用中文（简体）回复。语气自然、简洁、有温度。"
    : "Respond in English. Be natural, concise, and warm.";

  const personality = SPECIES_PERSONALITY[species]?.[locale === "zh" ? "zh" : "en"]
    ?? SPECIES_PERSONALITY.dog.en;

  const nameNote = ctx.petName ? (locale === "zh" ? `你的名字是「${ctx.petName}」。` : `Your name is "${ctx.petName}".`) : "";

  return `${personality} ${nameNote}
You live inside the Lumo Task app as the user's AI companion. Keep replies to 1-3 sentences unless more is genuinely needed.

## CRITICAL: You have full tool access to control this app. ALWAYS use tools for ANY operational request.

### When to call tools (do it immediately, without asking for confirmation):
- User asks to create / add / 创建 / 记录 a task → call create_task
- User asks to create multiple tasks at once → call batch_create_tasks
- User asks to complete / finish / 完成 a task → call list_tasks then complete_task
- User asks to delete / remove / 删除 a task → call list_tasks then delete_task
- User asks to update / change / rename / move a task → call list_tasks then update_task
- User asks what tasks exist / 有什么任务 → call list_tasks
- User asks to search for a task / 搜索任务 → call search_tasks
- User asks to add to today / 加入今天 → call list_tasks then update_task with today=true
- User asks to plan today / generate today's plan → call generate_today_plan (if they mention available time, e.g. "I only have 2 hours" / "只有两小时", pass available_hours so the plan fits the budget)
- User asks about progress / stats / 完成了什么 → call get_focus_stats or list_completed
- User asks for recommendation / next task / 做什么 → call get_recommended_task
- User asks to classify tasks / 分类 → call classify_tasks
- User asks to reorganize / reclassify multiple tasks → call reorganize_matrix
- User asks about team members → call list_people
- User asks to add a colleague / 添加成员 → call create_person

### Rules:
1. NEVER say "I can't do that" for any of the above — just call the tool.
2. NEVER ask "should I do X?" — just do it, then confirm in your reply.
3. After completing a tool action, summarize what you did in 1 sentence.
4. If you need a task ID but don't have it, call list_tasks first.

## App context
User: ${ctx.userName ?? "there"}
Time: ${timeOfDay} on ${dayOfWeek}
Page: ${ctx.page ?? "unknown"}
Q1 active tasks: ${ctx.q1Count ?? 0}
Today's tasks:
${todayList}
Recently completed:
${recentList}

${langInstruction}`;
}

// ── Simple intent parser (works without LLM key) ─────────────────────────────
//
// Handles unambiguous operational commands so the pet is useful even in basic mode.

type IntentResult = { reply: string; toolsUsed: string[] };

async function tryParseIntent(
  text: string,
  locale: string,
  jwt: string,
): Promise<IntentResult | null> {
  const zh = locale === "zh";
  const t = text.trim();

  // ── Create task ──────────────────────────────────────────────────────────
  // Patterns: "创建任务 XXX", "新建任务XXX", "添加任务：XXX", "帮我创建XXX任务"
  //           "create task XXX", "add task XXX", "new task XXX"
  const createRe = [
    /^(?:帮(?:我|我来)?)?(?:创建|新建|添加)(?:一个)?(?:任务)?[：:\s]+(.+)/,
    /^(?:帮(?:我|我来)?)?(?:给我)?(?:记录|记下|记一下)(?:一个)?(?:任务)?[：:\s]+(.+)/,
    /^(?:任务)[：:\s]+(.+)/,
    /^(?:create|add|new)\s+(?:a\s+)?task[：:\s:]+(.+)/i,
    /^(?:help\s+me\s+)?(?:create|add)\s+(.+?)\s+(?:task|to[\s-]?do)/i,
  ];

  // Looser: "帮我创建一个叫做XXX的任务" / "创建一个XXX"
  const createLooseRe = [
    /(?:创建|新建|添加)(?:一个)?(?:叫(?:做)?|名(?:为)?|题目(?:为)?)?[「"']?([^」"']+)[」"']?(?:的任务)?/,
    /(?:create|add|new)\s+(?:a\s+)?(?:task\s+(?:called?|named?)\s+)?[「"']?([^」"']+)[」"']/i,
  ];

  for (const re of createRe) {
    const m = t.match(re);
    if (m?.[1]) {
      return executeCreateTask(m[1].trim(), locale, jwt);
    }
  }
  for (const re of createLooseRe) {
    const m = t.match(re);
    if (m?.[1] && m[1].length >= 2) {
      return executeCreateTask(m[1].trim(), locale, jwt);
    }
  }

  // ── List tasks ───────────────────────────────────────────────────────────
  if (/^(?:我的任务|今天的任务|查看任务|所有任务|任务列表|show\s+(?:my\s+)?tasks?|list\s+(?:my\s+)?tasks?|what(?:'s|\s+are)\s+my\s+tasks?)$/i.test(t)) {
    return executeListTasks(locale, jwt, false);
  }
  if (/^(?:今天的任务|今日任务|today'?s?\s+tasks?|today'?s?\s+plan)$/i.test(t)) {
    return executeListTasks(locale, jwt, true);
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  if (/^(?:今天完成了什么|今日进度|我的统计|show\s+stats?|my\s+progress|today'?s?\s+stats?)$/i.test(t)) {
    return executeGetStats(locale, jwt);
  }

  return null;
}

async function executeCreateTask(title: string, locale: string, jwt: string): Promise<IntentResult> {
  const result = await executeTool(
    { id: "intent-1", name: "create_task", args: { title, quadrant: "Q2" } },
    jwt,
    locale,
  );
  const data = JSON.parse(result) as any;
  if (data.error) throw new Error(data.error);
  const reply = locale === "zh"
    ? `✓ 已创建任务「${data.title}」。需要调整优先级或截止日期，告诉我就好！`
    : `✓ Created task "${data.title}". Let me know if you'd like to set a due date or priority!`;
  return { reply, toolsUsed: ["create_task"] };
}

async function executeListTasks(locale: string, jwt: string, todayOnly: boolean): Promise<IntentResult> {
  const result = await executeTool(
    { id: "intent-2", name: "list_tasks", args: { today_only: todayOnly ? "true" : "false" } },
    jwt,
    locale,
  );
  const tasks = JSON.parse(result) as any[];
  if (tasks.length === 0) {
    return {
      reply: locale === "zh" ? "现在没有待办任务，去创建一个吧 🌱" : "No active tasks right now. Create one to get started! 🌱",
      toolsUsed: ["list_tasks"],
    };
  }
  const lines = tasks.slice(0, 8).map((t) => `• [${t.quadrant}] ${t.title}${t.today ? " ★" : ""}`);
  const header = locale === "zh"
    ? `共 ${tasks.length} 个任务：\n`
    : `${tasks.length} task${tasks.length !== 1 ? "s" : ""}:\n`;
  return { reply: header + lines.join("\n"), toolsUsed: ["list_tasks"] };
}

async function executeGetStats(locale: string, jwt: string): Promise<IntentResult> {
  const result = await executeTool({ id: "intent-3", name: "get_focus_stats", args: {} }, jwt, locale);
  const s = JSON.parse(result) as any;
  const reply = locale === "zh"
    ? `今日完成 ${s.today_completed} 个任务，本周完成 ${s.week_completed} 个，专注 ${Math.round(s.week_focus_minutes / 60 * 10) / 10}h。当前待办 ${s.active_tasks} 个（Q1 紧急：${s.q1_active}）`
    : `Today: ${s.today_completed} done. This week: ${s.week_completed} done, ${Math.round(s.week_focus_minutes / 60 * 10) / 10}h focused. Active tasks: ${s.active_tasks} (${s.q1_active} Q1 urgent)`;
  return { reply, toolsUsed: ["get_focus_stats"] };
}

// POST /ai/breakdown — AI-powered subtask breakdown
app.post("/breakdown", classifyRateLimit, validate("json", BreakdownRequestSchema), async (c) => {
  const userId = c.get("userId") as string;
  const { taskId, locale } = c.req.valid("json");

  try {
    const task = await queryOne<any>(
      "SELECT title_en, title_zh, desc_en, desc_zh FROM tasks WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
      { id: taskId, uid: userId }
    );

    if (!task) return httpError(c, 404, "NOT_FOUND", "Task not found");

    const { llmConfig, usingCloud, limitReached } = await getProviderConfig(userId);

    if (limitReached) {
      return c.json({ subtasks: [], cloudLimitReached: true });
    }

    if (!llmConfig) {
      return c.json({ subtasks: [], cloudLimitReached: false });
    }

    const title = task.title_en || task.title_zh || "Untitled";
    const desc = task.desc_en || task.desc_zh || "";
    const lang = locale ?? "en";
    const langInstruction = lang === "zh"
      ? "Respond in Chinese (Simplified). Generate subtasks in Chinese."
      : "Respond in English. Generate subtasks in English.";

    const prompt = `You are a productivity expert helping break down tasks into actionable steps.
${langInstruction}

Task: "${title}"${desc ? `\nDescription: "${desc}"` : ""}

Break this task into 3-5 concrete, actionable subtasks. Each subtask should:
- Be completable in 1-2 pomodoro sessions (25-50 minutes)
- Be specific and actionable (avoid vague verbs like "research" — use "read 3 articles and summarize")
- Cover the main phases from start to completion
- Stay flat — no nested subtasks

Return ONLY a JSON array of strings, no markdown, no explanation:
["subtask 1", "subtask 2", "subtask 3"]`;

    try {
      const result = await callLLMWithTools(llmConfig, [{ role: "user", content: prompt }], []);

      if (result.finish !== "text") {
        return httpError(c, 502, "AI_UNAVAILABLE", "AI service returned unexpected result");
      }

      // Non-greedy to avoid spanning multiple bracket groups in the response
      const m = result.text.match(/\[[\s\S]*?\]/);
      let parsed: unknown;
      try {
        parsed = JSON.parse(m ? m[0] : result.text);
      } catch {
        return httpError(c, 502, "AI_PARSE_ERROR", "Failed to parse AI response");
      }

      if (!Array.isArray(parsed)) {
        return httpError(c, 502, "AI_PARSE_ERROR", "Failed to parse AI response");
      }

      const subtasks = (parsed as unknown[])
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .slice(0, 5)
        .map((s) => s.trim());

      // Double-check quota after LLM call to guard against TOCTOU race
      if (usingCloud) {
        const { limitReached: recheck } = await getProviderConfig(userId);
        if (recheck) {
          return c.json({ subtasks: [], cloudLimitReached: true });
        }
        await incrementCloudUsage(userId);
      }

      return c.json({ subtasks, cloudLimitReached: false });
    } catch (err: any) {
      log("warn", { requestId: c.get("requestId"), route: "POST /v1/ai/breakdown", stage: "llm", msg: err?.message ?? String(err) });
      return httpError(c, 502, "AI_UNAVAILABLE", "AI service unavailable. Please try again.");
    }
  } catch (err: any) {
    log("error", { requestId: c.get("requestId"), route: "POST /v1/ai/breakdown", msg: err?.message ?? String(err) });
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// POST /ai/chat
app.post("/chat", chatRateLimit, validate("json", ChatBody), async (c) => {
  const userId = c.get("userId") as string;
  const { messages, context } = c.req.valid("json");

  // Extract JWT for tool execution (reuse user's own auth token)
  const jwt = (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "");

  const { llmConfig, usingCloud, limitReached } = await getProviderConfig(userId);
  // Resolve active provider for appendToolResults (needs provider name)
  const settingsRow = await queryOne<any>("SELECT ai_provider FROM settings WHERE user_id = :uid", { uid: userId });
  const activeProvider = (settingsRow?.ai_provider ?? (llmConfig?.provider ?? "openai")) as "openai" | "deepseek" | "claude" | "custom";

  const locale = context?.locale ?? "en";
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // No LLM (no key or limit reached) — try intent parser first, fall back to canned response
  if (!llmConfig || limitReached) {
    try {
      const intent = await tryParseIntent(lastUserMsg, locale, jwt);
      if (intent) {
        return c.json({ reply: intent.reply, mood: "happy", fallback: false, toolsUsed: intent.toolsUsed });
      }
    } catch (err: any) {
      log("warn", { requestId: c.get("requestId"), route: "POST /v1/ai/chat", stage: "intent", msg: err?.message ?? String(err) });
    }
    const reply = fallbackReply({ q1Count: context?.q1Count, locale, userName: context?.userName, userMessage: lastUserMsg });
    return c.json({ reply, mood: inferMood(reply, context?.q1Count ?? 0), fallback: true, toolsUsed: [] });
  }

  const systemPrompt = buildSystemPrompt({
    ...context,
    species: context?.species,
    petName: context?.petName,
  });
  let currentMessages: unknown[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const toolsUsed: string[] = [];
  const MAX_STEPS = 6;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const result = await callLLMWithTools(llmConfig, currentMessages, TASK_TOOLS);

      if (result.finish === "text") {
        // If LLM replied without tools but message looks operational, run intent parser as fallback
        if (step === 0 && toolsUsed.length === 0) {
          try {
            const intent = await tryParseIntent(lastUserMsg, locale, jwt);
            if (intent) {
              const combined = intent.reply + "\n\n" + result.text;
              if (usingCloud) await incrementCloudUsage(userId);
              return c.json({ reply: combined, mood: "happy", fallback: false, toolsUsed: intent.toolsUsed });
            }
          } catch {}
        }
        if (usingCloud) await incrementCloudUsage(userId);
        return c.json({
          reply: result.text,
          mood: inferMood(result.text, context?.q1Count ?? 0),
          fallback: false,
          toolsUsed,
        });
      }

      // Execute all tool calls in this step
      const toolResults: string[] = [];
      for (const call of result.calls) {
        toolsUsed.push(call.name);
        try {
          const res = await executeTool(call, jwt, locale, {
            calendarBusyHours: context?.calendarBusyHours,
          });
          toolResults.push(res);
        } catch (err: any) {
          toolResults.push(JSON.stringify({ error: err?.message ?? "Tool execution failed" }));
        }
      }

      currentMessages = appendToolResults(currentMessages, result.assistantTurn, result.calls, toolResults, activeProvider);
    }

    return c.json({
      reply: locale === "zh"
        ? "我遇到了一些问题，请稍后再试。"
        : "I ran into an issue completing that. Please try again.",
      mood: "idle",
      fallback: false,
      toolsUsed,
    });
  } catch (err: any) {
    log("warn", { requestId: c.get("requestId"), route: "POST /v1/ai/chat", stage: "llm", msg: err?.message ?? String(err) });
    return httpError(c, 502, "AI_UNAVAILABLE", "AI service unavailable. Please try again.");
  }
});

export default app;
