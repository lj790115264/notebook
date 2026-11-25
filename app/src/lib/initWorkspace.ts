import { exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { joinPath } from "./path";

const EMPTY_INDEX = `# Todo Index

> 由应用维护。勿手改 id / path；手改 status 后需在应用内刷新或重建索引。

## Files

| path | date | task_count |
|------|------|------------|

## Tasks

| id | status | title | due | created | completed | archived | file |
|----|--------|-------|-----|---------|-----------|----------|------|
`;

const DATA_FORMAT = `# NoteBook — 数据格式说明

本目录是一个**工作区**。应用与 AI 均应能直接阅读此处文件。

## 目录

\`\`\`
{workspace}/
  index.md           # 索引：文件关系 + 任务总表
  DATA_FORMAT.md     # 本说明（应用可维护）
  days/
    YYYY-MM-DD.md    # 按「创建日」归属的任务正文
  attachments/
    {task-id}/
      img-NNN.ext    # 该任务粘贴的图片
\`\`\`

## 约定摘要

| 项 | 规则 |
|----|------|
| 任务正文 | 只写在创建当日的 \`days/YYYY-MM-DD.md\` |
| 完成 / 归档 | 不改文件归属，只改字段 + 更新 \`index.md\` |
| 待处理 | \`status = pending\` |
| 已处理筛选 | 按 \`completed\`；本周 = 周一～周日（本地时区） |
| \`due\` | 可空 |
| \`title\` | 可空输入；空则取正文纯文本前 8 字；无文字则为「未命名」 |
| \`body\` | 必填（文字或图片至少其一） |
| \`archived_at\` | 归档时间；归档满 7 天后应用自动删除该任务（含 attachments/{task-id}/） |
| 图片 | \`![](../attachments/{task-id}/img-001.png)\` |
| 任务块标题 | \`# task-id\`（H1）；旧 \`## task-id\` 可读，写入规范为 \`#\` |
| 正文标题 | 从 \`##\` 起；勿用行首单个 \`#\` |
| 索引与日文件 | 日文件为正文 source of truth；不一致时以日文件为准并重建索引 |
`;

/** If workspace has no index.md, create PRD skeleton (empty index + dirs). */
export async function ensureWorkspaceInitialized(
  workspacePath: string,
): Promise<{ initialized: boolean }> {
  const indexPath = joinPath(workspacePath, "index.md");
  if (await exists(indexPath)) {
    return { initialized: false };
  }

  const daysPath = joinPath(workspacePath, "days");
  const attachmentsPath = joinPath(workspacePath, "attachments");
  const formatPath = joinPath(workspacePath, "DATA_FORMAT.md");

  if (!(await exists(daysPath))) {
    await mkdir(daysPath, { recursive: true });
  }
  if (!(await exists(attachmentsPath))) {
    await mkdir(attachmentsPath, { recursive: true });
  }
  await writeTextFile(indexPath, EMPTY_INDEX);
  if (!(await exists(formatPath))) {
    await writeTextFile(formatPath, DATA_FORMAT);
  }

  return { initialized: true };
}
