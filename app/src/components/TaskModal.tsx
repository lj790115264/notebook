import { useCallback, useEffect, useState } from "react";
import { allocateTaskId } from "../lib/allocateTaskId";
import { createTask } from "../lib/createTask";
import { loadTaskDetail, updateTask } from "../lib/updateTask";
import { BodyEditor } from "./BodyEditor";

export type TaskModalMode =
  | { kind: "create" }
  | { kind: "edit"; taskId: string };

interface TaskModalProps {
  workspace: string;
  mode: TaskModalMode;
  onClose: () => void;
  onSaved: () => void;
}

export function TaskModal({
  workspace,
  mode,
  onClose,
  onSaved,
}: TaskModalProps) {
  const editingId = mode.kind === "edit" ? mode.taskId : null;
  const [draftTaskId, setDraftTaskId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(mode.kind === "edit");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode.kind !== "edit") {
      setBody("");
      setDraftTaskId(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { body: taskBody } = await loadTaskDetail(
          workspace,
          mode.taskId,
        );
        if (!cancelled) {
          setBody(taskBody);
          setDraftTaskId(null);
        }
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setError(`打开失败：${message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace, mode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const ensureDraftTaskId = useCallback(async () => {
    if (editingId) return editingId;
    if (draftTaskId) return draftTaskId;
    const id = await allocateTaskId(workspace);
    setDraftTaskId(id);
    return id;
  }, [workspace, editingId, draftTaskId]);

  async function onSave() {
    if (saving || loading) return;
    setError(null);
    setSaving(true);
    try {
      // Scheme A: no UI for title/due — keep due empty, auto title from body.
      if (editingId) {
        await updateTask(workspace, editingId, {
          title: "",
          due: "",
          body,
        });
      } else {
        await createTask(workspace, {
          title: "",
          due: "",
          body,
          id: draftTaskId ?? undefined,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        <header className="modal-header">
          <h2 id="task-modal-title">
            {editingId ? "编辑待办" : "新建待办"}
          </h2>
          <button
            type="button"
            className="modal-close"
            disabled={saving}
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        <div className="modal-body">
          {loading ? (
            <p className="muted">加载中…</p>
          ) : (
            <div className="field">
              <span>正文（必填，可贴图）</span>
              <BodyEditor
                workspace={workspace}
                taskId={editingId ?? draftTaskId}
                ensureTaskId={ensureDraftTaskId}
                value={body}
                onChange={setBody}
                rows={8}
              />
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>
        <footer className="modal-footer">
          <button type="button" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving || loading}
            onClick={() => void onSave()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </footer>
      </div>
    </div>
  );
}
