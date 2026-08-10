import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { toast } from "@/store/useToastStore";
import type {
  FeedbackWire,
  AdminFeedbackWire,
  FeedbackCategory,
  FeedbackStatus,
} from "@lumo/contracts";

type T = (k: string) => string;

// Kept in sync with the contract via `satisfies`; a wrong value fails the build.
const CATEGORIES = ["bug", "idea", "question", "other"] as const satisfies readonly FeedbackCategory[];
const STATUSES = ["open", "in_progress", "resolved", "closed"] as const satisfies readonly FeedbackStatus[];

/** Small colored pill for a feedback status. */
function StatusBadge({ status, t }: { status: FeedbackStatus; t: T }) {
  // Resolved reads as "done" (accent); everything else stays neutral so the
  // list doesn't turn into a wall of color.
  const isDone = status === "resolved";
  return (
    <span
      className="text-[10.5px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={
        isDone
          ? { background: "var(--accent-fog)", color: "var(--accent-primary)" }
          : { background: "var(--surface-sunken, rgba(127,127,127,0.12))", color: "var(--text-muted)" }
      }
    >
      {t(`settings.feedback.status.${status}`)}
    </span>
  );
}

/**
 * In-app feedback: submit a message + category, then see your own items with
 * the team's status and reply. Admins (see {@link AdminFeedbackSection}) get an
 * extra panel to triage everyone's feedback. Complements — never replaces — the
 * GitHub Issues link in the About panel above.
 */
export function FeedbackPanel({ t }: { t: T }) {
  const [items, setItems] = useState<FeedbackWire[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [submitting, setSubmitting] = useState(false);

  // Load once on mount. `api` is a stable module import, so no reactive deps.
  useEffect(() => {
    let alive = true;
    api
      .listFeedback()
      .then((res) => {
        if (!alive) return;
        setItems(res.feedback);
        setIsAdmin(res.isAdmin);
      })
      .catch(() => alive && setLoadError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function submit() {
    const text = message.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const created = await api.submitFeedback({ message: text, category });
      setItems((prev) => [created, ...prev]);
      setMessage("");
      toast.success(t("settings.feedback.sent"));
    } catch {
      toast.error(t("settings.feedback.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="text-[15px] font-semibold text-text-primary mb-5">{t("settings.feedback.title")}</h2>

      <div className="surface-card overflow-hidden">
        {/* ── Submit form ─────────────────────────────────────────────── */}
        <div className="px-5 py-4">
          <p className="text-[11.5px] text-text-muted mb-3 leading-relaxed max-w-[420px]">
            {t("settings.feedback.desc")}
          </p>

          <textarea
            aria-label={t("settings.feedback.title")}
            placeholder={t("settings.feedback.placeholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={4000}
            className="w-full text-[13px] rounded-lg px-3 py-2 bg-surface text-text-primary border border-border-faint resize-y outline-none focus:border-[var(--accent-primary)]"
          />

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <label className="text-[11.5px] text-text-muted flex items-center gap-1.5">
              {t("settings.feedback.category")}
              <select
                aria-label={t("settings.feedback.category")}
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                className="text-[12px] rounded-lg px-2 py-1 bg-surface text-text-primary border border-border-faint outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`settings.feedback.category.${c}`)}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={submit}
              disabled={!message.trim() || submitting}
              className="ml-auto inline-block text-[12px] px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--accent-fog)", color: "var(--accent-primary)" }}
            >
              {submitting ? t("settings.feedback.submitting") : t("settings.feedback.submit")}
            </button>
          </div>
        </div>

        {/* ── The caller's own feedback ───────────────────────────────── */}
        <div className="border-t border-border-faint px-5 py-4">
          <div className="text-[12px] font-medium text-text-primary mb-3">
            {t("settings.feedback.mine.title")}
          </div>

          {loadError ? (
            <div className="text-[11.5px] text-text-muted">{t("settings.feedback.loadError")}</div>
          ) : loading ? (
            <div className="text-[11.5px] text-text-muted">…</div>
          ) : items.length === 0 ? (
            <div className="text-[11.5px] text-text-muted">{t("settings.feedback.mine.empty")}</div>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((f) => (
                <li key={f.id} className="rounded-lg border border-border-faint px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10.5px] text-text-muted">
                      {t(`settings.feedback.category.${f.category}`)}
                    </span>
                    <StatusBadge status={f.status} t={t} />
                  </div>
                  <div className="text-[12.5px] text-text-primary whitespace-pre-wrap break-words">{f.message}</div>
                  {f.response && (
                    <div className="mt-2 pl-3 border-l-2" style={{ borderColor: "var(--accent-primary)" }}>
                      <div className="text-[10.5px] text-text-muted mb-0.5">
                        {t("settings.feedback.reply.label")}
                      </div>
                      <div className="text-[12px] text-text-primary whitespace-pre-wrap break-words">{f.response}</div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {isAdmin && <AdminFeedbackSection t={t} />}
    </div>
  );
}

/**
 * Admin triage: list every user's feedback, set a status, and write a reply the
 * submitter sees. Only rendered when the backend reports the caller is an admin
 * (LUMO_ADMIN_EMAILS), so a non-admin never mounts it and never calls the
 * admin-only endpoints.
 */
export function AdminFeedbackSection({ t }: { t: T }) {
  const [items, setItems] = useState<AdminFeedbackWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Per-item editable draft (status + reply), keyed by feedback id.
  const [drafts, setDrafts] = useState<Record<string, { status: FeedbackStatus; response: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminListFeedback()
      .then((all) => {
        if (!alive) return;
        setItems(all);
        setDrafts(
          Object.fromEntries(all.map((f) => [f.id, { status: f.status, response: f.response ?? "" }])),
        );
      })
      .catch(() => alive && setLoadError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  function setDraft(id: string, patch: Partial<{ status: FeedbackStatus; response: string }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function save(id: string) {
    const draft = drafts[id];
    if (!draft || savingId) return;
    setSavingId(id);
    try {
      const updated = await api.adminUpdateFeedback(id, {
        status: draft.status,
        // Empty textarea clears the reply (null); otherwise send the text.
        response: draft.response.trim() ? draft.response.trim() : null,
      });
      setItems((prev) => prev.map((f) => (f.id === id ? updated : f)));
      toast.success(t("settings.feedback.admin.saved"));
    } catch {
      toast.error(t("settings.feedback.admin.saveError"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-[15px] font-semibold text-text-primary mb-5">
        {t("settings.feedback.admin.title")}
      </h2>

      <div className="surface-card overflow-hidden">
        {loadError ? (
          <div className="px-5 py-4 text-[11.5px] text-text-muted">{t("settings.feedback.loadError")}</div>
        ) : loading ? (
          <div className="px-5 py-4 text-[11.5px] text-text-muted">…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-4 text-[11.5px] text-text-muted">{t("settings.feedback.admin.empty")}</div>
        ) : (
          <ul>
            {items.map((f) => {
              const draft = drafts[f.id] ?? { status: f.status, response: f.response ?? "" };
              return (
                <li key={f.id} className="border-t border-border-faint first:border-t-0 px-5 py-4">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[10.5px] text-text-muted">
                      {t(`settings.feedback.category.${f.category}`)}
                    </span>
                    <StatusBadge status={f.status} t={t} />
                    <span className="text-[10.5px] text-text-muted">
                      {t("settings.feedback.admin.from")}: {f.submitter.name || f.submitter.email || f.submitter.user_id}
                    </span>
                  </div>

                  <div className="text-[12.5px] text-text-primary whitespace-pre-wrap break-words mb-2.5">
                    {f.message}
                  </div>

                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <select
                      aria-label={`${t("settings.feedback.status.open")} — ${f.id}`}
                      value={draft.status}
                      onChange={(e) => setDraft(f.id, { status: e.target.value as FeedbackStatus })}
                      className="text-[12px] rounded-lg px-2 py-1 bg-surface text-text-primary border border-border-faint outline-none"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`settings.feedback.status.${s}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    aria-label={`${t("settings.feedback.reply.label")} — ${f.id}`}
                    placeholder={t("settings.feedback.admin.replyPlaceholder")}
                    value={draft.response}
                    onChange={(e) => setDraft(f.id, { response: e.target.value })}
                    rows={2}
                    maxLength={4000}
                    className="w-full text-[12.5px] rounded-lg px-3 py-2 bg-surface text-text-primary border border-border-faint resize-y outline-none focus:border-[var(--accent-primary)]"
                  />

                  <div className="mt-2 flex">
                    <button
                      type="button"
                      onClick={() => save(f.id)}
                      disabled={savingId === f.id}
                      className="ml-auto text-[12px] px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: "var(--accent-fog)", color: "var(--accent-primary)" }}
                    >
                      {savingId === f.id ? t("settings.feedback.admin.saving") : t("settings.feedback.admin.save")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
