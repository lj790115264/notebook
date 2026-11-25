import { useEffect, useRef, useState } from "react";

interface WorkspaceMenuProps {
  workspace: string;
  loading: boolean;
  onSwitch: () => void;
  onRefresh: () => void;
}

export function WorkspaceMenu({
  workspace,
  loading,
  onSwitch,
  onRefresh,
}: WorkspaceMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="workspace-menu" ref={rootRef}>
      <button
        type="button"
        className="workspace-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        title={workspace}
        onClick={() => setOpen((v) => !v)}
      >
        工作区
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="workspace-menu-panel" role="menu">
          <p className="workspace-menu-path" title={workspace}>
            {workspace}
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSwitch();
            }}
          >
            切换工作区
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={loading}
            onClick={() => {
              setOpen(false);
              onRefresh();
            }}
          >
            {loading ? "刷新中…" : "刷新"}
          </button>
        </div>
      )}
    </div>
  );
}
