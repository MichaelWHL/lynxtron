import UIAbility from '@ohos.app.ability.UIAbility';
import common from '@ohos.app.ability.common';
import Want from '@ohos.app.ability.Want';
import AbilityConstant from '@ohos.app.ability.AbilityConstant';
import hilog from '@ohos.hilog';
import window from '@ohos.window';
import display from '@ohos.display';
import backgroundTaskManager from '@ohos.backgroundTaskManager';
import bundleManager from '@ohos.bundle.bundleManager';
import { BusinessError } from '@ohos.base';
import lynxtron from 'liblynxtron_napi.so';
import { AbilityManager } from '../common/AbilityManager';
import { WindowBounds } from '../adapter/AppWindowAdapter';

// Matches gfx::ResizeEdge in shell/ui/gfx/geometry/resize_utils.h and the
// plain-C enum duplicated in lynxtron_napi_bridge.cc / native_window_harmony.cc.
const RESIZE_EDGE_BOTTOM = 0;
const RESIZE_EDGE_BOTTOM_LEFT = 1;
const RESIZE_EDGE_BOTTOM_RIGHT = 2;
const RESIZE_EDGE_LEFT = 3;
const RESIZE_EDGE_RIGHT = 4;
const RESIZE_EDGE_TOP = 5;
const RESIZE_EDGE_TOP_LEFT = 6;
const RESIZE_EDGE_TOP_RIGHT = 7;

// JSON payloads received from the C++ window operation bridge.
interface BoundsPayload {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PositionPayload {
  x: number;
  y: number;
}

interface SizePayload {
  width: number;
  height: number;
}

interface TitlePayload {
  title: string;
}

interface WindowLimitsPayload {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

interface WindowBorders {
  leftBorder: number;
  topBorder: number;
  rightBorder: number;
  bottomBorder: number;
}

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
        if (previousStatus === window.WindowStatusType.FULL_SCREEN) {
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
        } else if (event === window.WindowEventType.WINDOW_INACTIVE) {
          hilog.info(DOMAIN, TAG, 'windowEvent WINDOW_INACTIVE windowId=%{public}d', windowId);
          lynxtron.notifyWindowState(windowId, 'blur');
        } else if (event === window.WindowEventType.WINDOW_ACTIVE) {
          hilog.info(DOMAIN, TAG, 'windowEvent WINDOW_ACTIVE windowId=%{public}d', windowId);
          lynxtron.notifyWindowState(windowId, 'focus');
        }
      });
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'register windowEvent failed: %{public}s', String(e));
    }

    // Forward resize completion to C++ so JS 'resized' fires. DRAG_END means
    // the user has finished a drag-resize; RECOVER/MAXIMIZE cover restore and
    // maximize transitions that also change the window size.
    //
    // The resize edge must not be derived from getLastPointerPosition(): while
    // dragging a window edge the pointer lives in the window frame (outside the
    // XComponent), so the cached position is stale and wildly wrong for the
    // top/bottom edges. Instead, snapshot the rect at DRAG_START and diff it
    // against the first DRAG rect — the edge that moved is the one being
    // dragged. 'will-resize' therefore fires on the first DRAG instead of
    // DRAG_START, but with a correct edge.
    try {
      let dragStartRect: window.Rect | null = null;
      win.on('windowRectChange', (option: window.RectChangeOptions) => {
        const reason = option.reason;

        // Report the actual OS window rect (windowRect) back to C++. This is
        // independent of the existing drag/resize event handling and does not
        // modify the original logic below.
        if (option.rect) {
          BaseWindowAbility.reportWindowRect(windowId, win);
        }

        if (reason === window.RectChangeReason.DRAG_START && option.rect) {
          dragStartRect = option.rect;
          return;
        }

        if (reason === window.RectChangeReason.DRAG && option.rect && dragStartRect) {
          const edge = BaseWindowAbility.computeResizeEdgeFromDelta(dragStartRect, option.rect);
          dragStartRect = null;
          hilog.info(DOMAIN, TAG,
            'windowRectChange windowId=%{public}d reason=%{public}d will-resize edge=%{public}d',
            windowId, reason, edge);
          lynxtron.notifyWindowState(windowId, 'will-resize', edge);
          return;
        }

        if (reason === window.RectChangeReason.DRAG_END) {
          dragStartRect = null;
          hilog.info(DOMAIN, TAG,
            'windowRectChange windowId=%{public}d reason=%{public}d',
            windowId, reason);
          lynxtron.notifyWindowState(windowId, 'resized');
          return;
        }
      });
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'register windowRectChange failed: %{public}s', String(e));
    }
  }

  // Determines which edge/corner was dragged by diffing the rect captured at
  // DRAG_START against the first DRAG rect. The edge whose coordinate moved is
  // the one being resized. Returns a gfx::ResizeEdge value so it can be passed
  // straight to notifyWindowState(..., 'will-resize', edge).
  private static computeResizeEdgeFromDelta(before: window.Rect, after: window.Rect): number {
    const leftChanged = before.left != after.left;
    const rightChanged = (before.left + before.width) != (after.left + after.width);
    const topChanged = before.top != after.top;
    const bottomChanged = (before.top + before.height) != (after.top + after.height);

    if (leftChanged && topChanged) {
      return RESIZE_EDGE_TOP_LEFT;
    }
    if (rightChanged && topChanged) {
      return RESIZE_EDGE_TOP_RIGHT;
    }
    if (leftChanged && bottomChanged) {
      return RESIZE_EDGE_BOTTOM_LEFT;
    }
    if (rightChanged && bottomChanged) {
      return RESIZE_EDGE_BOTTOM_RIGHT;
    }
    if (leftChanged) {
      return RESIZE_EDGE_LEFT;
    }
    if (rightChanged) {
      return RESIZE_EDGE_RIGHT;
    }
    if (topChanged) {
      return RESIZE_EDGE_TOP;
    }
    return RESIZE_EDGE_BOTTOM;
  }

  // Reports the actual OS window rect (windowRect) to the C++ layer. The C++
  // layer keeps this separate from bounds_, which tracks the drawable/content
  // rect updated by XComponent surface callbacks.
  public static reportWindowRect(windowId: number, win: window.Window): void {
    try {
      const rect = win.getWindowProperties().windowRect;
      if (!rect) {
        return;
      }
      lynxtron.notifyWindowRect(
        windowId,
        rect.left ?? 0,
        rect.top ?? 0,
        rect.width ?? 0,
        rect.height ?? 0
      );
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'reportWindowRect failed: %{public}s', String(e));
    }
  }

  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    const params = want.parameters as Record<string, Object> | undefined;
    this.launchOptions = {
      // The C++ driven path (AppWindowAdapter.createWindowFromCpp) puts the
      // C++-allocated window id under the key "cppWindowId"; the legacy
      // EntryAbility path used "windowId". Read both so C++-driven windows
      // correctly route through setWindowIdForWindow instead of the legacy
      // setWindowId single-window path.
      windowId: Number(params?.['cppWindowId'] ?? params?.['windowId'] ?? -1),
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

      // Diagnostic logging for multi-display / mirror-mode issues.
      try {
        const props = mainWindow.getWindowProperties();
        hilog.info(DOMAIN, TAG,
          'onWindowStageCreate mainWindow displayId=%{public}d windowId=%{public}d',
          props?.displayId, this.windowId);
      } catch (e) {
        hilog.warn(DOMAIN, TAG, 'onWindowStageCreate get displayId failed: %{public}s', String(e));
      }

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

      // Load the page first; window decoration options (title, buttons,
      // resizable/movable, topmost, supported modes) are applied in the
      // loadContent callback once the window is actually ready.
      this.onWindowCreated(windowStage, mainWindow);

      // register window events
      BaseWindowAbility.registerWindowLifecycleListeners(this.windowId, mainWindow);

      hilog.info(DOMAIN, TAG,
        'windowId=%{public}d originWindowId=%{public}d cppWindowId=%{public}d registered',
        this.windowId, originWindowId, cppWindowId);
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'window setup failed: %{public}s', String(e));
    }
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, 'onWindowStageDestroy windowId=%{public}d', this.windowId);
    AbilityManager.unregister(this.windowId);

    // If the Ability being destroyed is the current active context, the global
    // active context must be migrated to another living Ability. Otherwise
    // subsequent createWindowFromCpp calls will try to start an Ability from a
    // stale, terminated context and fail silently.
    const stored = AppStorage.get<common.UIAbilityContext>('active_ability_context');
    if (stored === this.context) {
      let fallback: common.UIAbilityContext | undefined;
      for (const id of AbilityManager.getAllWindowIds()) {
        const proxy = AbilityManager.get(id);
        if (proxy?.context && proxy.context !== this.context) {
          fallback = proxy.context;
          break;
        }
      }
      if (!fallback) {
        fallback = AppStorage.get<common.UIAbilityContext>('abilityContext');
      }
      if (fallback) {
        AppStorage.setOrCreate('active_ability_context', fallback);
      }
    }
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, 'onForeground windowId=%{public}d', this.windowId);
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, 'onBackground windowId=%{public}d', this.windowId);
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
    // setUIContent() — that can leave the window stuck on the start-window
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

    // Report the initial real window rect to C++ so getWindowSize() reflects the
    // actual OS window size rather than the drawable/content size.
    BaseWindowAbility.reportWindowRect(this.windowId, mainWindow);
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

  // Public so AppWindowAdapter can register window-op callbacks for subwindows
  // created via windowStage.createSubWindow().
  static registerWindowOpCallbackForWindow(
    windowId: number,
    win: window.Window,
    context: common.UIAbilityContext,
    onMinimize?: () => void,
    showAbility?: () => Promise<void>
  ): void {
    lynxtron.registerWindowOpCallbackForWindow(windowId, (_id: number, op: string, args?: string) => {
      hilog.info(DOMAIN, TAG, 'windowOp %{public}s args=%{public}s', op, args ?? '');
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
            // Main Ability windows that were hidden via hideAbility() must be
            // re-shown via showAbility(); subwindows use showWindow().
            if (showAbility) {
              showAbility()
                .then(() => BaseWindowAbility.recordWindowOpResult('show', 'OK', 'showAbility'))
                .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('show', 'ERR', `showAbility:${BaseWindowAbility.errText(e)}`));
            } else {
              win.showWindow()
                .then(() => BaseWindowAbility.recordWindowOpResult('show', 'OK', 'showWindow'))
                .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('show', 'ERR', `showWindow:${BaseWindowAbility.errText(e)}`));
            }
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
          case 'focus': {
            const focusValue = args ? JSON.parse(args) as boolean : true;
            if (focusValue === false) {
              win.setWindowFocusable(false)
                .then(() => BaseWindowAbility.recordWindowOpResult('focus', 'OK', 'setWindowFocusable-false'))
                .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('focus', 'ERR', `setWindowFocusable-false:${BaseWindowAbility.errText(e)}`));
            } else if (showAbility) {
              showAbility()
                .then(() => BaseWindowAbility.recordWindowOpResult('focus', 'OK', 'showAbility'))
                .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('focus', 'ERR', `showAbility:${BaseWindowAbility.errText(e)}`));
            } else {
              win.setWindowFocusable(true)
                .then(() => win.showWindow())
                .then(() => BaseWindowAbility.recordWindowOpResult('focus', 'OK', 'setWindowFocusable-true-showWindow'))
                .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('focus', 'ERR', `focus-true:${BaseWindowAbility.errText(e)}`));
            }
            break;
          }
          case 'setAlwaysOnTop': {
            const onTopValue = args ? JSON.parse(args) as boolean : false;
            win.setWindowTopmost(onTopValue)
              .then(() => BaseWindowAbility.recordWindowOpResult('setAlwaysOnTop', 'OK'))
              .catch((e: Error) => BaseWindowAbility.recordWindowOpResult('setAlwaysOnTop', 'ERR', String(e)));
            break;
          }
          case 'hide':
            // Main Ability windows are hidden via the Ability context; subwindows
            // do not have a separate hide API, so minimize them instead.
            if (showAbility) {
              context.hideAbility()
                .then(() => BaseWindowAbility.recordWindowOpResult('hide', 'OK', 'hideAbility'))
                .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('hide', 'ERR', `hideAbility:${BaseWindowAbility.errText(e)}`));
            } else {
              win.minimize()
                .then(() => BaseWindowAbility.recordWindowOpResult('hide', 'OK', 'minimize-fallback'))
                .catch((e: Error) => BaseWindowAbility.recordWindowOpResult('hide', 'ERR', String(e)));
            }
            break;
          case 'setBounds': {
            const bounds = args ? JSON.parse(args) as BoundsPayload : undefined;
            if (!bounds) {
              BaseWindowAbility.recordWindowOpResult('setBounds', 'ERR', 'missing-args');
              break;
            }
            if (BaseWindowAbility.skipIfImmersive(win, 'setBounds')) {
              break;
            }
            const adjusted = BaseWindowAbility.adjustBoundsForWindow(bounds, win);
            win.moveWindowToAsync(adjusted.x, adjusted.y)
              .then(() => win.resizeAsync(adjusted.width, adjusted.height))
              .then(() => BaseWindowAbility.recordWindowOpResult('setBounds', 'OK'))
              .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('setBounds', 'ERR', BaseWindowAbility.errText(e)));
            break;
          }
          case 'setPosition': {
            const pos = args ? JSON.parse(args) as PositionPayload : undefined;
            if (!pos) {
              BaseWindowAbility.recordWindowOpResult('setPosition', 'ERR', 'missing-args');
              break;
            }
            if (BaseWindowAbility.skipIfImmersive(win, 'setPosition')) {
              break;
            }
            const borders = BaseWindowAbility.getWindowBorders(win);
            win.moveWindowToAsync(pos.x - borders.leftBorder, pos.y - borders.topBorder)
              .then(() => BaseWindowAbility.recordWindowOpResult('setPosition', 'OK'))
              .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('setPosition', 'ERR', BaseWindowAbility.errText(e)));
            break;
          }
          case 'setSize': {
            const size = args ? JSON.parse(args) as SizePayload : undefined;
            if (!size) {
              BaseWindowAbility.recordWindowOpResult('setSize', 'ERR', 'missing-args');
              break;
            }
            if (BaseWindowAbility.skipIfImmersive(win, 'setSize')) {
              break;
            }
            const borders = BaseWindowAbility.getWindowBorders(win);
            win.resizeAsync(size.width + borders.leftBorder + borders.rightBorder,
                            size.height + borders.topBorder + borders.bottomBorder)
              .then(() => BaseWindowAbility.recordWindowOpResult('setSize', 'OK'))
              .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('setSize', 'ERR', BaseWindowAbility.errText(e)));
            break;
          }
          case 'setTitle': {
            const titlePayload = args ? JSON.parse(args) as TitlePayload : undefined;
            const title = titlePayload?.title ?? '';
            try {
              win.setWindowTitle(title);
              BaseWindowAbility.recordWindowOpResult('setTitle', 'OK');
            } catch (e) {
              BaseWindowAbility.recordWindowOpResult('setTitle', 'ERR', String(e));
            }
            break;
          }
          case 'setWindowLimits': {
            const limits = args ? JSON.parse(args) as WindowLimitsPayload : undefined;
            if (!limits) {
              BaseWindowAbility.recordWindowOpResult('setWindowLimits', 'ERR', 'missing-args');
              break;
            }
            const borders = BaseWindowAbility.getWindowBorders(win);
            win.setWindowLimits({
              minWidth: limits.minWidth === 0 ? 0 : limits.minWidth + borders.leftBorder + borders.rightBorder,
              minHeight: limits.minHeight === 0 ? 0 : limits.minHeight + borders.topBorder + borders.bottomBorder,
              maxWidth: limits.maxWidth === 0 ? 0 : limits.maxWidth + borders.leftBorder + borders.rightBorder,
              maxHeight: limits.maxHeight === 0 ? 0 : limits.maxHeight + borders.topBorder + borders.bottomBorder,
            })
              .then(() => BaseWindowAbility.recordWindowOpResult('setWindowLimits', 'OK'))
              .catch((e: BusinessError) => BaseWindowAbility.recordWindowOpResult('setWindowLimits', 'ERR', BaseWindowAbility.errText(e)));
            break;
          }
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

  private static skipIfImmersive(win: window.Window, op: string): boolean {
    const status = win.getWindowStatus();
    if (status === window.WindowStatusType.FULL_SCREEN ||
        status === window.WindowStatusType.MAXIMIZE ||
        status === window.WindowStatusType.MINIMIZE) {
      BaseWindowAbility.recordWindowOpResult(op, 'SKIPPED', `status=${status}`);
      return true;
    }
    return false;
  }

  private static recordWindowOpResult(op: string, result: string, detail?: string): void {
    hilog.info(DOMAIN, TAG, 'windowOp %{public}s %{public}s %{public}s', op, result, detail ?? '');
  }

  private static getWindowBorders(win: window.Window): WindowBorders {
    const props = win.getWindowProperties();
    const drawable = props?.drawableRect;
    const windowRect = props?.windowRect;
    const left = drawable?.left ?? 0;
    const top = drawable?.top ?? 0;
    const drawableWidth = drawable?.width ?? 0;
    const drawableHeight = drawable?.height ?? 0;
    const windowWidth = windowRect?.width ?? (left + drawableWidth);
    const windowHeight = windowRect?.height ?? (top + drawableHeight);
    return {
      leftBorder: left,
      topBorder: top,
      rightBorder: Math.max(0, windowWidth - drawableWidth - left),
      bottomBorder: Math.max(0, windowHeight - drawableHeight - top),
    };
  }

  private static adjustBoundsForWindow(bounds: BoundsPayload, win: window.Window): BoundsPayload {
    const borders = BaseWindowAbility.getWindowBorders(win);
    return {
      x: bounds.x - borders.leftBorder,
      y: bounds.y - borders.topBorder,
      width: bounds.width + borders.leftBorder + borders.rightBorder,
      height: bounds.height + borders.topBorder + borders.bottomBorder,
    };
  }
}
