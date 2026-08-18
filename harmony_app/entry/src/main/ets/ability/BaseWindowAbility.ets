import UIAbility from '@ohos.app.ability.UIAbility';
import common from '@ohos.app.ability.common';
import Want from '@ohos.app.ability.Want';
import AbilityConstant from '@ohos.app.ability.AbilityConstant';
import hilog from '@ohos.hilog';
import window from '@ohos.window';
import backgroundTaskManager from '@ohos.backgroundTaskManager';
import bundleManager from '@ohos.bundle.bundleManager';
import { BusinessError } from '@ohos.base';
import lynxtron from 'liblynxtron_napi.so';
import { AbilityManager } from '../common/AbilityManager';
import { WindowBounds } from '../adapter/AppWindowAdapter';

const DOMAIN = 0x0000;
const TAG = 'BaseWindowAbility';

// Window options mirrored from C++ HarmonyWindowCreationOptions / AppWindowAdapter.
interface WindowLaunchOptions {
  windowId: number;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  show?: boolean;
  title?: string;
  resizable?: boolean;
  movable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  closable?: boolean;
  focusable?: boolean;
  alwaysOnTop?: boolean;
  parentWindowId?: number;
  parentHarmonyWindowId?: number;
  fullscreen?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  modal?: boolean;
}

export default abstract class BaseWindowAbility extends UIAbility {
  protected windowId: number = -1;
  protected originWindowId: number = -1;
  protected launchOptions: WindowLaunchOptions = { windowId: -1, type: 'main' };
  protected suspendDelayInfo?: backgroundTaskManager.DelaySuspendInfo;

  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    const params = want.parameters as Record<string, Object> | undefined;
    this.launchOptions = {
      windowId: Number(params?.['windowId'] ?? -1),
      type: String(params?.['windowType'] ?? params?.['type'] ?? 'main'),
      x: Number(params?.['x'] ?? 0),
      y: Number(params?.['y'] ?? 0),
      width: Number(params?.['width'] ?? 800),
      height: Number(params?.['height'] ?? 600),
      show: params?.['show'] === undefined ? true : Boolean(params?.['show']),
      title: params?.['title'] !== undefined ? String(params?.['title']) : undefined,
      resizable: params?.['resizable'] === undefined ? true : Boolean(params?.['resizable']),
      movable: params?.['movable'] === undefined ? true : Boolean(params?.['movable']),
      minimizable: params?.['minimizable'] === undefined ? true : Boolean(params?.['minimizable']),
      maximizable: params?.['maximizable'] === undefined ? true : Boolean(params?.['maximizable']),
      closable: params?.['closable'] === undefined ? true : Boolean(params?.['closable']),
      focusable: params?.['focusable'] === undefined ? true : Boolean(params?.['focusable']),
      alwaysOnTop: params?.['alwaysOnTop'] === undefined ? false : Boolean(params?.['alwaysOnTop']),
      parentWindowId: params?.['parentWindowId'] !== undefined ? Number(params?.['parentWindowId']) : undefined,
      parentHarmonyWindowId: params?.['parentHarmonyWindowId'] !== undefined ? Number(params?.['parentHarmonyWindowId']) : undefined,
      fullscreen: params?.['fullscreen'] === undefined ? false : Boolean(params?.['fullscreen']),
      minWidth: params?.['minWidth'] !== undefined ? Number(params?.['minWidth']) : undefined,
      minHeight: params?.['minHeight'] !== undefined ? Number(params?.['minHeight']) : undefined,
      maxWidth: params?.['maxWidth'] !== undefined ? Number(params?.['maxWidth']) : undefined,
      maxHeight: params?.['maxHeight'] !== undefined ? Number(params?.['maxHeight']) : undefined,
      modal: params?.['modal'] === undefined ? false : Boolean(params?.['modal']),
    };

    hilog.info(DOMAIN, TAG,
      'onCreate instanceKey=%{public}s launchReason=%{public}d cppWindowId=%{public}d type=%{public}s',
      String(want.parameters?.['instanceKey']), launchParam.launchReason,
      this.launchOptions.windowId, this.launchOptions.type);
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG,
      'onNewWant instanceKey=%{public}s launchReason=%{public}d',
      String(want.parameters?.['instanceKey']), launchParam.launchReason);
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, 'onDestroy windowId=%{public}d', this.windowId);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(DOMAIN, TAG, 'onWindowStageCreate');
    try {
      const mainWindow = windowStage.getMainWindowSync();
      const originWindowId = mainWindow.getWindowProperties().id;
      this.originWindowId = originWindowId;
      this.windowId = originWindowId;

      // Publish this Ability's context so that AppWindowAdapter can use it to
      // start subsequent windows.
      AppStorage.setOrCreate('active_ability_context', this.context);

      // Bind the C++ window id to this HarmonyOS window id.
      const cppWindowId = this.launchOptions.windowId;
      AbilityManager.register(cppWindowId, this.windowId, originWindowId, this.context, windowStage);
      if (cppWindowId > 0) {
        lynxtron.setWindowIdForWindow(cppWindowId, originWindowId);
      } else {
        // Legacy path: the first window launched by EntryAbility has no cppWindowId.
        lynxtron.setWindowId(originWindowId);
      }

      this.registerWindowOpCallback(windowStage);
      BaseWindowAbility.registerWindowLifecycleListeners(this.windowId, mainWindow);

      // Load the page first; window decoration options (title, buttons,
      // resizable/movable, topmost, supported modes) are applied in the
      // loadContent callback once the window is actually ready.
      this.onWindowCreated(windowStage, mainWindow);

      hilog.info(DOMAIN, TAG,
        'windowId=%{public}d originWindowId=%{public}d cppWindowId=%{public}d registered',
        this.windowId, originWindowId, cppWindowId);
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'window setup failed: %{public}s', String(e));
    }
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, 'onWindowStageDestroy windowId=%{public}d', this.windowId);
    if (this.windowId >= 0) {
      // Notify C++ even if the window was closed manually so the native side
      // stops treating it as alive. This is a fallback for Ability windows;
      // subwindows rely on the windowEvent listener registered below.
      lynxtron.notifyWindowState(this.windowId, 'closed');
    }
    AbilityManager.unregister(this.windowId);
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, 'onForeground windowId=%{public}d', this.windowId);
    if (this.windowId >= 0) {
      lynxtron.notifyWindowState(this.windowId, 'foreground');
    }
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, 'onBackground windowId=%{public}d', this.windowId);
    if (this.windowId >= 0) {
      lynxtron.notifyWindowState(this.windowId, 'background');
    }
    this.requestSuspendDelayForWindowOps();
  }

  protected abstract onWindowCreated(windowStage: window.WindowStage, mainWindow: window.Window): void;

  // Subclasses call this from their loadContent success callback. Several
  // window decoration APIs (title, title-bar buttons, drag/move, topmost,
  // supported modes) must not be used before the window/page is ready.
  protected applyWindowOptions(mainWindow: window.Window, windowStage: window.WindowStage): void {
    const opts = this.launchOptions;

    // Title.
    if (opts.title !== undefined && opts.title.length > 0) {
      try {
        mainWindow.setWindowTitle(opts.title);
      } catch (e) {
        hilog.error(DOMAIN, TAG, 'setWindowTitle failed: %{public}s', String(e));
      }
    }

    // Title-bar buttons (only if the system title bar is visible).
    try {
      mainWindow.setWindowTitleButtonVisible(
        opts.maximizable ?? true,
        opts.minimizable ?? true,
        opts.closable ?? true,
      );
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'setWindowTitleButtonVisible failed: %{public}s', String(e));
    }

    // Resizable / movable.
    try {
      mainWindow.setResizeByDragEnabled(opts.resizable ?? true);
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'setResizeByDragEnabled failed: %{public}s', String(e));
    }
    try {
      mainWindow.setWindowTitleMoveEnabled(opts.movable ?? true);
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'setWindowTitleMoveEnabled failed: %{public}s', String(e));
    }

    // Always on top.
    if (opts.alwaysOnTop) {
      mainWindow.setWindowTopmost(true)
        .then(() => hilog.info(DOMAIN, TAG, 'setWindowTopmost OK'))
        .catch((e: BusinessError) => hilog.error(DOMAIN, TAG, 'setWindowTopmost failed: %{public}s', JSON.stringify(e)));
    }

    // Bounds and initial visibility are already expressed through
    // StartOptions (windowLeft/windowTop/windowWidth/windowHeight and
    // startupVisibility) when the Ability is launched. Do not call
    // resizeAsync/moveWindowToAsync/showWindow/minimize here before
    // loadContent() — that can leave the window stuck on the start-window
    // icon because the UI content has not been loaded yet.

    // Supported window modes reflect maximizable.
    try {
      windowStage.setSupportedWindowModes(
        (opts.maximizable ?? true)
          ? [bundleManager.SupportWindowMode.FLOATING, bundleManager.SupportWindowMode.SPLIT, bundleManager.SupportWindowMode.FULL_SCREEN]
          : [bundleManager.SupportWindowMode.FLOATING]
      );
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'setSupportedWindowModes failed: %{public}s', String(e));
    }

    // Initial fullscreen.
    if (opts.fullscreen) {
      mainWindow.maximize(window.MaximizePresentation.ENTER_IMMERSIVE)
        .then(() => hilog.info(DOMAIN, TAG, 'enter-full-screen OK'))
        .catch((e: BusinessError) => hilog.error(DOMAIN, TAG, 'enter-full-screen failed: %{public}s', JSON.stringify(e)));
    }

    // Size constraints. 0 means no limit on that dimension.
    if (opts.minWidth || opts.minHeight || opts.maxWidth || opts.maxHeight) {
      try {
        mainWindow.setWindowLimits({
          minWidth: opts.minWidth ?? 0,
          minHeight: opts.minHeight ?? 0,
          maxWidth: opts.maxWidth ?? 0,
          maxHeight: opts.maxHeight ?? 0,
        })
          .then(() => hilog.info(DOMAIN, TAG, 'setWindowLimits OK'))
          .catch((e: BusinessError) => hilog.error(DOMAIN, TAG, 'setWindowLimits failed: %{public}s', JSON.stringify(e)));
      } catch (e) {
        hilog.error(DOMAIN, TAG, 'setWindowLimits failed: %{public}s', String(e));
      }
    }
  }

  // Keep the Ability alive long enough to perform window operations (especially
  // restore) after the window has been minimized and the Ability has moved to
  // the background. Without this, ArkTS window APIs such as restore() return
  // 1300004 because the Ability event loop is suspended.
  private requestSuspendDelayForWindowOps(): void {
    try {
      if (this.suspendDelayInfo) {
        backgroundTaskManager.cancelSuspendDelay(this.suspendDelayInfo.requestId);
      }
      this.suspendDelayInfo = backgroundTaskManager.requestSuspendDelay('window-ops', () => {
        hilog.info(DOMAIN, TAG, 'suspend delay for window ops is about to expire');
      });
      hilog.info(DOMAIN, TAG, 'requestSuspendDelay success id=%{public}d', this.suspendDelayInfo.requestId);
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'requestSuspendDelay failed: %{public}s', String(e));
    }
  }

  private registerWindowOpCallback(windowStage: window.WindowStage): void {
    BaseWindowAbility.registerWindowOpCallbackForWindow(
      this.windowId,
      windowStage.getMainWindowSync(),
      this.context,
      () => this.requestSuspendDelayForWindowOps(),
      () => this.context.showAbility()
    );
  }

  // Public so AppWindowAdapter can register the same listeners for subwindows
  // created via windowStage.createSubWindow().
  static registerWindowLifecycleListeners(windowId: number, win: window.Window): void {
    if (windowId < 0) {
      hilog.warn(DOMAIN, TAG, 'registerWindowLifecycleListeners: invalid windowId');
      return;
    }

    // Keep C++ window-state cache and JS events in sync with manual
    // minimize/maximize/fullscreen/restore.
    try {
      let lastStatus = window.WindowStatusType.UNDEFINED;
      win.on('windowStatusChange', (status: window.WindowStatusType) => {
        if (status === lastStatus) {
          return;
        }
        const previousStatus = lastStatus;
        lastStatus = status;

        hilog.info(DOMAIN, TAG,
          'windowStatusChange windowId=%{public}d prev=%{public}d curr=%{public}d',
          windowId, previousStatus, status);

        // Transitions out of fullscreen.
        if (previousStatus === window.WindowStatusType.FULL_SCREEN &&
            status !== window.WindowStatusType.FULL_SCREEN) {
          lynxtron.notifyWindowState(windowId, 'leave-full-screen');
        }

        switch (status) {
          case window.WindowStatusType.MINIMIZE:
            lynxtron.notifyWindowState(windowId, 'minimize');
            break;
          case window.WindowStatusType.MAXIMIZE:
            lynxtron.notifyWindowState(windowId, 'maximize');
            break;
          case window.WindowStatusType.FULL_SCREEN:
            lynxtron.notifyWindowState(windowId, 'enter-full-screen');
            break;
          default:
            // FLOATING, SPLIT_SCREEN, UNDEFINED: window is back to a normal
            // (non-minimized, non-maximized) state.
            if (previousStatus === window.WindowStatusType.MINIMIZE ||
                previousStatus === window.WindowStatusType.MAXIMIZE) {
              lynxtron.notifyWindowState(windowId, 'restore');
            }
            break;
        }
      });
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'register windowStatusChange failed: %{public}s', String(e));
    }

    // Detect manual show/hide/close for both main Ability windows and subwindows.
    try {
      win.on('windowEvent', (event: window.WindowEventType) => {
        if (event === window.WindowEventType.WINDOW_DESTROYED) {
          hilog.info(DOMAIN, TAG, 'windowEvent WINDOW_DESTROYED windowId=%{public}d', windowId);
          lynxtron.notifyWindowState(windowId, 'closed');
        } else if (event === window.WindowEventType.WINDOW_SHOWN) {
          hilog.info(DOMAIN, TAG, 'windowEvent WINDOW_SHOWN windowId=%{public}d', windowId);
          lynxtron.notifyWindowState(windowId, 'show');
        } else if (event === window.WindowEventType.WINDOW_HIDDEN) {
          hilog.info(DOMAIN, TAG, 'windowEvent WINDOW_HIDDEN windowId=%{public}d', windowId);
          lynxtron.notifyWindowState(windowId, 'hide');
        }
      });
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'register windowEvent failed: %{public}s', String(e));
    }

    // Forward resize completion to C++ so JS 'resized' fires. DRAG_END means
    // the user has finished a drag-resize; RECOVER/MAXIMIZE cover restore and
    // maximize transitions that also change the window size. DRAG_START is
    // forwarded as 'will-resize' with the target bounds so JS can observe the
    // resize before it completes.
    try {
      win.on('windowRectChange', (option: window.RectChangeOptions) => {
        const reason = option.reason;
        const rect = option.rect;
        const bounds: WindowBounds | undefined = rect ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        } : undefined;

        if (reason === window.RectChangeReason.DRAG_START && bounds) {
          hilog.info(DOMAIN, TAG,
            'windowRectChange windowId=%{public}d reason=%{public}d will-resize',
            windowId, reason);
          lynxtron.notifyWindowState(windowId, 'will-resize', bounds);
          return;
        }

        if (reason !== window.RectChangeReason.DRAG_END &&
            reason !== window.RectChangeReason.RECOVER &&
            reason !== window.RectChangeReason.MAXIMIZE) {
          return;
        }
        hilog.info(DOMAIN, TAG,
          'windowRectChange windowId=%{public}d reason=%{public}d',
          windowId, reason);
        lynxtron.notifyWindowState(windowId, 'resized');
      });
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'register windowRectChange failed: %{public}s', String(e));
    }
  }

  // Public so AppWindowAdapter can register window-op callbacks for subwindows
  // created via windowStage.createSubWindow().
  static registerWindowOpCallbackForWindow(
    windowId: number,
    win: window.Window,
    context: common.UIAbilityContext,
    onMinimize?: () => void,
    showAbility?: () => Promise<void>
  ): void {
    lynxtron.registerWindowOpCallbackForWindow(windowId, (_id: number, op: string, value?: boolean) => {
      hilog.info(DOMAIN, TAG, 'windowOp %{public}s value=%{public}s', op, String(value));
      try {
        const windowStatus = win.getWindowStatus();
        const isMinimized = windowStatus === window.WindowStatusType.MINIMIZE;
        hilog.info(DOMAIN, TAG,
          'windowOp %{public}s status=%{public}d minimized=%{public}s',
          op, windowStatus, String(isMinimized));

        switch (op) {
          case 'minimize':
            if (onMinimize) onMinimize();
            win.minimize()
              .then(() => BaseWindowAbility.recordWindowOpResult('minimize', 'OK'))
              .catch((e: Error) => BaseWindowAbility.recordWindowOpResult('minimize', 'ERR', String(e)));
            break;
          case 'maximize':
            win.maximize(window.MaximizePresentation.EXIT_IMMERSIVE)
              .then(() => BaseWindowAbility.recordWindowOpResult('maximize', 'OK'))
              .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('maximize', 'ERR', BaseWindowAbility.errText(e)));
            break;
          case 'enter-full-screen':
            win.maximize(window.MaximizePresentation.ENTER_IMMERSIVE)
              .then(() => BaseWindowAbility.recordWindowOpResult('enter-full-screen', 'OK'))
              .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('enter-full-screen', 'ERR', BaseWindowAbility.errText(e)));
            break;
          case 'leave-full-screen':
            win.recover()
              .then(() => BaseWindowAbility.recordWindowOpResult('leave-full-screen', 'OK'))
              .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('leave-full-screen', 'ERR', BaseWindowAbility.errText(e)));
            break;
          case 'restore':
            if (windowStatus === window.WindowStatusType.FULL_SCREEN ||
                windowStatus === window.WindowStatusType.MAXIMIZE) {
              win.recover()
                .then(() => BaseWindowAbility.recordWindowOpResult('restore', 'OK', 'recover'))
                .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('restore', 'ERR', `recover:${BaseWindowAbility.errText(e)}`));
            } else if (windowStatus === window.WindowStatusType.MINIMIZE) {
              if (onMinimize) onMinimize();
              win.restore()
                .then(() => BaseWindowAbility.recordWindowOpResult('restore', 'OK', 'restore'))
                .catch((e: BusinessError) => {
                  BaseWindowAbility.recordWindowOpResult('restore', 'ERR', `restore:${BaseWindowAbility.errText(e)}`);
                  if (showAbility) {
                    showAbility()
                      .then(() => BaseWindowAbility.recordWindowOpResult('restore', 'OK', 'showAbility-fallback'))
                      .catch((e2: BusinessError) => BaseWindowAbility.recordWindowOpResult('restore', 'ERR', `showAbility:${BaseWindowAbility.errText(e2)}`));
                  }
                });
            } else {
              BaseWindowAbility.recordWindowOpResult('restore', 'OK', `already-normal status=${windowStatus}`);
            }
            break;
          case 'show':
            win.showWindow()
              .then(() => BaseWindowAbility.recordWindowOpResult('show', 'OK', 'showWindow'))
              .catch((e: BusinessError) => {
                BaseWindowAbility.recordWindowOpResult('show', 'ERR', `showWindow:${BaseWindowAbility.errText(e)}`);
                if (showAbility) {
                  showAbility()
                    .then(() => BaseWindowAbility.recordWindowOpResult('show', 'OK', 'showAbility-fallback'))
                    .catch((e2: BusinessError) => BaseWindowAbility.recordWindowOpResult('show', 'ERR', `showAbility:${BaseWindowAbility.errText(e2)}`));
                }
              });
            break;
          case 'close':
            // For subwindows win.destroyWindow() closes just the subwindow;
            // for main Ability windows terminateSelf() ends the Ability.
            if (showAbility) {
              context.terminateSelf()
                .then(() => BaseWindowAbility.recordWindowOpResult('close', 'OK', 'terminateSelf'))
                .catch((e: Error) => BaseWindowAbility.recordWindowOpResult('close', 'ERR', `terminateSelf:${String(e)}`));
            } else {
              win.destroyWindow()
                .then(() => BaseWindowAbility.recordWindowOpResult('close', 'OK', 'destroyWindow'))
                .catch((e: Error) => BaseWindowAbility.recordWindowOpResult('close', 'ERR', `destroyWindow:${String(e)}`));
            }
            break;
          case 'focus':
            if (value === false) {
              BaseWindowAbility.recordWindowOpResult('focus', 'OK', 'no-op-blur');
            } else if (showAbility) {
              showAbility()
                .then(() => BaseWindowAbility.recordWindowOpResult('focus', 'OK', 'showAbility'))
                .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('focus', 'ERR', `showAbility:${BaseWindowAbility.errText(e)}`));
            } else {
              win.showWindow()
                .then(() => BaseWindowAbility.recordWindowOpResult('focus', 'OK', 'showWindow'))
                .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('focus', 'ERR', `showWindow:${BaseWindowAbility.errText(e)}`));
            }
            break;
          case 'setAlwaysOnTop':
            win.setWindowTopmost(value ?? false)
              .then(() => BaseWindowAbility.recordWindowOpResult('setAlwaysOnTop', 'OK'))
              .catch((e: Error) => BaseWindowAbility.recordWindowOpResult('setAlwaysOnTop', 'ERR', String(e)));
            break;
          default:
            hilog.warn(DOMAIN, TAG, 'unknown windowOp %{public}s', op);
        }
      } catch (e) {
        hilog.error(DOMAIN, TAG, 'windowOp %{public}s failed: %{public}s', op, String(e));
      }
    });
  }

  private static errText(e: BusinessError): string {
    return e ? `${e.code} ${e.message}` : 'unknown error';
  }

  private static recordWindowOpResult(op: string, result: string, detail?: string): void {
    hilog.info(DOMAIN, TAG, 'windowOp %{public}s %{public}s %{public}s', op, result, detail ?? '');
  }
}
