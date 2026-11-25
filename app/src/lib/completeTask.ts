import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { updateTaskBlockMeta } from "./dayFile";
import {
  parseIndexDocument,
  serializeIndexDocument,
} from "./parseIndex";
import { joinPath } from "./path";
import { formatDateTime } from "./time";
import type { TaskSummary } from "./types";

export async function completeTask(
  workspacePath: string,
  taskId: string,
): Promise<TaskSummary> {
  return setTaskCompletion(workspacePath, taskId, "done");
}

export async function uncompleteTask(
  workspacePath: string,
  taskId: string,
): Promise<TaskSummary> {
  return setTaskCompletion(workspacePath, taskId, "pending");
}

async function setTaskCompletion(
  workspacePath: string,
  taskId: string,
  status: "done" | "pending",
): Promise<TaskSummary> {
  const indexPath = joinPath(workspacePath, "index.md");
  const indexMd = await readTextFile(indexPath);
  const doc = parseIndexDocument(indexMd);
  const idx = doc.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) {
    throw new Error(`索引中找不到任务 ${taskId}`);
  }

  const task = doc.tasks[idx];
  if (task.archived) {
    throw new Error("已归档任务不能更改完成状态");
  }

  const now = formatDateTime(new Date());
  const completed = status === "done" ? now : "";

  const dayPath = joinPath(workspacePath, ...task.file.split("/"));
  const dayMd = await readTextFile(dayPath);
  const updatedDay = updateTaskBlockMeta(dayMd, taskId, {
    status,
    completed,
    updated: now,
  });
  await writeTextFile(dayPath, updatedDay);

  const updated: TaskSummary = {
    ...task,
    status,
    completed,
  };
  doc.tasks[idx] = updated;
  await writeTextFile(indexPath, serializeIndexDocument(doc));
  return updated;
}
