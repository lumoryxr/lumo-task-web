import { randomBytes } from "node:crypto";
import { execute } from "./client.js";
import { runMigrations } from "./migrate.js";
import { hashPassword } from "../lib/password.js";

// Dev-only demo-data seeder — must never run against production data.
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

await runMigrations();

const userId = "u1";
const email = process.env.SEED_EMAIL ?? "demo@local.test";
// No hardcoded credentials: take the password from SEED_PASSWORD or generate a
// random one (printed at the end so the developer can sign in).
const plainPassword = process.env.SEED_PASSWORD ?? randomBytes(12).toString("base64url");
const password = await hashPassword(plainPassword);
const now = new Date().toISOString();

// Seed user
await execute(`
  INSERT OR IGNORE INTO users (id, email, password_hash, name, initials, local, plan, renews_at, created_at)
  VALUES (:id, :email, :password_hash, :name, :initials, :local, :plan, :renews_at, :created_at)
`, {
  id: userId,
  email,
  password_hash: password,
  name: "Alex Stride",
  initials: "AS",
  local: 0,
  plan: "pro",
  renews_at: "2026-08-12",
  created_at: now,
});

// Seed default settings
await execute(`INSERT OR IGNORE INTO settings (user_id) VALUES (:user_id)`, { user_id: userId });

// Seed people
const people = [
  { id: "p1", name: "Maya Chen", initials: "MC", color: "#5bc8d4", email: "maya@stride.studio" },
  { id: "p2", name: "Pieter van Dijk", initials: "PD", color: "#a8e64b", email: "pieter@stride.studio" },
  { id: "p3", name: "Jordan Kim", initials: "JK", color: "#ffb347", email: "jordan@stride.studio" },
];
for (const p of people) {
  await execute(`
    INSERT OR IGNORE INTO people (id, user_id, name, initials, color, email, created_at)
    VALUES (:id, :user_id, :name, :initials, :color, :email, :created_at)
  `, { ...p, user_id: userId, created_at: now });
}

// Seed tasks
const tasks = [
  {
    id: "t1", assignee_ids: JSON.stringify(["p1"]),
    title_en: "Finish homepage wireframes for client review",
    title_zh: "完成客户评审用的首页线框",
    desc_en: "Hero, features section, footer. Polish enough for Friday's review.",
    desc_zh: "Hero、功能区、Footer。打磨到周五评审可看的程度。",
    quadrant: "Q1", today: 1, due: now.slice(0, 10),
    duration: 90, pomos_done: 1, pomos_total: 4, conviction: 0.92,
    next_step_en: "Open Hero frame · Outline 3 layout options",
    next_step_zh: "打开 Hero 画板 · 列 3 个版式",
    reason_en: "Due today and blocks the next design stage.",
    reason_zh: "今天截止,会卡住下一阶段。",
    ai_suggest: null,
    not_now_json: JSON.stringify([
      { id: "t2", reason: { en: "Can wait until Sat — no blocker", zh: "周六前都不卡进度" } },
      { id: "t4", reason: { en: "Needs Maya's input first", zh: "得先等 Maya 反馈" } },
    ]),
  },
  { id: "t2", assignee_ids: JSON.stringify([]), title_en: "Draft Q3 OKRs", title_zh: "起草 Q3 OKR 初稿", desc_en: "Three objectives, five KRs each.", desc_zh: "三个目标,每个 5 个关键结果。", quadrant: "Q2", today: 1, due: null, duration: 60, pomos_done: 0, pomos_total: 3, conviction: null, next_step_en: null, next_step_zh: null, reason_en: null, reason_zh: null, ai_suggest: null, not_now_json: "[]" },
  { id: "t3", assignee_ids: JSON.stringify([]), title_en: "Reply to investor follow-up email", title_zh: "回复投资人跟进邮件", desc_en: null, desc_zh: null, quadrant: "Q1", today: 1, due: now.slice(0, 10), duration: 20, pomos_done: 0, pomos_total: 1, conviction: null, next_step_en: null, next_step_zh: null, reason_en: null, reason_zh: null, ai_suggest: null, not_now_json: "[]" },
  { id: "t4", assignee_ids: JSON.stringify(["p2"]), title_en: "Refactor auth module — token rotation", title_zh: "重构 auth 模块的 Token 轮换", desc_en: null, desc_zh: null, quadrant: "Q2", today: 0, due: null, duration: 180, pomos_done: 0, pomos_total: 6, conviction: null, next_step_en: null, next_step_zh: null, reason_en: null, reason_zh: null, ai_suggest: "Q2", not_now_json: "[]" },
  { id: "t5", assignee_ids: JSON.stringify(["p3"]), title_en: "Approve Acme invoices", title_zh: "审批 Acme 发票", desc_en: null, desc_zh: null, quadrant: "Q3", today: 1, due: now.slice(0, 10), duration: 15, pomos_done: 0, pomos_total: 1, conviction: null, next_step_en: null, next_step_zh: null, reason_en: null, reason_zh: null, ai_suggest: null, not_now_json: "[]" },
  { id: "t6", assignee_ids: JSON.stringify([]), title_en: "Clean up Downloads folder", title_zh: "清理下载文件夹", desc_en: null, desc_zh: null, quadrant: "Q4", today: 0, due: null, duration: 15, pomos_done: 0, pomos_total: 1, conviction: null, next_step_en: null, next_step_zh: null, reason_en: null, reason_zh: null, ai_suggest: null, not_now_json: "[]" },
  { id: "t7", assignee_ids: JSON.stringify([]), title_en: "Plan team offsite agenda", title_zh: "策划团队 offsite 议程", desc_en: null, desc_zh: null, quadrant: "unclassified", today: 0, due: null, duration: 45, pomos_done: 0, pomos_total: 2, conviction: null, next_step_en: null, next_step_zh: null, reason_en: null, reason_zh: null, ai_suggest: "Q2", not_now_json: "[]" },
  { id: "t8", assignee_ids: JSON.stringify([]), title_en: "Read research on focus rhythms", title_zh: "读专注节奏相关的研究", desc_en: null, desc_zh: null, quadrant: "unclassified", today: 0, due: null, duration: 40, pomos_done: 0, pomos_total: 2, conviction: null, next_step_en: null, next_step_zh: null, reason_en: null, reason_zh: null, ai_suggest: "Q4", not_now_json: "[]" },
  { id: "t9", assignee_ids: JSON.stringify([]), title_en: "Renew domain — lumo.app", title_zh: "续费域名 — lumo.app", desc_en: null, desc_zh: null, quadrant: "Q3", today: 0, due: null, duration: 5, pomos_done: 0, pomos_total: 1, conviction: null, next_step_en: null, next_step_zh: null, reason_en: null, reason_zh: null, ai_suggest: null, not_now_json: "[]" },
  { id: "t10", assignee_ids: JSON.stringify([]), title_en: "Read Pieter's design crit notes", title_zh: "阅读 Pieter 的设计批注", desc_en: null, desc_zh: null, quadrant: "Q2", today: 0, due: null, duration: 25, pomos_done: 0, pomos_total: 1, conviction: null, next_step_en: null, next_step_zh: null, reason_en: null, reason_zh: null, ai_suggest: null, not_now_json: "[]" },
  { id: "t11", assignee_ids: JSON.stringify([]), title_en: "Reorder office supplies", title_zh: "补购办公用品", desc_en: null, desc_zh: null, quadrant: "Q4", today: 0, due: null, duration: 10, pomos_done: 0, pomos_total: 1, conviction: null, next_step_en: null, next_step_zh: null, reason_en: null, reason_zh: null, ai_suggest: null, not_now_json: "[]" },
];

for (const t of tasks) {
  await execute(`
    INSERT OR IGNORE INTO tasks (
      id, user_id, assignee_ids, title_en, title_zh, desc_en, desc_zh,
      quadrant, today, due, duration, pomos_done, pomos_total, conviction,
      next_step_en, next_step_zh, reason_en, reason_zh, ai_suggest, not_now_json,
      created_at, updated_at
    ) VALUES (
      :id, :user_id, :assignee_ids, :title_en, :title_zh, :desc_en, :desc_zh,
      :quadrant, :today, :due, :duration, :pomos_done, :pomos_total, :conviction,
      :next_step_en, :next_step_zh, :reason_en, :reason_zh, :ai_suggest, :not_now_json,
      :created_at, :updated_at
    )
  `, { ...t, user_id: userId, created_at: now, updated_at: now });
}

// Seed completed entries
function todayAt(h: number, m: number) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const completed = [
  { id: "c1", title_en: "Reply to design feedback from Pieter", title_zh: "回复 Pieter 的设计反馈", duration: 18, quadrant: "Q2", started_at: todayAt(8, 55), completed_at: todayAt(9, 13) },
  { id: "c2", title_en: "Set up next week's calendar blocks", title_zh: "排好下周的日程块", duration: 12, quadrant: "Q3", started_at: todayAt(9, 20), completed_at: todayAt(9, 32) },
  { id: "c3", title_en: "Review pull request #47", title_zh: "Review PR #47", duration: 25, quadrant: "Q1", started_at: todayAt(10, 5), completed_at: todayAt(10, 30) },
];

for (const c of completed) {
  await execute(`
    INSERT OR IGNORE INTO completed_entries (id, user_id, task_id, title_en, title_zh, duration, quadrant, started_at, completed_at)
    VALUES (:id, :user_id, :task_id, :title_en, :title_zh, :duration, :quadrant, :started_at, :completed_at)
  `, { ...c, user_id: userId, task_id: null });
}

console.log("Seed complete.");
console.log(`Demo login → ${email} / ${plainPassword}`);
