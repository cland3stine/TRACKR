use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let sidecar_child: Option<CommandChild> = match app
                .shell()
                .sidecar("binaries/trackr-backend")
            {
                Ok(cmd) => match cmd.spawn() {
                    Ok((mut rx, child)) => {

                    // Log sidecar stdout/stderr on a background thread
                    tauri::async_runtime::spawn(async move {
                        use tauri_plugin_shell::process::CommandEvent;
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => {
                                    println!("[trackr-backend] {}", String::from_utf8_lossy(&line));
                                }
                                CommandEvent::Stderr(line) => {
                                    eprintln!("[trackr-backend] {}", String::from_utf8_lossy(&line));
                                }
                                CommandEvent::Terminated(payload) => {
                                    println!(
                                        "[trackr-backend] exited with code {:?}, signal {:?}",
                                        payload.code, payload.signal
                                    );
                                    break;
                                }
                                CommandEvent::Error(err) => {
                                    eprintln!("[trackr-backend] error: {err}");
                                    break;
                                }
                                _ => {}
                            }
                        }
                    });

                    println!("[TRACKR] sidecar started (pid {})", child.pid());
                    Some(child)
                    }
                    Err(e) => {
                        println!(
                            "[TRACKR] sidecar spawn failed (dev mode?) — start Python backend manually: {e}"
                        );
                        None
                    }
                }
                Err(e) => {
                    println!(
                        "[TRACKR] sidecar not found (dev mode?) — start Python backend manually: {e}"
                    );
                    None
                }
            };

            // Store child handle so we can kill it on close
            app.manage(Mutex::new(sidecar_child));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle();
                if let Some(state) = app.try_state::<Mutex<Option<CommandChild>>>() {
                    if let Ok(mut guard) = state.lock() {
                        if let Some(child) = guard.take() {
                            println!("[TRACKR] killing sidecar (pid {})", child.pid());
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
