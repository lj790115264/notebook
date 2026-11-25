import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView, placeholder as cmPlaceholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  listBodyImages,
  mimeToExt,
  readAttachmentBytes,
  savePastedImage,
} from "../lib/attachments";

interface BodyEditorProps {
  workspace: string;
  /** Existing or draft task id; parent allocates on first paste if null. */
  taskId: string | null;
  ensureTaskId: () => Promise<string>;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
}

/** Heading / emphasis look larger while still editing source (`###` stays). */
const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.45em", fontWeight: "700", color: "#1c1917" },
  { tag: tags.heading2, fontSize: "1.3em", fontWeight: "700", color: "#1c1917" },
  { tag: tags.heading3, fontSize: "1.15em", fontWeight: "650", color: "#292524" },
  { tag: tags.heading4, fontSize: "1.05em", fontWeight: "600", color: "#292524" },
  { tag: tags.heading5, fontWeight: "600", color: "#44403c" },
  { tag: tags.heading6, fontWeight: "600", color: "#57534e" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#1d4ed8" },
  { tag: tags.url, color: "#78716c" },
  {
    tag: tags.monospace,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#9f1239",
  },
  { tag: tags.meta, color: "#a8a29e" },
]);

/** Single `# ` at line start collides with day-file task blocks (`# task-id`). `##`+ is fine. */
const HAS_H1_LINE = /^#\s/m;

export function BodyEditor({
  workspace,
  taskId,
  ensureTaskId,
  value,
  onChange,
  rows = 5,
  placeholder,
}: BodyEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const onChangeRef = useRef(onChange);
  const taskIdRef = useRef(taskId);
  const ensureTaskIdRef = useRef(ensureTaskId);
  const valueRef = useRef(value);
  const workspaceRef = useRef(workspace);
  const setPasteErrorRef = useRef<(msg: string | null) => void>(() => {});

  onChangeRef.current = onChange;
  taskIdRef.current = taskId;
  ensureTaskIdRef.current = ensureTaskId;
  valueRef.current = value;
  workspaceRef.current = workspace;

  const [pasteError, setPasteError] = useState<string | null>(null);
  /** 当前放大查看的图片（点击缩略图打开，点击任意处关闭）。 */
  const [zoom, setZoom] = useState<{ alt: string; url: string } | null>(null);
  const [previews, setPreviews] = useState<
    { mdPath: string; alt: string; url: string }[]
  >([]);
  setPasteErrorRef.current = setPasteError;

  // 放大视图：Esc 关闭
  useEffect(() => {
    if (!zoom) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setZoom(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom]);

  const imageRefs = useMemo(() => listBodyImages(value), [value]);
  const riskyH1 = HAS_H1_LINE.test(value);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    void (async () => {
      const next: { mdPath: string; alt: string; url: string }[] = [];
      for (const img of imageRefs) {
        try {
          const bytes = await readAttachmentBytes(workspace, img.mdPath);
          const ext = img.mdPath.split(".").pop()?.toLowerCase() || "png";
          const mime =
            ext === "jpg" || ext === "jpeg"
              ? "image/jpeg"
              : ext === "webp"
                ? "image/webp"
                : ext === "gif"
                  ? "image/gif"
                  : "image/png";
          const blob = new Blob([bytes.slice()], { type: mime });
          const url = URL.createObjectURL(blob);
          urls.push(url);
          next.push({ mdPath: img.mdPath, alt: img.alt, url });
        } catch {
          // missing file — skip preview
        }
      }
      if (!cancelled) setPreviews(next);
    })();

    return () => {
      cancelled = true;
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [workspace, imageRefs]);

  function insertAtCursor(snippet: string) {
    const view = cmRef.current?.view;
    if (!view) {
      const cur = valueRef.current;
      const sep = cur && !cur.endsWith("\n") ? "\n" : "";
      onChangeRef.current(`${cur}${sep}${snippet}\n`);
      return;
    }
    const { from, to } = view.state.selection.main;
    const before = view.state.sliceDoc(0, from);
    const after = view.state.sliceDoc(to);
    const needNlBefore =
      before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const needNlAfter = after.startsWith("\n") ? "" : "\n";
    const insert = `${needNlBefore}${snippet}${needNlAfter}`;
    const cursor = from + insert.length;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: cursor },
      scrollIntoView: true,
    });
    view.focus();
  }

  const insertAtCursorRef = useRef(insertAtCursor);
  insertAtCursorRef.current = insertAtCursor;

  const extensions = useMemo(() => {
    const minHeight = `${Math.max(rows, 3) * 1.55}rem`;
    return [
      markdown(),
      syntaxHighlighting(mdHighlight),
      cmPlaceholder(
        placeholder ??
          "多行说明；可用 ## / ### 设标题（勿用行首单个 #）；Ctrl+V 粘贴截图",
      ),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          minHeight,
          fontSize: "0.95rem",
          color: "#1c1917",
          backgroundColor: "#fff",
        },
        ".cm-content": {
          fontFamily: "inherit",
          padding: "0.45rem 0.6rem",
          caretColor: "#1c1917",
        },
        ".cm-scroller": {
          fontFamily: "inherit",
          lineHeight: "1.55",
          overflow: "auto",
        },
        "&.cm-focused": {
          outline: "none",
        },
        ".cm-gutters": { display: "none" },
        ".cm-activeLine": { backgroundColor: "transparent" },
      }),
      EditorView.domEventHandlers({
        paste(event) {
          const cd = event.clipboardData;
          if (!cd) return false;
          let hasImage = false;
          for (const item of cd.items) {
            if (item.type.startsWith("image/")) {
              hasImage = true;
              break;
            }
          }
          if (!hasImage) return false;
          event.preventDefault();

          void (async () => {
            setPasteErrorRef.current(null);
            try {
              let imageItem: DataTransferItem | null = null;
              for (const item of cd.items) {
                if (item.type.startsWith("image/")) {
                  imageItem = item;
                  break;
                }
              }
              if (!imageItem) return;
              const file = imageItem.getAsFile();
              if (!file) throw new Error("无法读取剪贴板图片");
              const buf = new Uint8Array(await file.arrayBuffer());
              const id =
                taskIdRef.current ?? (await ensureTaskIdRef.current());
              const { mdSnippet } = await savePastedImage(
                workspaceRef.current,
                id,
                buf,
                mimeToExt(file.type || "image/png"),
              );
              insertAtCursorRef.current(mdSnippet);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              setPasteErrorRef.current(`贴图失败：${message}`);
            }
          })();
          return true;
        },
      }),
    ];
  }, [rows, placeholder]);

  return (
    <div className="body-editor">
      <div className="body-editor-cm">
        <CodeMirror
          ref={cmRef}
          value={value}
          height="auto"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightSelectionMatches: false,
            bracketMatching: false,
          }}
          extensions={extensions}
          onChange={(next) => onChange(next)}
        />
      </div>
      <p className="hint">
        Markdown 边写边出样式；支持 Ctrl+V 粘贴图片；点击下方预览可放大（大图右键可复制）
      </p>
      {riskyH1 && (
        <p className="error">
          正文行首请勿使用单个「# 」（与日文件任务块冲突）；标题请从 ## 开始
        </p>
      )}
      {pasteError && <p className="error">{pasteError}</p>}
      {previews.length > 0 && (
        <div className="image-previews">
          {previews.map((p) => (
            <button
              key={p.mdPath}
              type="button"
              className="image-preview"
              title="点击放大查看"
              onClick={() => setZoom({ alt: p.alt, url: p.url })}
            >
              <img src={p.url} alt={p.alt} />
            </button>
          ))}
        </div>
      )}
      {zoom && (
        <div
          className="img-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="图片放大查看"
          onClick={() => setZoom(null)}
        >
          <img src={zoom.url} alt={zoom.alt} title="点击任意位置关闭；右键可复制图片" />
        </div>
      )}
    </div>
  );
}
