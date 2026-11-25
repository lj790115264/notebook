mod hotkey;
mod workspaces;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            workspaces::open_workspace,
            workspaces::close_workspace,
            workspaces::rebind_workspace,
            workspaces::exit_app
        ])
        .setup(|_app| {
            #[cfg(windows)]
            hotkey::init(_app.handle().clone());
            // 恢复上次打开的额外工作区窗口
            workspaces::restore_from_disk(_app.handle());
            Ok(())
        })
        // 点关闭不放行：交给前端提示「放入后台 / 直接关闭」。
        // 必须定向到该窗口：全局 listen 会收到所有事件，广播会让多窗口一起弹提示
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                use tauri::Emitter;
                let _ = window.emit_to(window.label(), "close-requested", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
