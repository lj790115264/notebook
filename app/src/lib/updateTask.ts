import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { findTaskBlock, updateTaskBlockMeta } from "./dayFile";
import {
  parseIndexDocument,
  serializeIndexDocument,
} from "./parseIndex";
import { joinPath } from "./path";
import { formatDateTime } from "./time";
import { assertBodyRequired, resolveTitle } from "./title";
import type { TaskSummary } from "./types";

export interface UpdateTaskInput {
  title: string;
  due: string;
  body: string;
}

export async function loadTaskDetail(
  workspacePath: string,
  taskId: string,
): Promise<{ summary: TaskSummary; body: string }> {
  const indexPath = joinPath(workspacePath, "index.md");
  const doc = parseIndexDocument(await readTextFile(indexPath));
  const summary = doc.tasks.find((t) => t.id === taskId);
  if (!summary) throw new Error(`索引中找不到任务 ${taskId}`);
  if (summary.archived) throw new Error("已归档任务不可编辑");

  const dayPath = joinPath(workspacePath, ...summary.file.split("/"));
  const dayMd = await readTextFile(dayPath);
  const { parsed } = findTaskBlock(dayMd, taskId);
  return { summary, body: parsed.body };
}

export async function updateTask(
  workspacePath: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskSummary> {
  const body = assertBodyRequired(input.body);
  const title = resolveTitle(input.title, body);
  const due = input.due.trim();
  const now = formatDateTime(new Date());

  const indexPath = joinPath(workspacePath, "index.md");
  const doc = parseIndexDocument(await readTextFile(indexPath));
  const idx = doc.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) throw new Error(`索引中找不到任务 ${taskId}`);

  const task = doc.tasks[idx];
  if (task.archived) throw new Error("已归档任务不可编辑");

  const dayPath = joinPath(workspacePath, ...task.file.split("/"));
  const dayMd = await readTextFile(dayPath);
  const updatedDay = updateTaskBlockMeta(dayMd, taskId, {
    title,
    due,
    body,
    updated: now,
  });
  await writeTextFile(dayPath, updatedDay);

  const updated: TaskSummary = {
    ...task,
    title,
    due,
  };
  doc.tasks[idx] = updated;
  await writeTextFile(indexPath, serializeIndexDocument(doc));
  return updated;
}
