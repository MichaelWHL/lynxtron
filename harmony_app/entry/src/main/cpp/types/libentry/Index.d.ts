// TypeScript declaration for the lynxtron NAPI module.
// Matches the napi_property_descriptor exported from
// src/shell/app/main_harmony.cc::Init.

declare namespace lynxtron {
  /**
   * Run LynxtronMain in the calling thread. Bring-up smoke test;
   * future versions will accept a config object and dispatch on a
   * worker thread so the UIAbility main thread isn't blocked.
   *
   * @returns LynxtronMain's exit code.
   */
  function start(): number;

  /**
   * Asks the browser to exit gracefully (Application::Quit), the same path as
   * JS app.quit(). Mirrors electron_ohos's kAppQuit command. After the graceful
   * quit completes, the bridge posts the exit code to the ArkUI thread through
   * a thread-safe function and calls terminateSelf() on the ability context —
   * no polling and no exit() (which appspawn would abort on).
   */
  function quit(): void;

  /** Sends one final UTF-8 IME/text commit to the focused Lynx editable. */
  function sendText(text: string): void;

  /** Cached IME visibility and view-relative caret rectangle from Lynx. */
  function getTextInputState(): {
    visible: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /**
   * Reconciles the system input method with Lynx's focus state. Call from the
   * ArkUI thread on a short interval: it attaches the native text editor proxy
   * when a Lynx editable takes focus, detaches it when focus is lost, and
   * otherwise keeps the candidate window anchored to the caret.
   *
   * @returns whether the input method is currently attached.
   */
  function syncIme(): boolean;

  /**
   * Publishes the id of the window hosting the XComponent surface, so the
   * input method service can route text to it. Call once from
   * onWindowStageCreate, before any editable can take focus.
   */
  function setWindowId(id: number): void;

  /**
    * Registers a callback that receives window operation requests from
    * liblynxtron for a specific window id. The callback runs on the ArkUI
    * thread and should call the matching ArkTS Window methods on the Ability
    * instance that owns that window.
    */
  function registerWindowOpCallbackForWindow(
    windowId: number,
    callback: (windowId: number, op: string, value?: boolean) => void
  ): void;
  /**
    * Backward-compatible overload: registers a callback for window id 0.
    */
  function registerWindowOpCallback(
    callback: (op: string, value?: boolean) => void
  ): void;

  /** Notifies native powerMonitor listeners that the screen was locked. */
  function notifyPowerMonitorLockScreen(): void;

  /** Notifies native powerMonitor listeners that the screen was unlocked. */
  function notifyPowerMonitorUnlockScreen(): void;

  /**
   * Registers the ArkTS handler for dialog.showOpenDialog(). The handler
   * receives a request id plus the serialized dialog settings JSON, opens
   * the system file picker, and reports the result via resolveShowOpenDialog.
   */
  function registerShowOpenDialog(
    callback: (id: number, settings: string) => void
  ): void;

  /**
   * Resolves a pending showOpenDialog request from ArkTS. `uris` are the raw
   * picker URIs (used by C++ for OH_FileShare_PersistPermission — must be
   * file://docs URIs, not paths), `paths` are the real filesystem paths
   * converted by the ArkTS side (returned to JS as filePaths).
   */
  function resolveShowOpenDialog(
    id: number,
    uris: string[],
    paths: string[],
    canceled: boolean
  ): void;

  /**
   * Registers the ArkTS handler for dialog.showSaveDialog(). The handler
   * receives a request id plus the serialized dialog settings JSON, opens
   * the system save picker, and reports the result via resolveShowSaveDialog.
   */
  function registerShowSaveDialog(
    callback: (id: number, settings: string) => void
  ): void;

  /**
   * Resolves a pending showSaveDialog request from ArkTS. `uri` is the raw
   * picker URI (used by C++ for OH_FileShare_PersistPermission — must be a
   * file://docs URI, not a path), `path` is the real filesystem path converted
   * by the ArkTS side (returned to JS as filePath).
   */
  function resolveShowSaveDialog(
    id: number,
    uri: string,
    path: string,
    canceled: boolean
  ): void;
}

export default lynxtron;
