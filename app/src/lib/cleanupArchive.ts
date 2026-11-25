import { exists, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { findTaskBlock, hasTaskHeading, removeTaskBlock } from "./dayFile";
import { parseIndexDocument, serializeIndexDocument } from "./parseIndex";
import { joinPath } from "./path";
import { completedLocalDate, formatDate } from "./time";

/** Archived tasks are kept for this many calendar days (day of archiving = day 1). */
export const ARCHIVE_RETENTION_DAYS = 7;

/**
 * Delete archived tasks older than {@link ARCHIVE_RETENTION_DAYS} days:
 * remove the task block from its day file, drop the index row, and delete the
 * task's attachments folder. Empty day files are removed entirely.
 *
 * Expiry reference: the block's `archived_at`; legacy blocks (archived before
 * that field existed) fall back to `updated`. Unparseable dates are kept.
 *
 * @returns ids of the tasks actually deleted.
 */
export async function cleanupExpiredArchives(
  workspacePath: string,
  now: Date = new Date(),
): Promise<string[]> {
  const indexPath = joinPath(workspacePath, "index.md");
  const doc = parseIndexDocument(await readTextFile(indexPath));
  const cutoff = formatDateOfDaysAgo(now, ARCHIVE_RETENTION_DAYS);
  const archived = doc.tasks.filter((t) => t.archived || t.status === "archived");
  if (archived.length === 0) return [];

  const removedIds: string[] = [];
  const byFile = new Map<string, typeof archived>();
  for (const task of archived) {
    const list = byFile.get(task.file) ?? [];
    list.push(task);
    byFile.set(task.file, list);
  }

  for (const [file, tasks] of byFile) {
    const dayPath = joinPath(workspacePath, ...file.split("/"));
    let dayMd: string;
    try {
      dayMd = await readTextFile(dayPath);
    } catch {
      continue; // day file gone; index rows for it are dropped below via counts
    }
    let changed = false;
    for (const task of tasks) {
      let archivedAt: string;
      let updated: string;
      try {
        const parsed = findTaskBlock(dayMd, task.id).parsed;
        ({ archivedAt, updated } = parsed);
      } catch {
        continue; // block missing — index row cleanup still applies
      }
      if (!isExpired(archivedAt || updated, cutoff)) continue;
      dayMd = removeTaskBlock(dayMd, task.id);
      changed = true;
      removedIds.push(task.id);
      await removeAttachments(workspacePath, task.id);
    }
    if (!changed) continue;
    if (hasTaskHeading(dayMd)) {
      await writeTextFile(dayPath, dayMd);
    } else {
      await remove(dayPath); // day file left without tasks — drop it
    }
  }

  if (removedIds.length === 0) return removedIds;

  doc.tasks = doc.tasks.filter((t) => !removedIds.includes(t.id));
  doc.files = doc.files
    .map((f) => ({
      ...f,
      task_count: doc.tasks.filter((t) => t.file === f.path).length,
    }))
    .filter((f) => f.task_count > 0);
  await writeTextFile(indexPath, serializeIndexDocument(doc));
  return removedIds;
}

function isExpired(ref: string, cutoffDate: string): boolean {
  const date = completedLocalDate(ref);
  if (!date) return false; // unparseable — keep, never guess
  return date < cutoffDate; // archived on day X ⇒ kept through X + 7 days
}

function formatDateOfDaysAgo(now: Date, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

async function removeAttachments(workspacePath: string, taskId: string) {
  const dir = joinPath(workspacePath, "attachments", taskId);
  if (await exists(dir)) {
    try {
      await remove(dir, { recursive: true });
    } catch {
      // best effort — the task itself is already gone
    }
  }
}
