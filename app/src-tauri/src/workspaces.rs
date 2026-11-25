//! 应用内多工作区窗口：每个工作区一个额外 Webview 窗口（与主窗口同进程）。
//!
//! - 窗口与工作区的绑定：创建窗口时用 initialization_script 注入
//!   `window.__NB_WORKSPACE__`，前端启动时优先读取，不经过共享 localStorage
//! - 已打开的额外工作区列表持久化到 %APPDATA%/open-workspaces.json，
//!   应用启动时自动恢复
//! - 主窗口（label = main）不进列表：它沿用 localStorage「记住工作区」流程
//! - 单进程多窗口使全局热键只需注册一次，即可统一控制全部窗口显隐

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL_PREFIX: &str = "ws-";
const WINDOW_WIDTH: f64 = 450.0;
const WINDOW_HEIGHT: f64 = 670.0;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OpenWorkspace {
    label: String,
    path: String,
}

// ---------- 持久化 ----------

fn state_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("open-workspaces.json"))
}

fn load_state(app: &AppHandle) -> Vec<OpenWorkspace> {
    let Ok(path) = state_path(app) else {
        return Vec::new();
    };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_state(app: &AppHandle, list: &[OpenWorkspace]) -> Result<(), String> {
    let path = state_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

// ---------- 窗口创建 ----------

/// 取路径末段作为窗口标题后缀（如 D:\notes\work → work）
fn folder_name(path: &str) -> String {
    let trimmed = path.trim_end_matches(['/', '\\']);
    let name = trimmed
        .rsplit(['/', '\\'])
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(trimmed);
    if name.is_empty() {
        path.to_string()
    } else {
        name.to_string()
    }
}

fn create_workspace_window(
    app: &AppHandle,
    label: &str,
    path: &str,
    index: usize,
) -> Result<(), String> {
    let script = format!(
        "window.__NB_WORKSPACE__ = {};",
        serde_json::to_string(path).map_err(|e| e.to_string())?
    );
    // 级联偏移，避免新窗口与已有窗口完全重叠
    let offset = (index % 8) as f64 * 32.0;
    WebviewWindowBuilder::new(app, label, WebviewUrl::default())
        .title(format!("NoteBook · {}", folder_name(path)))
        .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
        .position(160.0 + offset, 120.0 + offset)
        .initialization_script(script)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn next_free_label(app: &AppHandle) -> String {
    let mut n = 1;
    loop {
        let label = format!("{LABEL_PREFIX}{n}");
        if app.get_webview_window(&label).is_none() {
            return label;
        }
        n += 1;
    }
}

/// 打开一个新工作区窗口并记入持久化列表，返回窗口 label
fn open_workspace_internal(app: &AppHandle, path: &str) -> Result<String, String> {
    let label = next_free_label(app);
    // 已有额外窗口数量用于级联偏移
    let index = app.webview_windows().len().saturating_sub(1);
    create_workspace_window(app, &label, path, index)?;
    let mut list = load_state(app);
    list.push(OpenWorkspace {
        label: label.clone(),
        path: path.to_string(),
    });
    save_state(app, &list)?;
    Ok(label)
}

/// setup 阶段恢复上次打开的额外工作区窗口
pub fn restore_from_disk(app: &AppHandle) {
    let list = load_state(app);
    for (i, item) in list.iter().enumerate() {
        if app.get_webview_window(&item.label).is_some() {
            continue;
        }
        if let Err(e) = create_workspace_window(app, &item.label, &item.path, i + 1) {
            eprintln!(
                "恢复工作区窗口 {}（{}）失败：{e}",
                item.label, item.path
            );
        }
    }
}

// ---------- Tauri commands ----------
//
// 注意：以下 command 必须保持 async。同步 command 在主线程（事件循环回调）里
// 内联执行，Windows 上 WebView2 控制器的异步创建会卡死在半路——窗口壳有标题但
// 内容永远空白（子窗口链断在 Chrome_WidgetWin_0）。async command 跑在异步
// 运行时线程上，窗口创建消息由事件循环在下一次迭代里干净地处理。

/// 前端「新窗口打开工作区」入口；返回新窗口 label
#[tauri::command]
pub async fn open_workspace(app: AppHandle, path: String) -> Result<String, String> {
    open_workspace_internal(&app, &path)
}

/// 关闭一个额外工作区窗口：先移出持久化列表，再销毁窗口
#[tauri::command]
pub async fn close_workspace(app: AppHandle, label: String) -> Result<(), String> {
    let list: Vec<OpenWorkspace> = load_state(&app)
        .into_iter()
        .filter(|w| w.label != label)
        .collect();
    save_state(&app, &list)?;
    if let Some(window) = app.get_webview_window(&label) {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 额外窗口就地切换工作区：更新持久化列表与窗口标题
#[tauri::command]
pub async fn rebind_workspace(
    app: AppHandle,
    label: String,
    new_path: String,
) -> Result<(), String> {
    let mut list = load_state(&app);
    if let Some(item) = list.iter_mut().find(|w| w.label == label) {
        item.path = new_path.clone();
        save_state(&app, &list)?;
    }
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.set_title(&format!("NoteBook · {}", folder_name(&new_path)));
    }
    Ok(())
}

/// 主窗口「直接关闭」= 退出整个应用
#[tauri::command]
pub async fn exit_app(app: AppHandle) {
    app.exit(0);
}
