import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { bodyListPreview } from "./bodyPreview";
import { ensureWorkspaceInitialized } from "./initWorkspace";
import { parseTasksFromIndex } from "./parseIndex";
import { joinPath } from "./path";
import { completedLocalDate, formatDate, weekRange } from "./time";
import type { TaskSummary } from "./types";
import { loadTaskDetail } from "./updateTask";

export { joinPath } from "./path";

export type DoneFilter = "today" | "week" | "all";
export type ListTab = "pending" | DoneFilter;

export type TaskListItem = TaskSummary & { preview: string };

const LAST_WORKSPACE_KEY = "local-todo.lastWorkspace";

export function getRememberedWorkspace(): string | null {
  return localStorage.getItem(LAST_WORKSPACE_KEY);
}

export function rememberWorkspace(path: string) {
  localStorage.setItem(LAST_WORKSPACE_KEY, path);
}

export function clearRememberedWorkspace() {
  localStorage.removeItem(LAST_WORKSPACE_KEY);
}

export async function pickWorkspaceFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择工作区文件夹",
  });
  if (selected === null) return null;
  return typeof selected === "string" ? selected : selected[0] ?? null;
}

export async function loadPendingTasks(
  workspacePath: string,
): Promise<TaskSummary[]> {
  await ensureWorkspaceInitialized(workspacePath);
  const indexPath = joinPath(workspacePath, "index.md");
  const markdown = await readTextFile(indexPath);
  return parseTasksFromIndex(markdown)
    .filter((t) => t.status === "pending" && !t.archived)
    .sort(comparePending);
}

export async function loadDoneTasks(
  workspacePath: string,
  filter: DoneFilter,
  now: Date = new Date(),
): Promise<TaskSummary[]> {
  await ensureWorkspaceInitialized(workspacePath);
  const indexPath = joinPath(workspacePath, "index.md");
  const markdown = await readTextFile(indexPath);
  const today = formatDate(now);
  const { start, end } = weekRange(now);

  return parseTasksFromIndex(markdown)
    .filter((t) => t.status === "done" && !t.archived)
    .filter((t) => {
      const d = completedLocalDate(t.completed);
      if (!d) return false;
      if (filter === "all") return true;
      if (filter === "today") return d === today;
      return d >= start && d <= end;
    })
    .sort((a, b) => b.completed.localeCompare(a.completed));
}

/** Due ascending; empty due last; same due by created ascending. */
function comparePending(a: TaskSummary, b: TaskSummary): number {
  const aDue = a.due.trim();
  const bDue = b.due.trim();
  if (aDue && bDue) {
    const byDue = aDue.localeCompare(bDue);
    if (byDue !== 0) return byDue;
  } else if (aDue && !bDue) return -1;
  else if (!aDue && bDue) return 1;
  return a.created.localeCompare(b.created);
}

export async function loadPendingList(
  workspacePath: string,
): Promise<TaskListItem[]> {
  return attachPreviews(workspacePath, await loadPendingTasks(workspacePath));
}

export async function loadDoneList(
  workspacePath: string,
  filter: DoneFilter,
  now: Date = new Date(),
): Promise<TaskListItem[]> {
  return attachPreviews(
    workspacePath,
    await loadDoneTasks(workspacePath, filter, now),
  );
}

async function attachPreviews(
  workspacePath: string,
  tasks: TaskSummary[],
): Promise<TaskListItem[]> {
  return Promise.all(
    tasks.map(async (task) => {
      try {
        const { body } = await loadTaskDetail(workspacePath, task.id);
        return { ...task, preview: bodyListPreview(body) };
      } catch {
        return {
          ...task,
          preview: task.title.trim() || "（无法加载正文）",
        };
      }
    }),
  );
}
