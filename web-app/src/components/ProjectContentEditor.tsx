import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useT } from "@/i18n/useT";
import { toast } from "@/store/useToastStore";
import { compressImageToDataUrl } from "@/lib/imageCompress";
import { IconImage, IconBold, IconItalic, IconHeading, IconList, IconQuote } from "@/components/icons";

interface Props {
  /** Stored content: a TipTap doc JSON string, or legacy plain text. */
  value?: string;
  onChange: (json: string) => void;
  /** When false, render read-only (no toolbar, no border) — a display state. */
  editable?: boolean;
  /**
   * Fill the parent's height with a roomy writing area and larger text (the
   * notes modal). The parent must give the editor a height.
   */
  fill?: boolean;
}

/** Parse stored content into something useEditor accepts. Tolerates legacy plain
 * text (pre-#215 projects stored a raw string) by wrapping it in a paragraph. */
function parseContent(value?: string): object | string {
  if (!value) return "";
  try {
    const doc = JSON.parse(value);
    if (doc && typeof doc === "object" && doc.type === "doc") return doc;
  } catch {
    // not JSON → legacy plain text
  }
  return value;
}

export function ProjectContentEditor({ value, onChange, editable = true, fill = false }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The serialised doc waiting for the debounce; flushed on unmount so closing
  // the notes right after typing never drops the last edit.
  const pending = useRef<string | null>(null);
  // Latest onChange in a ref so the (once-created) onUpdate handler never calls
  // a stale callback — important because the editor instance is reused across
  // display ↔ edit toggles rather than remounted.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: parseContent(value),
    onUpdate: ({ editor }) => {
      // Debounce: serialize the doc to JSON 600ms after the last keystroke.
      pending.current = JSON.stringify(editor.getJSON());
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const json = pending.current;
        pending.current = null;
        if (json !== null) onChangeRef.current(json);
      }, 600);
    },
  });

  // Keep TipTap's editable flag and the rendered doc in sync with props when
  // toggling display ↔ edit or switching projects.
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Save what is still waiting instead of dropping it.
    if (pending.current !== null) {
      const json = pending.current;
      pending.current = null;
      onChangeRef.current(json);
    }
  }, []);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !editor) return;
    const dataUrl = await compressImageToDataUrl(file).catch(() => null);
    if (!dataUrl) {
      toast.error(t("project.editor.imageTooLarge"));
      return;
    }
    editor.chain().focus().setImage({ src: dataUrl }).run();
  }

  if (!editor) return null;

  // Display state: just the rendered doc, no chrome.
  if (!editable) {
    return <EditorContent editor={editor} className="tiptap-content text-sm" />;
  }

  return (
    <div
      className={`rounded-lg ${fill ? "flex flex-col h-full min-h-0" : ""}`}
      style={{ border: "1px solid var(--border-default)" }}
    >
      <div className="flex flex-shrink-0 items-center gap-0.5 px-2 py-1.5 border-b" style={{ borderColor: "var(--border-faint)" }}>
        <ToolBtn editor={editor} label={t("project.editor.bold")} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><IconBold size={14} /></ToolBtn>
        <ToolBtn editor={editor} label={t("project.editor.italic")} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><IconItalic size={14} /></ToolBtn>
        <ToolBtn editor={editor} label={t("project.editor.heading")} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><IconHeading size={14} /></ToolBtn>
        <ToolBtn editor={editor} label={t("project.editor.bulletList")} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><IconList size={14} /></ToolBtn>
        <ToolBtn editor={editor} label={t("project.editor.quote")} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><IconQuote size={14} /></ToolBtn>
        <div className="w-px h-4 mx-1" style={{ background: "var(--border-default)" }} />
        <ToolBtn editor={editor} label={t("project.editor.image")} active={false} onClick={() => fileRef.current?.click()}><IconImage size={14} /></ToolBtn>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
      </div>
      <EditorContent
        editor={editor}
        className={
          fill
            ? "tiptap-content tiptap-content--fill flex-1 min-h-0 overflow-y-auto px-5 py-4 text-[15px] leading-relaxed"
            : "tiptap-content px-3 py-2.5 text-sm"
        }
        // Clicking the empty space below the text still puts the caret in it.
        onClick={fill ? () => { if (!editor.isFocused) editor.chain().focus("end").run(); } : undefined}
      />
    </div>
  );
}

function ToolBtn({ label, active, onClick, children }: { editor: Editor; label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className="flex items-center justify-center w-7 h-7 rounded transition-colors"
      style={{
        color: active ? "var(--accent-primary)" : "var(--text-secondary)",
        background: active ? "var(--accent-fog)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}
