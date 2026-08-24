# PRD · M1 — Task Search / 任务搜索

> Owner: Product Manager · Status: Draft · Milestone: M1
> Source: `docs/product/roadmap.md` → Near-Term → "Task search (full-text, within user's task list)"

这是用新角色流程跑通的**第一个里程碑**——范围小、纯增量、零数据迁移，适合做一次完整的"PM → Architect → Engineer → Reviewer → QA → Release"演习。

---

## 1. Problem & Why / 问题与价值

As the task list grows, users can't quickly find a specific task. Scrolling the Today view or the Matrix doesn't scale past a few dozen tasks. Search is the lowest-risk, highest-frequency utility that keeps the core "focus" loop fast.

任务变多后，用户无法快速定位某个任务。搜索是最高频、最低风险的查找能力，让核心专注循环保持顺畅。

**Out of scope (M1):** cross-field filters, saved searches, search across completed history older than current list, fuzzy/typo correction. Full-text within the user's **current task list** only.

---

## 2. Success Metrics / 成功指标

- **Performance:** search returns results in **< 150ms** for a list of 1,000 tasks (client-side) / **< 300ms** round-trip if server-backed.
- **Correctness:** 100% of tasks whose title or notes contain the query (case-insensitive) appear.
- **Adoption:** ≥ 20% of weekly-active users invoke search at least once in the first 2 weeks.

---

## 3. User Stories / 用户故事

### Story 1 — Search by title (P1, effort S)
**As a** user **I want to** type a query and see matching tasks **so that** I can jump to a task without scrolling.

**Acceptance Criteria**
- [ ] A search input is reachable from the main task views (Today / Matrix) within one interaction (icon or shortcut).
- [ ] Typing filters the visible tasks to those whose **title** contains the query, case-insensitive, updating as I type (debounced).
- [ ] Matching substring is visually indicated (highlight) in results.
- [ ] **Edge:** an empty query restores the full, unfiltered list.
- [ ] **Empty state:** a query with no matches shows a clear "no results" message (EN + ZH), not a blank area.

### Story 2 — Search also matches notes/description (P2, effort XS)
**As a** user **I want** search to also match a task's notes **so that** I find tasks I remember by detail, not title.

**Acceptance Criteria**
- [ ] Results include tasks whose **notes/description** contain the query, even if the title doesn't.
- [ ] **Edge:** a task matching in both title and notes appears once, not twice.
- [ ] Completed-vs-active scope is explicit and matches the view the user searched from.

### Story 3 — Clear & keyboard UX (P2, effort XS)
**As a** user **I want** to clear search quickly and drive it from the keyboard **so that** it stays out of my way.

**Acceptance Criteria**
- [ ] A visible clear (✕) control empties the query and restores the list; `Esc` does the same when the input is focused.
- [ ] Search input has loading/disabled state if results are fetched async (per `CLAUDE.md`).
- [ ] All new strings exist in both `en` and `zh` (`src/i18n/strings.ts`); UI uses CSS tokens only.

---

## 4. Open Questions for Architect / 待架构师裁决

These are **HOW** questions — PM flags, Architect decides (likely via a short ADR):

1. **Client-side vs server-backed search?** Current list lives in the store; client-side filtering may satisfy M1's metrics with zero API change. If server-backed, it touches `@lumo/contracts` (new query param/endpoint) → contract-first applies.
2. If server-backed: search as a query param on the existing task-list endpoint vs a dedicated search endpoint.
3. Debounce interval and minimum query length (UX detail, but affects perf metric).

> If client-side suffices, M1 needs **no contract change** — a clean first run of the role chain. If server-backed, the Architect lands the contract first.

---

## 5. Definition of Done / 完成定义

- [ ] All 3 stories' acceptance criteria pass as Playwright E2E (QA).
- [ ] Contract-first respected if any API changed (Architect).
- [ ] typecheck + lint + tests green; coverage ≥80% backend (if touched) / 100% new frontend behavior.
- [ ] Bilingual strings + CSS tokens + loading/empty states verified.
- [ ] Security pass: query input validated, no injection if server-backed (parameterized SQL).
- [ ] `CHANGELOG.md` + `docs/product/roadmap.md` updated (Release).
