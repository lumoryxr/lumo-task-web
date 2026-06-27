import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CountdownCard } from "@/components/CountdownCard";
import { CountdownFormModal } from "@/components/CountdownFormModal";
import { IconCountdown, IconPlus } from "@/components/icons";
import { EmptyState } from "@/components/EmptyState";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { useCountdownStore } from "@/store/useCountdownStore";
import type { CountdownEvent } from "@/types/task";
import { daysUntil } from "@/utils/countdown";

export function CountdownPage() {
  const t = useT();
  const navigate = useNavigate();
  const locale = useAppStore((s) => s.locale);
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const userId = useAuthStore((s) => s.user.id);
  const { events, create, update, remove } = useCountdownStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CountdownEvent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Sort: today → upcoming by days asc → past by days desc
  const [upcoming, past] = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      const da = daysUntil(a.date, a.repeat, a.calendar);
      const db = daysUntil(b.date, b.repeat, b.calendar);
      if (da >= 0 && db >= 0) return da - db;
      if (da < 0  && db < 0)  return db - da;
      return da >= 0 ? -1 : 1;
    });
    return [
      sorted.filter((e) => daysUntil(e.date, e.repeat, e.calendar) >= 0),
      sorted.filter((e) => daysUntil(e.date, e.repeat, e.calendar) <  0),
    ];
  }, [events]);

  // Auth gate — countdown data is per-user, not available in local mode
  if (!isSignedIn) {
    return (
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 16, textAlign: "center", padding: "32px",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-faint)",
        }}>
          <IconCountdown size={28} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            {t("auth.required.title")}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 280 }}>
            {t("auth.required.countdown")}
          </div>
        </div>
        <button
          onClick={() => navigate("/login")}
          style={{
            marginTop: 8, padding: "9px 24px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--accent-edge)",
            background: "var(--accent-fog)",
            color: "var(--accent-primary)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {t("auth.login.btn")}
        </button>
      </div>
    );
  }

  function openCreate() {
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(ev: CountdownEvent) {
    setEditTarget(ev);
    setModalOpen(true);
  }

  function handleSave(values: Omit<CountdownEvent, "id" | "createdAt">) {
    if (editTarget) {
      update(userId, editTarget.id, values);
    } else {
      create(userId, values);
    }
  }

  function handleDelete(id: string) {
    setDeleteId(id);
  }

  function confirmDelete() {
    if (deleteId) remove(userId, deleteId);
    setDeleteId(null);
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "32px 32px 48px" }}>
      {/* Page header */}
      <div style={{
        display: "flex", alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 32,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ color: "var(--accent-primary)" }}>
              <IconCountdown size={20} />
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {t("countdown.title")}
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            {t("countdown.sub")}
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--accent-edge)",
            background: "var(--accent-fog)",
            color: "var(--accent-primary)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            transition: "background 150ms, box-shadow 150ms",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(61,255,160,0.16)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 0 14px var(--accent-glow)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--accent-fog)";
            (e.currentTarget as HTMLElement).style.boxShadow = "none";
          }}
        >
          <IconPlus size={14} />
          {t("countdown.add")}
        </button>
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <EmptyState
          icon={<IconCountdown size={28} />}
          title={t("countdown.empty.title")}
          subtitle={t("countdown.empty.sub")}
          cta={{ label: t("countdown.add"), onClick: openCreate }}
        />
      )}

      {/* Upcoming section */}
      {upcoming.length > 0 && (
        <Section label={t("countdown.upcoming")}>
          <CardGrid>
            {upcoming.map((ev) => (
              <CountdownCard
                key={ev.id}
                event={ev}
                locale={locale}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </CardGrid>
        </Section>
      )}

      {/* Past section */}
      {past.length > 0 && (
        <Section label={t("countdown.past")} muted>
          <CardGrid>
            {past.map((ev) => (
              <CountdownCard
                key={ev.id}
                event={ev}
                locale={locale}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </CardGrid>
        </Section>
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <CountdownFormModal
          event={editTarget}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteId(null); }}
        >
          <div style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lifted)",
            padding: "24px 28px",
            width: 320,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
              {t("countdown.delete.confirm")}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
              {events.find((e) => e.id === deleteId)?.title}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setDeleteId(null)}
                style={{
                  padding: "7px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-default)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: 13, cursor: "pointer",
                }}
              >
                {t("countdown.btn.cancel")}
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: "7px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(255,107,107,0.4)",
                  background: "rgba(255,107,107,0.1)",
                  color: "var(--status-urgent)",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {t("countdown.menu.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function Section({ label, muted, children }: { label: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: muted ? "var(--text-faint)" : "var(--text-muted)",
        marginBottom: 16,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: 16,
    }}>
      {children}
    </div>
  );
}
