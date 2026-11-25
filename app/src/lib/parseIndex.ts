import type { TaskStatus, TaskSummary } from "./types";

export interface FileEntry {
  path: string;
  date: string;
  task_count: number;
}

export interface ParsedIndex {
  preamble: string;
  files: FileEntry[];
  tasks: TaskSummary[];
}

/** Parse the Tasks table in index.md (PRD / sample-data format). */
export function parseTasksFromIndex(markdown: string): TaskSummary[] {
  return parseIndexDocument(markdown).tasks;
}

export function parseIndexDocument(markdown: string): ParsedIndex {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const filesStart = findHeading(normalized, "Files");
  const tasksStart = findHeading(normalized, "Tasks");

  let preamble = normalized;
  if (filesStart >= 0) {
    preamble = normalized.slice(0, filesStart).replace(/\n+$/, "") + "\n\n";
  } else if (tasksStart >= 0) {
    preamble = normalized.slice(0, tasksStart).replace(/\n+$/, "") + "\n\n";
  }

  const files =
    filesStart >= 0
      ? parseFilesTable(sectionAfterHeading(normalized, filesStart, tasksStart))
      : [];
  const tasks =
    tasksStart >= 0
      ? parseTasksTable(sectionAfterHeading(normalized, tasksStart, -1))
      : [];

  return { preamble, files, tasks };
}

export function serializeIndexDocument(doc: ParsedIndex): string {
  const filesRows =
    doc.files.length === 0
      ? ""
      : doc.files
          .map(
            (f) =>
              `| ${f.path} | ${f.date} | ${f.task_count} |`,
          )
          .join("\n") + "\n";

  const taskRows =
    doc.tasks.length === 0
      ? ""
      : doc.tasks
          .map(
            (t) =>
              `| ${t.id} | ${t.status} | ${escapeCell(t.title)} | ${t.due} | ${t.created} | ${t.completed} | ${t.archived} | ${t.file} |`,
          )
          .join("\n") + "\n";

  const preamble = doc.preamble.trimEnd() + "\n\n";
  return (
    preamble +
    "## Files\n\n" +
    "| path | date | task_count |\n" +
    "|------|------|------------|\n" +
    filesRows +
    "\n" +
    "## Tasks\n\n" +
    "| id | status | title | due | created | completed | archived | file |\n" +
    "|----|--------|-------|-----|---------|-----------|----------|------|\n" +
    taskRows
  );
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function findHeading(markdown: string, name: string): number {
  const re = new RegExp(`^##\\s+${name}\\s*$`, "im");
  const m = re.exec(markdown);
  return m ? m.index : -1;
}

function sectionAfterHeading(
  markdown: string,
  headingIndex: number,
  nextHeadingIndex: number,
): string {
  const afterHash = markdown.indexOf("\n", headingIndex);
  const start = afterHash < 0 ? markdown.length : afterHash + 1;
  const end = nextHeadingIndex >= 0 ? nextHeadingIndex : markdown.length;
  return markdown.slice(start, end);
}

function parseFilesTable(section: string): FileEntry[] {
  const files: FileEntry[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|\s*-+/.test(trimmed) || /\| path \|/i.test(trimmed)) continue;
    const cells = splitTableRow(trimmed);
    if (cells.length < 3) continue;
    const count = Number(cells[2]);
    files.push({
      path: cells[0],
      date: cells[1],
      task_count: Number.isFinite(count) ? count : 0,
    });
  }
  return files;
}

function parseTasksTable(section: string): TaskSummary[] {
  const tasks: TaskSummary[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|\s*-+/.test(trimmed) || /\| id \|/i.test(trimmed)) continue;

    const cells = splitTableRow(trimmed);
    if (cells.length < 8) continue;

    const status = cells[1] as TaskStatus;
    if (status !== "pending" && status !== "done" && status !== "archived") {
      continue;
    }

    tasks.push({
      id: cells[0],
      status,
      title: cells[2],
      due: cells[3],
      created: cells[4],
      completed: cells[5],
      archived: cells[6].toLowerCase() === "true",
      file: cells[7],
    });
  }
  return tasks;
}

function splitTableRow(line: string): string[] {
  const raw = line.replace(/^\|/, "").replace(/\|$/, "");
  return raw.split("|").map((c) => c.trim());
}
