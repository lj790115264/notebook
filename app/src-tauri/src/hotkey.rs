//! 全局热键：Alt + Q 呼出 / 隐藏主窗口。
//!
//! 使用 Windows 官方热键 API `RegisterHotKey`（非键盘钩子）：
//! - 系统只在 Alt+Q 按下时投递 WM_HOTKEY 通知，无法监听其他按键，
//!   不会触发杀软/EDR 对键盘记录类钩子的拦截（奇安信等会拦 WH_KEYBOARD_LL）
//! - MOD_NOREPEAT：按住不放只触发一次，每次重新点按各触发一次
//! - Alt+Q 组合将被系统独占，不再传递给其他应用
//! 诊断：注册结果与每次触发写入 %TEMP%\notebook-hotkey.log。

#[cfg(windows)]
mod imp {
    use std::sync::OnceLock;
    use tauri::Manager;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_NOREPEAT, VK_Q,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetMessageW, MSG, WM_HOTKEY};

    const HOTKEY_ID: i32 = 1;
    static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

    fn log(line: &str) {
        use std::io::Write;
        let mut path = std::env::temp_dir();
        path.push("notebook-hotkey.log");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "{line}");
        }
    }

    pub fn init(app: tauri::AppHandle) {
        let _ = APP.set(app);
        std::thread::spawn(|| unsafe {
            // RegisterHotKey 绑定调用线程；WM_HOTKEY 由本线程消息循环接收
            let ok = RegisterHotKey(
                std::ptr::null_mut(),
                HOTKEY_ID,
                MOD_ALT | MOD_NOREPEAT,
                VK_Q as u32,
            );
            if ok == 0 {
                // 1409 = ERROR_HOTKEY_ALREADY_REGISTERED（其他程序占用 Alt+Q）
                log(&format!(
                    "RegisterHotKey FAILED err={} pid={}",
                    GetLastError(),
                    std::process::id()
                ));
                eprintln!("注册 Alt+Q 全局热键失败（err={}）", GetLastError());
                return;
            }
            log(&format!(
                "hotkey registered (Alt+Q) pid={}",
                std::process::id()
            ));
            let mut msg = std::mem::zeroed::<MSG>();
            loop {
                if GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) <= 0 {
                    break;
                }
                if msg.message == WM_HOTKEY && msg.wParam as i32 == HOTKEY_ID {
                    log(&format!("TOGGLE pid={}", std::process::id()));
                    if let Some(app) = APP.get() {
                        // 窗口操作切回主线程执行
                        let _ = app.run_on_main_thread(|| {
                            if let Some(a) = APP.get() {
                                toggle_main_window(a);
                            }
                        });
                    }
                }
            }
            UnregisterHotKey(std::ptr::null_mut(), HOTKEY_ID);
        });
    }

    fn toggle_main_window(app: &tauri::AppHandle) {
        let windows = app.webview_windows();
        // 诊断：每个窗口的句柄与显隐状态
        let mut snap = String::new();
        for (label, w) in &windows {
            let hwnd = w.hwnd().map(|h| h.0 as usize).unwrap_or(0);
            snap += &format!(
                " [{} hwnd={:x} vis={:?} min={:?}]",
                label,
                hwnd,
                w.is_visible(),
                w.is_minimized()
            );
        }
        log(&format!("toggle windows pid={} {}", std::process::id(), snap));
        // 任一窗口处于前台可见（可见且未最小化）→ 全部收起；否则全部唤出
        let any_front = windows
            .values()
            .any(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false));
        if any_front {
            for window in windows.values() {
                if let Err(e) = window.hide() {
                    log(&format!("hide {} 失败：{e}", window.label()));
                }
            }
        } else {
            // 主窗口排最后处理，保证唤出后焦点落在主窗口
            let mut ordered: Vec<_> = windows.values().collect();
            ordered.sort_by_key(|w| w.label() != "main");
            for window in ordered {
                // 隐藏 / 最小化：唤出（主窗口聚焦）
                let _ = window.unminimize();
                if let Err(e) = window.show() {
                    log(&format!("show {} 失败：{e}", window.label()));
                }
                if window.label() == "main" {
                    let _ = window.set_focus();
                }
            }
        }
    }
}

#[cfg(windows)]
pub use imp::init;
