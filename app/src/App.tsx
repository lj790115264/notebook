import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ExitPrompt } from "./components/ExitPrompt";
import { TaskModal, type TaskModalMode } from "./components/TaskModal";
import { TaskPreview } from "./components/TaskPreview";
import { WorkspaceMenu } from "./components/WorkspaceMenu";
import { ArchiveIcon, CheckIcon, PlusIcon, UndoIcon } from "./components/icons";
import { archiveTask } from "./lib/archiveTask";
import { cleanupExpiredArchives } from "./lib/cleanupArchive";
import { completeTask, uncompleteTask } from "./lib/completeTask";
import {
  getRememberedWorkspace,
  loadDoneList,
  loadPendingList,
  pickWorkspaceFolder,
  rememberWorkspace,
  type DoneFilter,
  type ListTab,
  type TaskListItem,
} from "./lib/workspace";
import "./App.css";

function App() {
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>("pending");
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [modal, setModal] = useState<TaskModalMode | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [archiveMenu, setArchiveMenu] = useState<
    { x: number; y: number; taskId: string } | null
  >(null);
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const archiveMenuRef = useRef<HTMLDivElement>(null);

  // 窗口关闭被 Rust 侧拦截后转发到这里，弹出「放入后台 / 直接关闭」提示
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen("close-requested", () => setExitPromptOpen(true)).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // 右键归档菜单：点击外部 / Esc / 滚动时关闭
  useEffect(() => {
    if (!archiveMenu) return;
    function onDoc(e: MouseEvent) {
      if (!archiveMenuRef.current?.contains(e.target as Node)) {
        setArchiveMenu(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setArchiveMenu(null);
    }
    function onScroll() {
      setArchiveMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [archiveMenu]);

  function openArchiveMenu(e: React.MouseEvent, taskId: string) {
    e.preventDefault();
    setArchiveMenu({
      x: Math.min(e.clientX, window.innerWidth - 150),
      y: Math.min(e.clientY, window.innerHeight - 80),
      taskId,
    });
  }

  const refresh = useCallback(async (path: string, currentTab: ListTab) => {
    setLoading(true);
    setError(null);
    try {
      // 归档满 7 天的任务在加载前清理（失败不阻塞列表加载）
      await cleanupExpiredArchives(path).catch((e) =>
        console.warn("归档清理失败：", e),
      );
      if (currentTab === "pending") {
        setTasks(await loadPendingList(path));
      } else {
        setTasks(await loadDoneList(path, currentTab));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`加载失败：${message}`);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const remembered = getRememberedWorkspace();
    if (!remembered) {
      setBooting(false);
      return;
    }
    void (async () => {
      setWorkspace(remembered);
      rememberWorkspace(remembered);
      try {
        await cleanupExpiredArchives(remembered).catch((e) =>
          console.warn("归档清理失败：", e),
        );
        setTasks(await loadPendingList(remembered));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(`加载失败：${message}`);
      }
      setBooting(false);
    })();
  }, []);

  useEffect(() => {
    if (!workspace || booting) return;
    void refresh(workspace, tab);
  }, [tab, workspace, booting, refresh]);

  async function onChooseWorkspace() {
    const path = await pickWorkspaceFolder();
    if (!path) return;
    setModal(null);
    setTab("pending");
    setWorkspace(path);
    rememberWorkspace(path);
    await refresh(path, "pending");
  }

  async function onComplete(taskId: string) {
    if (!workspace || actingId) return;
    setActingId(taskId);
    setError(null);
    try {
      await completeTask(workspace, taskId);
      if (modal?.kind === "edit" && modal.taskId === taskId) setModal(null);
      await refresh(workspace, tab);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`操作失败：${message}`);
    } finally {
      setActingId(null);
    }
  }

  async function onUncomplete(taskId: string) {
    if (!workspace || actingId) return;
    setActingId(taskId);
    setError(null);
    try {
      await uncompleteTask(workspace, taskId);
      if (modal?.kind === "edit" && modal.taskId === taskId) setModal(null);
      await refresh(workspace, tab);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`操作失败：${message}`);
    } finally {
      setActingId(null);
    }
  }

  async function onArchive(taskId: string) {
    if (!workspace || actingId) return;
    if (!window.confirm("确定移入归档？归档后将从常规列表移除。")) return;
    setActingId(taskId);
    setError(null);
    try {
      await archiveTask(workspace, taskId);
      if (modal?.kind === "edit" && modal.taskId === taskId) setModal(null);
      await refresh(workspace, tab);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`归档失败：${message}`);
    } finally {
      setActingId(null);
    }
  }

  if (booting) {
    return (
      <main className="app">
        <p className="muted">正在打开上次工作区…</p>
      </main>
    );
  }

  if (!workspace) {
    return (
      <main className="app setup">
        <h1>NoteBook</h1>
        <p>
          首次使用请选择一个文件夹作为工作区（可直接选仓库里的 sample-data）。
        </p>
        <button
          type="button"
          className="primary"
          onClick={() => void onChooseWorkspace()}
        >
          选择文件夹
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const isPending = tab === "pending";

  return (
    <main className="app app-shell">
      <header className="topbar">
        <WorkspaceMenu
          workspace={workspace}
          loading={loading}
          onSwitch={() => void onChooseWorkspace()}
          onRefresh={() => void refresh(workspace, tab)}
        />
        <button
          type="button"
          className="primary icon-btn new-task-btn"
          title="新建待办"
          aria-label="新建"
          onClick={() => setModal({ kind: "create" })}
        >
          <PlusIcon size={16} />
        </button>
      </header>

      <section className="list-area">
        <nav className="tabs" aria-label="列表视图">
          <TabButton
            active={tab === "pending"}
            onClick={() => setTab("pending")}
          >
            待处理
          </TabButton>
          <span className="tabs-label">已处理</span>
          {(
            [
              ["today", "本日"],
              ["week", "本周"],
              ["all", "全部"],
            ] as const
          ).map(([id, label]) => (
            <TabButton
              key={id}
              active={tab === id}
              onClick={() => setTab(id as DoneFilter)}
            >
              {label}
            </TabButton>
          ))}
        </nav>

        <div className="panel list-panel">
          <h2>{listHeading(tab)}</h2>
          {error && <p className="error">{error}</p>}
          {!error && tasks.length === 0 && (
            <p className="muted">
              {isPending ? "暂无待处理事项" : "暂无已处理事项"}
            </p>
          )}
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id}>
                <div className="task-row">
                  <button
                    type="button"
                    className="task-card"
                    onContextMenu={(e) => openArchiveMenu(e, task.id)}
                    onClick={() =>
                      setModal({ kind: "edit", taskId: task.id })
                    }
                  >
                    <TaskPreview text={task.preview} />
                  </button>
                  <div className="task-actions">
                    {isPending ? (
                      <button
                        type="button"
                        className="icon-btn"
                        title="标记完成"
                        aria-label="完成"
                        disabled={actingId === task.id}
                        onClick={() => void onComplete(task.id)}
                      >
                        <CheckIcon />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn"
                        title="撤销完成"
                        aria-label="撤销"
                        disabled={actingId === task.id}
                        onClick={() => void onUncomplete(task.id)}
                      >
                        <UndoIcon />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {archiveMenu && (
        <div
          ref={archiveMenuRef}
          className="context-menu"
          role="menu"
          style={{ left: archiveMenu.x, top: archiveMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="danger"
            disabled={actingId === archiveMenu.taskId}
            onClick={() => {
              const taskId = archiveMenu.taskId;
              setArchiveMenu(null);
              void onArchive(taskId);
            }}
          >
            <ArchiveIcon />
            归档
          </button>
        </div>
      )}

      {exitPromptOpen && (
        <ExitPrompt onBackground={() => setExitPromptOpen(false)} />
      )}

      {modal && (
        <TaskModal
          workspace={workspace}
          mode={modal}
          onClose={() => setModal(null)}
          onSaved={() => void refresh(workspace, tab)}
        />
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "tab active" : "tab"}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </button>
  );
}

function listHeading(tab: ListTab): string {
  switch (tab) {
    case "pending":
      return "待处理";
    case "today":
      return "已处理 · 本日";
    case "week":
      return "已处理 · 本周";
    case "all":
      return "已处理 · 全部";
  }
}

export default App;
