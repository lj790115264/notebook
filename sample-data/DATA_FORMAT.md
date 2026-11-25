# Local Todo — 数据格式说明

本目录是一个**工作区**样例。应用与 AI 均应能直接阅读此处文件。

## 目录

```
{workspace}/
  index.md           # 索引：文件关系 + 任务总表
  DATA_FORMAT.md     # 本说明（应用可维护）
  days/
    YYYY-MM-DD.md    # 按「创建日」归属的任务正文
  attachments/
    {task-id}/
      img-NNN.ext    # 该任务粘贴的图片
```

## 约定摘要

| 项 | 规则 |
|----|------|
| 任务正文 | 只写在创建当日的 `days/YYYY-MM-DD.md` |
| 完成 / 归档 | 不改文件归属，只改字段 + 更新 `index.md` |
| 待处理 | `status = pending` |
| 已处理筛选 | 按 `completed`；本周 = 周一～周日（本地时区） |
| `due` | 可空 |
| `title` | 可空输入；空则取正文纯文本前 8 字；无文字则为「未命名」 |
| `body` | 必填（文字或图片至少其一） |
| 图片 | `![](../attachments/{task-id}/img-001.png)` |
| 任务块标题 | `# task-id`（H1）；旧数据 `## task-id` 可读，写入时规范为 `#` |
| 正文标题 | 从 `##` 起；勿用行首单个 `#`（会与任务块冲突） |
| 索引与日文件 | 日文件为正文 source of truth；不一致时以日文件为准并重建索引 |

## 任务块格式

见任意 `days/*.md` 中的 `# task-...` 块。
