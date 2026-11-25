//! 全局热键：Tab + Q 组合键呼出 / 隐藏主窗口。
//!
//! 通过 Windows 低级键盘钩子（WH_KEYBOARD_LL）**观察**按键：不拦截、不消费
//! 任何按键（Tab / Q 始终正常传递给前台应用），仅当两键同时按下时切换窗口。
//! 识别规则：
//! - Tab、Q 先按哪个都可以，另一键按下且前一键未松开时触发
//! - 触发一次后须两键都松开才重新武装（忽略按住产生的系统重复）
//! - 忽略软件注入的按键（LLKHF_INJECTED），避免被模拟输入误触发

#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;
    use tauri::Manager;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_TAB;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx, KBDLLHOOKSTRUCT,
        MSG, WH_KEYBOARD_LL,
    };

    /// LLKHF_UP：key-up 事件；LLKHF_INJECTED：软件注入的按键。
    const LLKHF_UP: u32 = 0x80;
    const LLKHF_INJECTED: u32 = 0x10;
    const VK_Q: u32 = 0x51; // 'Q'
    const VK_TAB_CODE: u32 = VK_TAB as u32;

    static TAB_DOWN: AtomicBool = AtomicBool::new(false);
    static Q_DOWN: AtomicBool = AtomicBool::new(false);
    static TRIGGERED: AtomicBool = AtomicBool::new(false);
    static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

    pub fn init(app: tauri::AppHandle) {
        let _ = APP.set(app);
        std::thread::spawn(|| unsafe {
            // 低级钩子不依赖 DLL 句柄，线程须持有消息循环才能收到事件；
            // 进程退出时系统自动卸载钩子。
            let hook = SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(keyboard_proc),
                std::ptr::null_mut(),
                0,
            );
            if hook.is_null() {
                eprintln!("注册 Tab+Q 全局热键失败（键盘钩子安装失败）");
                return;
            }
            let mut msg = std::mem::zeroed::<MSG>();
            loop {
                if GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) <= 0 {
                    break;
                }
            }
            UnhookWindowsHookEx(hook);
        });
    }

    unsafe extern "system" fn keyboard_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        unsafe {
            if code >= 0 {
                let kb = &*(lparam as *const KBDLLHOOKSTRUCT);
                if kb.flags & LLKHF_INJECTED == 0 {
                    let key_up = kb.flags & LLKHF_UP != 0;
                    match (kb.vkCode, key_up) {
                        (VK_TAB_CODE, false) => {
                            TAB_DOWN.store(true, Ordering::Relaxed);
                            maybe_fire();
                        }
                        (VK_TAB_CODE, true) => {
                            TAB_DOWN.store(false, Ordering::Relaxed);
                            maybe_rearm();
                        }
                        (VK_Q, false) => {
                            Q_DOWN.store(true, Ordering::Relaxed);
                            maybe_fire();
                        }
                        (VK_Q, true) => {
                            Q_DOWN.store(false, Ordering::Relaxed);
                            maybe_rearm();
                        }
                        _ => {}
                    }
                }
            }
            CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
        }
    }

    /// 两键同时按下且未处于刚触发状态 → 切换窗口
    fn maybe_fire() {
        if !TRIGGERED.load(Ordering::Relaxed)
            && TAB_DOWN.load(Ordering::Relaxed)
            && Q_DOWN.load(Ordering::Relaxed)
        {
            TRIGGERED.store(true, Ordering::Relaxed);
            if let Some(app) = APP.get() {
                // 窗口操作切回主线程执行
                let _ = app.run_on_main_thread(move || {
                    if let Some(a) = APP.get() {
                        toggle_main_window(a);
                    }
                });
            }
        }
    }

    /// 两键都松开后重新武装，允许下一次触发
    fn maybe_rearm() {
        if TRIGGERED.load(Ordering::Relaxed)
            && !TAB_DOWN.load(Ordering::Relaxed)
            && !Q_DOWN.load(Ordering::Relaxed)
        {
            TRIGGERED.store(false, Ordering::Relaxed);
        }
    }

    fn toggle_main_window(app: &tauri::AppHandle) {
        if let Some(window) = app.get_webview_window("main") {
            let visible = window.is_visible().unwrap_or(false);
            let focused = window.is_focused().unwrap_or(false);
            if visible && focused {
                // 已在前台：再按一次 = 收起
                let _ = window.hide();
            } else {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

#[cfg(windows)]
pub use imp::init;
