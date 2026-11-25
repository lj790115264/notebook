import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface ExitPromptProps {
  /** 选择放入后台（窗口已隐藏）后回调，用于收起提示。 */
  onBackground: () => void;
}

/** 点窗口关闭时的提示：放入后台继续运行（Alt+Q 可唤出）或直接关闭。
 *  主窗口直接关闭 = 退出整个应用；额外工作区窗口 = 仅关闭该窗口。 */
export function ExitPrompt({ onBackground }: ExitPromptProps) {
  const label = getCurrentWindow().label;
  const isMain = label === "main";
  function onClose() {
    if (isMain) {
      void invoke("exit_app").catch(console.warn);
    } else {
      void invoke("close_workspace", { label }).catch(console.warn);
    }
  }
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
            放入后台后窗口继续运行，可按 Alt+Q 唤出全部窗口；直接关闭将
            {isMain ? "退出应用" : "关闭此工作区窗口"}。
          </p>
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>
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
