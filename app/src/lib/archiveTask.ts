import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { updateTaskBlockMeta } from "./dayFile";
import {
  parseIndexDocument,
  serializeIndexDocument,
} from "./parseIndex";
import { joinPath } from "./path";
import { formatDateTime } from "./time";
import type { TaskSummary } from "./types";

export async function archiveTask(
  workspacePath: string,
  taskId: string,
): Promise<TaskSummary> {
  const indexPath = joinPath(workspacePath, "index.md");
  const doc = parseIndexDocument(await readTextFile(indexPath));
  const idx = doc.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) throw new Error(`索引中找不到任务 ${taskId}`);

  const task = doc.tasks[idx];
  if (task.archived || task.status === "archived") {
    throw new Error("任务已归档");
  }

  const now = formatDateTime(new Date());
  const dayPath = joinPath(workspacePath, ...task.file.split("/"));
  const dayMd = await readTextFile(dayPath);
  const updatedDay = updateTaskBlockMeta(dayMd, taskId, {
    status: "archived",
    archived: true,
    archivedAt: now,
    updated: now,
  });
  await writeTextFile(dayPath, updatedDay);

  const updated: TaskSummary = {
    ...task,
    status: "archived",
    archived: true,
  };
  doc.tasks[idx] = updated;
  await writeTextFile(indexPath, serializeIndexDocument(doc));
  return updated;
}
