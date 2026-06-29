import { useState, type KeyboardEvent } from "react";
import { IconClose } from "@/components/icons";

const MAX_TAGS = 20;
const MAX_LEN = 30;

/**
 * Normalize a raw tag: trim and clamp to the contract's 30-char cap. Returns
 * "" for anything empty so callers can drop it.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().slice(0, MAX_LEN);
}

/**
 * Add `raw` to `tags`, returning a new array. No-ops (returns the same array
 * reference semantics aside) when the tag is empty, a case-insensitive
 * duplicate, or the list is already at the cap — mirroring the server's bounds
 * so the UI never offers a state the backend would reject.
 */
export function addTag(tags: string[], raw: string): string[] {
  const t = normalizeTag(raw);
  if (!t) return tags;
  if (tags.length >= MAX_TAGS) return tags;
  if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) return tags;
  return [...tags, t];
}

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  /** Optional label id for the input (accessibility). */
  inputAriaLabel?: string;
}

/**
 * A controlled chips input: type a tag and press Enter or comma to add it,
 * click ✕ to remove, or Backspace on an empty field to drop the last one.
 */
export function TagInput({ tags, onChange, placeholder, inputAriaLabel }: Props) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const next = addTag(tags, raw);
    if (next !== tags) onChange(next);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) commit(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function remove(tag: string) {
    onChange(tags.filter((x) => x !== tag));
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-lg bg-elevated border border-border-faint focus-within:border-accent-edge transition-colors"
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-medium"
          style={{
            color: "var(--accent-primary)",
            background: "var(--accent-fog)",
            border: "1px solid var(--accent-edge)",
          }}
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            aria-label={`Remove tag ${tag}`}
            className="opacity-70 hover:opacity-100 transition-opacity"
          >
            <IconClose size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={tags.length === 0 ? placeholder : ""}
        aria-label={inputAriaLabel}
        maxLength={MAX_LEN}
        className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-[13px] text-text-primary placeholder:text-text-faint py-0.5"
      />
    </div>
  );
}
