import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { nextTaskId } from "./allocateTaskId";
import {
  parseIndexDocument,
  serializeIndexDocument,
} from "./parseIndex";
import { joinPath } from "./path";
import { formatDate, formatDateTime } from "./time";
import { assertBodyRequired, resolveTitle } from "./title";
import type { TaskSummary } from "./types";

export interface CreateTaskInput {
  title: string;
  due: string;
  body: string;
  /** Pre-allocated id (e.g. after pasting images on a new task). */
  id?: string;
}

export async function createTask(
  workspacePath: string,
  input: CreateTaskInput,
): Promise<TaskSummary> {
  const body = assertBodyRequired(input.body);
  const title = resolveTitle(input.title, body);
  const due = input.due.trim();

  const now = new Date();
  const date = formatDate(now);
  const created = formatDateTime(now);
  const dayRel = `days/${date}.md`;
  const dayPath = joinPath(workspacePath, "days", `${date}.md`);
  const indexPath = joinPath(workspacePath, "index.md");

  const indexMd = await readTextFile(indexPath);
  const doc = parseIndexDocument(indexMd);
  const dayExisting = (await exists(dayPath))
    ? await readTextFile(dayPath)
    : "";
  const id = input.id?.trim() || nextTaskId(date, doc.tasks, dayExisting);
  if (doc.tasks.some((t) => t.id === id)) {
    throw new Error(`任务 id 已存在：${id}`);
  }

  const block = formatTaskBlock({
    id,
    title,
    due,
    created,
    body,
  });

  if (dayExisting) {
    const sep = dayExisting.endsWith("\n") ? "\n" : "\n\n";
    await writeTextFile(
      dayPath,
      dayExisting.replace(/\s*$/, "") + sep + block + "\n",
    );
  } else {
    await writeTextFile(dayPath, `# ${date}\n\n${block}\n`);
  }

  const summary: TaskSummary = {
    id,
    status: "pending",
    title,
    due,
    created,
    completed: "",
    archived: false,
    file: dayRel,
  };

  const fileIdx = doc.files.findIndex((f) => f.path === dayRel);
  if (fileIdx >= 0) {
    doc.files[fileIdx] = {
      ...doc.files[fileIdx],
      task_count: doc.files[fileIdx].task_count + 1,
    };
  } else {
    doc.files.push({ path: dayRel, date, task_count: 1 });
  }
  doc.tasks.push(summary);

  await writeTextFile(indexPath, serializeIndexDocument(doc));
  return summary;
}

function formatTaskBlock(opts: {
  id: string;
  title: string;
  due: string;
  created: string;
  body: string;
}): string {
  return [
    `# ${opts.id}`,
    "",
    `- status: pending`,
    `- title: ${opts.title}`,
    `- due: ${opts.due}`,
    `- created: ${opts.created}`,
    `- completed:`,
    `- archived: false`,
    `- updated: ${opts.created}`,
    "",
    "### body",
    "",
    opts.body,
  ].join("\n");
}
