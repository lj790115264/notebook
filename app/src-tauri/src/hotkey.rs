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
                log(&format!("RegisterHotKey FAILED err={}", GetLastError()));
                eprintln!("注册 Alt+Q 全局热键失败（err={}）", GetLastError());
                return;
            }
            log("hotkey registered (Alt+Q)");
            let mut msg = std::mem::zeroed::<MSG>();
            loop {
                if GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) <= 0 {
                    break;
                }
                if msg.message == WM_HOTKEY && msg.wParam as i32 == HOTKEY_ID {
                    log("TOGGLE");
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
        if let Some(window) = app.get_webview_window("main") {
            let visible = window.is_visible().unwrap_or(false);
            if visible {
                // 应用已打开（无论是否在前台）：Alt+Q = 收起放入后台
                let _ = window.hide();
            } else {
                // 隐藏 / 最小化：唤出并聚焦
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

#[cfg(windows)]
pub use imp::init;
