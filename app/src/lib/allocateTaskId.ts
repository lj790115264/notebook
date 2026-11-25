import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { parseIndexDocument } from "./parseIndex";
import { joinPath } from "./path";
import { formatDate } from "./time";
import type { TaskSummary } from "./types";

/** Peek next task id for today without writing (for draft image paste). */
export async function allocateTaskId(workspacePath: string): Promise<string> {
  const date = formatDate(new Date());
  const dayPath = joinPath(workspacePath, "days", `${date}.md`);
  const indexPath = joinPath(workspacePath, "index.md");
  const doc = parseIndexDocument(await readTextFile(indexPath));
  const dayExisting = (await exists(dayPath))
    ? await readTextFile(dayPath)
    : "";
  return nextTaskId(date, doc.tasks, dayExisting);
}

export function nextTaskId(
  date: string,
  tasks: TaskSummary[],
  dayMarkdown: string,
): string {
  const ymd = date.replace(/-/g, "");
  const prefix = `task-${ymd}-`;
  let max = 0;
  const consider = (id: string) => {
    if (!id.startsWith(prefix)) return;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  };
  for (const t of tasks) consider(t.id);
  for (const m of dayMarkdown.matchAll(/^#{1,2}\s+(task-\d+-\d+)\s*$/gm)) {
    consider(m[1]);
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
