export interface TaskBlock {
  id: string;
  status: string;
  title: string;
  due: string;
  created: string;
  completed: string;
  archived: boolean;
  /** Archive time (YYYY-MM-DDTHH:mm:ss); empty for tasks archived before this field existed. */
  archivedAt: string;
  updated: string;
  body: string;
  /** Full markdown of this task block (no trailing sibling blocks). */
  raw: string;
}

/**
 * Task blocks are `# task-id` (H1). Legacy `## task-id` is still recognized when reading.
 * Next-block boundary only matches headings that look like task ids, so body may use `##` / `###`.
 */
export function findTaskBlock(
  dayMarkdown: string,
  taskId: string,
): { before: string; block: string; after: string; parsed: TaskBlock } {
  const normalized = dayMarkdown.replace(/\r\n/g, "\n");
  const found = locateTaskHeading(normalized, taskId);
  if (!found) {
    throw new Error(`日文件中找不到任务 ${taskId}`);
  }

  const afterHeading = found.start + found.heading.length;
  const next = normalized.slice(afterHeading).search(/\n#{1,2}\s+task-/);
  const end = next < 0 ? normalized.length : afterHeading + next;

  let block = normalized.slice(found.start, end);
  // Normalize legacy ## task-id → # task-id on touch
  if (found.heading.startsWith("##")) {
    block = `# ${taskId}` + block.slice(found.heading.length);
  }

  const before = normalized.slice(0, found.start);
  const after = normalized.slice(end);

  return {
    before,
    block,
    after,
    parsed: parseTaskBlock(block, taskId),
  };
}

export function parseTaskBlock(block: string, taskId: string): TaskBlock {
  const bodyMatch = /\n###\s*body\s*\n([\s\S]*)$/i.exec(block);
  const body = bodyMatch
    ? bodyMatch[1].replace(/^\n+/, "").replace(/\s+$/, "")
    : "";
  const metaPart = bodyMatch ? block.slice(0, bodyMatch.index) : block;

  return {
    id: taskId,
    status: getMeta(metaPart, "status") || "pending",
    title: getMeta(metaPart, "title"),
    due: getMeta(metaPart, "due"),
    created: getMeta(metaPart, "created"),
    completed: getMeta(metaPart, "completed"),
    archived: getMeta(metaPart, "archived").toLowerCase() === "true",
    archivedAt: getMeta(metaPart, "archived_at"),
    updated: getMeta(metaPart, "updated"),
    body,
    raw: block,
  };
}

/** Update scalar meta lines and/or replace ### body; leave other content intact when possible. */
export function updateTaskBlockMeta(
  dayMarkdown: string,
  taskId: string,
  patch: {
    status?: string;
    title?: string;
    due?: string;
    completed?: string;
    archived?: boolean;
    archivedAt?: string;
    updated?: string;
    body?: string;
  },
): string {
  const { before, block, after } = findTaskBlock(dayMarkdown, taskId);
  let next = block;

  if (patch.status !== undefined) next = setMetaLine(next, "status", patch.status);
  if (patch.title !== undefined) next = setMetaLine(next, "title", patch.title);
  if (patch.due !== undefined) next = setMetaLine(next, "due", patch.due);
  if (patch.completed !== undefined) {
    next = setMetaLine(next, "completed", patch.completed);
  }
  if (patch.archived !== undefined) {
    next = setMetaLine(next, "archived", patch.archived ? "true" : "false");
  }
  if (patch.archivedAt !== undefined) {
    next = setMetaLine(next, "archived_at", patch.archivedAt);
  }
  if (patch.updated !== undefined) next = setMetaLine(next, "updated", patch.updated);
  if (patch.body !== undefined) next = setBody(next, patch.body);

  return before + next + after;
}

/** Prefer `# id`; fall back to legacy `## id` (line-anchored). */
function locateTaskHeading(
  markdown: string,
  taskId: string,
): { start: number; heading: string } | null {
  const candidates = [`# ${taskId}`, `## ${taskId}`];
  for (const heading of candidates) {
    if (markdown.startsWith(heading) && isHeadingEnd(markdown, heading.length)) {
      return { start: 0, heading };
    }
    const needle = `\n${heading}`;
    let from = 0;
    while (from < markdown.length) {
      const idx = markdown.indexOf(needle, from);
      if (idx < 0) break;
      const start = idx + 1; // skip the \n
      if (isHeadingEnd(markdown, start + heading.length)) {
        return { start, heading };
      }
      from = idx + 1;
    }
  }
  return null;
}

function isHeadingEnd(markdown: string, afterHeading: number): boolean {
  if (afterHeading >= markdown.length) return true;
  const ch = markdown[afterHeading];
  return ch === "\n" || ch === "\r";
}

function getMeta(block: string, key: string): string {
  const re = new RegExp(`^-\\s*${key}:\\s*(.*)$`, "m");
  const m = re.exec(block);
  return m ? m[1].trim() : "";
}

/** Delete a task block from the day file; returns the remaining markdown. */
export function removeTaskBlock(dayMarkdown: string, taskId: string): string {
  const { before, after } = findTaskBlock(dayMarkdown, taskId);
  return before + after;
}

/** Whether the day file still carries at least one task block. */
export function hasTaskHeading(dayMarkdown: string): boolean {
  return /(^|\n)#{1,2}\s+task-/.test(dayMarkdown);
}

function setMetaLine(block: string, key: string, value: string): string {
  const line = value === "" ? `- ${key}:` : `- ${key}: ${value}`;
  const re = new RegExp(`^-\\s*${key}:\\s*.*$`, "m");
  if (re.test(block)) {
    return block.replace(re, line);
  }
  const statusLine = /^(- status:.*)$/m;
  if (statusLine.test(block) && key !== "status") {
    return block.replace(statusLine, `$1\n${line}`);
  }
  return block;
}

function setBody(block: string, body: string): string {
  const trimmed = body.replace(/\s+$/, "");
  if (/\n###\s*body\s*\n/i.test(block)) {
    return block.replace(
      /\n###\s*body\s*\n[\s\S]*$/i,
      `\n\n### body\n\n${trimmed}`,
    );
  }
  return block.replace(/\s*$/, "") + `\n\n### body\n\n${trimmed}\n`;
}
