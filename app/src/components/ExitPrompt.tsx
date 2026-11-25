import { getCurrentWindow } from "@tauri-apps/api/window";

interface ExitPromptProps {
  /** 选择放入后台（窗口已隐藏）后回调，用于收起提示。 */
  onBackground: () => void;
}

/** 点窗口关闭时的提示：放入后台继续运行（双 Tab 可唤出）或直接退出。 */
export function ExitPrompt({ onBackground }: ExitPromptProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog exit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-prompt-title"
      >
        <header className="modal-header">
          <h2 id="exit-prompt-title">关闭 NoteBook</h2>
        </header>
        <div className="modal-body">
          <p className="exit-prompt-text">
            放入后台后应用继续运行，可随时连按两次 Tab 呼出；直接关闭将退出应用。
          </p>
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={() => void getCurrentWindow().destroy()}>
            直接关闭
          </button>
          <button
            type="button"
            className="primary"
            onClick={() =>
              void getCurrentWindow()
                .hide()
                .catch(console.warn)
                .finally(onBackground)
            }
          >
            放入后台
          </button>
        </footer>
      </div>
    </div>
  );
}
