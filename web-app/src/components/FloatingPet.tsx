import { useEffect, useMemo, useRef, useState } from "react";
import { usePetStore } from "@/store/usePetStore";
import { petStatusFromEntries } from "@/utils/petStatus";
import { useAIStore } from "@/store/useAIStore";
import { useTasksStore } from "@/store/useTasksStore";
import { useAppStore } from "@/store/useAppStore";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { useT } from "@/i18n/useT";
import { PetChat } from "@/components/PetChat";
import { PetSvg } from "@/components/PetSvg";
import { DogLevelUpModal } from "@/components/DogLevelUpModal";
import { useDogStore } from "@/store/useDogStore";
import { computeAllTimeStats } from "@/utils/stats";

// ── Message pool ──────────────────────────────────────────────────────────────

const MSG_MORNING = ["pet.morning.1", "pet.morning.2"];
const MSG_AFTERNOON = ["pet.afternoon.1", "pet.afternoon.2"];
const MSG_EVENING = ["pet.evening.1", "pet.evening.2"];
const MSG_NIGHT = ["pet.night.1", "pet.night.2"];
const MSG_IDLE = [
  "pet.idle.1", "pet.idle.2", "pet.idle.3",
  "pet.idle.4", "pet.idle.5", "pet.idle.6",
];
const MSG_TASKS_MANY = ["pet.tasks.many"];
const MSG_TASKS_NONE = ["pet.tasks.none"];

let lastMsgKey = "";

function pickMessage(q1Count: number): string {
  const h = new Date().getHours();
  let pool: string[];

  if (q1Count >= 3) pool = MSG_TASKS_MANY;
  else if (q1Count === 0) pool = MSG_TASKS_NONE;
  else if (h >= 5 && h < 11) pool = MSG_MORNING;
  else if (h >= 11 && h < 17) pool = MSG_AFTERNOON;
  else if (h >= 17 && h < 21) pool = MSG_EVENING;
  else pool = MSG_NIGHT;

  // mix in some idle messages
  const combined = [...pool, ...MSG_IDLE];
  const options = combined.filter((k) => k !== lastMsgKey);
  const key = options[Math.floor(Math.random() * options.length)];
  lastMsgKey = key;
  return key;
}

// ── Speech bubble ─────────────────────────────────────────────────────────────

function SpeechBubble({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 10px)",
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        padding: "8px 14px",
        fontSize: "12px",
        lineHeight: "1.5",
        color: "var(--text-primary)",
        whiteSpace: "nowrap",
        maxWidth: "220px",
        pointerEvents: "none",
        animation: "petBubbleIn 0.22s var(--ease-spring) both",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px var(--accent-dim)",
        zIndex: 1,
      }}
    >
      {text}
      {/* Triangle pointer */}
      <div
        style={{
          position: "absolute",
          top: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: "7px solid var(--border-strong)",
          marginTop: "0px",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "calc(100% - 1px)",
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid var(--bg-elevated)",
        }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function getMorningBriefKey(userId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `lumo.morning-brief.${userId}.${today}`;
}

export function FloatingPet() {
  const t = useT();
  const { pos, visible, activeMsg, mood, species, petName, setPos, setMsg, setMood } = usePetStore();
  const { chatOpen, toggleChat, loadConfig, configLoaded } = useAIStore();
  const tasks = useTasksStore((s) => s.tasks);
  const completed = useTasksStore((s) => s.completed);
  const locale = useAppStore((s) => s.locale);
  const tasksRef = useRef(tasks);
  const localeRef = useRef(locale);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { localeRef.current = locale; }, [locale]);
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const userId = useAuthStore((s) => s.user.id);
  const dogLevel = useDogStore((s) => s.level);
  const initDog = useDogStore((s) => s.initFromStats);

  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Load AI config once on mount
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // One-time dog XP init from historical stats (runs once completed entries are loaded)
  useEffect(() => {
    if (completed.length === 0) return;
    const allTime = computeAllTimeStats(completed);
    initDog(allTime.tasksCompleted, allTime.focusMinutes);
  }, [completed, initDog]);

  // Morning brief — show once per day on first load when user has tasks.
  // Uses refs for tasks/locale so changing them doesn't re-trigger the one-shot logic.
  useEffect(() => {
    if (!isSignedIn || !visible) return;
    const key = getMorningBriefKey(userId);
    if (localStorage.getItem(key)) return;
    const h = new Date().getHours();
    if (h < 5 || h >= 12) return; // Only in morning
    const currentTasks = tasksRef.current;
    const currentLocale = localeRef.current;
    const q1Count = currentTasks.filter((tk) => tk.quadrant === "Q1" && !tk.completed).length;
    const todayCount = currentTasks.filter((tk) => tk.today && !tk.completed).length;
    if (todayCount === 0) return;
    localStorage.setItem(key, "1");
    const msg = currentLocale === "zh"
      ? `早上好！今天有 ${todayCount} 个任务${q1Count > 0 ? `，其中 ${q1Count} 个 Q1 紧急` : ""}。加油！🌱`
      : `Good morning! You have ${todayCount} task${todayCount !== 1 ? "s" : ""} today${q1Count > 0 ? `, ${q1Count} urgent Q1` : ""}. Let's go! 🌱`;
    setTimeout(() => {
      setMsg(msg as string);
      setMood("happy");
    }, 2000);
  }, [isSignedIn, userId, visible, setMsg, setMood]);
  const dragOffset = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const pendingPos = useRef(pos);
  const msgTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Drag logic ──────────────────────────────────────────────────────────────
  const dragMoved = useRef(false);

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragMoved.current = false;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setIsDragging(true);
    setMood("excited");
  }

  useEffect(() => {
    if (!isDragging) return;

    function onMouseMove(e: MouseEvent) {
      dragMoved.current = true;
      pendingPos.current = {
        x: Math.max(0, Math.min(window.innerWidth - 70, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.y)),
      };
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setPos(pendingPos.current);
      });
    }

    function onMouseUp() {
      setIsDragging(false);
      cancelAnimationFrame(rafRef.current);
      if (!dragMoved.current) {
        // Short click — toggle chat
        toggleChat();
        setMood("happy");
        setTimeout(() => setMood("idle"), 1200);
      } else {
        setMood("happy");
        setTimeout(() => setMood("idle"), 1200);
      }
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, setPos, setMood]);

  // ── Periodic messages ───────────────────────────────────────────────────────
  useEffect(() => {
    const q1Count = tasks.filter((t) => t.quadrant === "Q1" && !t.completed).length;
    const interval = setInterval(() => {
      const key = pickMessage(q1Count);
      setMsg(key);
      setMood("happy");
      clearTimeout(msgTimeoutRef.current);
      msgTimeoutRef.current = setTimeout(() => {
        setMsg(null);
        setMood("idle");
      }, 6000);
    }, 45_000);
    return () => {
      clearInterval(interval);
      clearTimeout(msgTimeoutRef.current);
    };
  }, [tasks, locale, setMsg, setMood]);

  // ── Hover message ───────────────────────────────────────────────────────────
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  function onMouseEnter() {
    setIsHovered(true);
    if (!activeMsg) {
      setMood("happy");
    }
  }
  function onMouseLeave() {
    setIsHovered(false);
    clearTimeout(hoverTimeout.current);
    if (!activeMsg) {
      hoverTimeout.current = setTimeout(() => setMood("idle"), 800);
    }
  }

  // The pet's hover voice reflects real productivity (#174): an active streak,
  // a win today, or a gentle come-back nudge after idle days; otherwise it falls
  // back to the normal species greeting.
  const petStatus = useMemo(
    () => petStatusFromEntries(completed, computeAllTimeStats(completed).currentStreak, new Date()),
    [completed],
  );
  const greetingKey = species !== "dog" ? `pet.hover.${species}` : "pet.hover";
  const hoverMsg = petStatus.key
    ? t(petStatus.key).replace("{n}", String(petStatus.streak))
    : t(greetingKey);
  const displayMsg = activeMsg
    ? t(activeMsg)
    : isHovered
    ? hoverMsg
    : null;

  if (!visible) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          zIndex: 9998,
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
          width: 64,
          height: 72,
        }}
        onMouseDown={onMouseDown}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {!chatOpen && displayMsg && <SpeechBubble text={displayMsg} />}
        <PetSvg species={species} mood={mood} level={dogLevel} />
        {/* Chat open indicator dot */}
        {chatOpen && (
          <div
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--accent-primary)",
              border: "2px solid var(--bg-elevated)",
            }}
          />
        )}
      </div>
      <PetChat petPos={pos} species={species} petName={petName} />
      <DogLevelUpModal />
    </>
  );
}
