# NoteBook（骨架）

Tauri 2 + React + TypeScript。当前能力：

- 首次选择工作区文件夹（无默认目录）
- 空工作区自动初始化（`index.md` / `days/` / `attachments/` / `DATA_FORMAT.md`）
- 记住上次工作区
- 切换工作区 / 手动刷新
- 读取工作区 `index.md`，列出 **待处理** 标题（按截止日期排序）
- **新建待办**：标题/截止日期可选，正文必填；写入当日 `days/*.md` 并更新索引
- **完成 / 撤销完成**：同步日文件与索引
- **已处理**：本日 / 本周（周一～周日）/ 全部
- **编辑**：待处理与已处理均可改标题 / 截止日期 / 正文
- **归档**：二次确认后移出常规列表（数据保留）
- **归档保留期**：归档满 7 天自动删除（任务块 + `attachments/{task-id}/` + 索引行；空日文件一并移除）。启动与每次刷新时清理；归档时间记录在日文件块新增的 `archived_at` 字段，旧数据无该字段时按 `updated` 兜底判定
- **贴图**：正文 Ctrl+V 粘贴图片到 `attachments/{task-id}/`；预览点击放大查看（大图右键可复制）
- **全局快捷键**：系统任意界面 **Alt + Q** 两键同按呼出/隐藏主窗口（低级键盘钩子实现，只观察不拦截按键，先后按哪个键均可；两键松开后才可再次触发，见 `src-tauri/src/hotkey.rs`）
- **后台运行**：点窗口关闭时弹提示选择「放入后台」（窗口隐藏、进程常驻，双 Tab 可唤出）或「直接关闭」（退出应用）；见 `src-tauri/src/lib.rs` 的 `on_window_event` 与 `src/components/ExitPrompt.tsx`

## 本机前提

1. Node.js
2. Rust（`rustup default stable`）
3. Windows：**VS 2022 Build Tools**
   - 工作负载：使用 C++ 的桌面开发 / `MSVC` + **Windows SDK**（缺 SDK 会出现找不到 `kernel32.lib`）
4. WebView2（Win10/11 一般已有）

在「x64 Native Tools Command Prompt」或先执行 `vcvars64.bat` 后再构建更稳妥。

## 开发运行

```bash
cd app
npm install
npm run tauri dev
```

启动后选择仓库根目录下的 `sample-data` 作为工作区，应能看到两条待处理：**提交周报**、**今天要提交周报**。

## 目录

- `src/` — UI 与 MD 解析（TypeScript）
- `src-tauri/` — Tauri 壳与插件注册（几乎不写业务）
