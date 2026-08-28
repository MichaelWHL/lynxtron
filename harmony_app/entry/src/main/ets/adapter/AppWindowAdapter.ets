import Want from '@ohos.app.ability.Want';
import common from '@ohos.app.ability.common';
import { contextConstant, StartOptions } from '@kit.AbilityKit';
import bundleManager from '@ohos.bundle.bundleManager';
import { BusinessError } from '@ohos.base';
import hilog from '@ohos.hilog';
import window from '@ohos.window';
import display from '@ohos.display';
import lynxtron from 'liblynxtron_napi.so';
import BaseWindowAbility from '../ability/BaseWindowAbility';
import { AbilityManager } from '../common/AbilityManager';

const DOMAIN = 0x0000;
const TAG = 'AppWindowAdapter';

// startAbility() fails with 16000067 ("The StartOptions check failed") while
// the status-bar icon is not attached yet. The attach completes asynchronously
// (and its completion callback is unreliable), so probe by retrying.
const ERR_START_OPTIONS_CHECK_FAILED = 16000067;
const START_MAX_ATTEMPTS = 25;
const START_RETRY_INTERVAL_MS = 200;

export interface WindowBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Options passed from C++ NativeWindowHarmony via the NAPI bridge.
// Mirrors lynxtron::HarmonyWindowCreationOptions in C++.
export interface CreateWindowOptions {
  windowId: number;
  type: 'main' | 'sub' | 'float' | 'panel' | 'dialog';
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
  center?: boolean;
  hasX?: boolean;
  hasY?: boolean;
  fullscreen?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  modal?: boolean;
  displayId?: number;
}

// Legacy param used by EntryAbility to launch the first WindowAbility.
export interface CreateWindowParam {
  context: common.UIAbilityContext;
  instanceKey: string;
  abilityName: string;
  show: boolean;
  bounds?: WindowBounds;
}

function centerBounds(bounds: WindowBounds, targetDisplay?: display.Display): WindowBounds {
  try {
    const disp = targetDisplay ?? display.getDefaultDisplaySync();
    return {
      left: Math.round((disp.width - bounds.width) / 2),
      top: Math.round((disp.height - bounds.height) / 2),
      width: bounds.width,
      height: bounds.height,
    };
  } catch (e) {
    hilog.warn(DOMAIN, TAG, 'centerBounds failed: %{public}s', String(e));
    return bounds;
  }
}

function getInternalDisplayId(): number {
  // The internal/built-in display must have sourceMode MAIN. In extend mode
  // getPrimaryDisplaySync/getDefaultDisplaySync may return the external
  // monitor, which cannot host an Ability, so only accept MAIN here.
  try {
    const primary = display.getPrimaryDisplaySync();
    if (primary.sourceMode === display.DisplaySourceMode.MAIN) {
      return primary.id;
    }
    hilog.warn(DOMAIN, TAG,
      'getPrimaryDisplaySync id=%{public}d sourceMode=%{public}d is not MAIN, keep searching',
      primary.id, primary.sourceMode);
  } catch (e) {
    hilog.warn(DOMAIN, TAG, 'getPrimaryDisplaySync failed: %{public}s', String(e));
  }
  try {
    const defaultDisp = display.getDefaultDisplaySync();
    if (defaultDisp.sourceMode === display.DisplaySourceMode.MAIN) {
      return defaultDisp.id;
    }
    hilog.warn(DOMAIN, TAG,
      'getDefaultDisplaySync id=%{public}d sourceMode=%{public}d is not MAIN, keep searching',
      defaultDisp.id, defaultDisp.sourceMode);
  } catch (e) {
    hilog.warn(DOMAIN, TAG, 'getDefaultDisplaySync failed: %{public}s', String(e));
  }
  return 0;
}

function getEntryAbilityDisplayId(): number | undefined {
  const id = AppStorage.get<number>('entry_ability_display_id');
  if (id === undefined || id < 0) {
    return undefined;
  }
  try {
    const disp = display.getDisplayByIdSync(id);
    if (isUsableSourceMode(disp.sourceMode)) {
      return id;
    }
    hilog.warn(DOMAIN, TAG,
      'entry_ability_display_id=%{public}d sourceMode=%{public}d is not usable, ignore',
      id, disp.sourceMode);
  } catch (e) {
    hilog.warn(DOMAIN, TAG,
      'entry_ability_display_id=%{public}d invalid: %{public}s', id, String(e));
  }
  return undefined;
}

function getDisplayByIdOrDefault(displayId: number): display.Display | undefined {
  try {
    return display.getDisplayByIdSync(displayId);
  } catch (e) {
    hilog.warn(DOMAIN, TAG, 'getDisplayByIdSync(%{public}d) failed: %{public}s', displayId, String(e));
  }
  try {
    return display.getDefaultDisplaySync();
  } catch (e) {
    hilog.warn(DOMAIN, TAG, 'getDefaultDisplaySync fallback failed: %{public}s', String(e));
  }
  return undefined;
}

function isUsableSourceMode(mode: display.DisplaySourceMode | undefined): boolean {
  if (mode === undefined) {
    return false;
  }
  return mode === display.DisplaySourceMode.MAIN || mode === display.DisplaySourceMode.EXTEND;
}

function resolveDisplayId(requestedDisplayId?: number): number {
  if (requestedDisplayId !== undefined && requestedDisplayId >= 0) {
    try {
      const disp = display.getDisplayByIdSync(requestedDisplayId);
      const mode = disp.sourceMode;
      if (isUsableSourceMode(mode)) {
        return requestedDisplayId;
      }
      hilog.warn(DOMAIN, TAG,
        'requestedDisplayId=%{public}d sourceMode=%{public}d is not usable, fallback',
        requestedDisplayId, mode);
    } catch (e) {
      hilog.warn(DOMAIN, TAG,
        'requestedDisplayId=%{public}d is invalid: %{public}s, fallback',
        requestedDisplayId, String(e));
    }
  }
  // Prefer the display where EntryAbility is running; otherwise fall back to
  // the built-in MAIN display.
  const entryDisplayId = getEntryAbilityDisplayId();
  if (entryDisplayId !== undefined) {
    return entryDisplayId;
  }
  return getInternalDisplayId();
}

function getAbilityNameForType(type: string): string {
  switch (type) {
    case 'float':
      return 'FloatWindowAbility';
    case 'sub':
      return 'SubWindowAbility';
    case 'panel':
    case 'dialog':
      // For now reuse FloatWindowAbility for panel/dialog until dedicated
      // abilities are added.
      return 'FloatWindowAbility';
    case 'main':
    default:
      return 'WindowAbility';
  }
}

export class AppWindowAdapter {
  // Called from C++ via the NAPI bridge when JS does `new BaseWindow(options)`.
  static createWindowFromCpp(options: CreateWindowOptions): void {
    hilog.info(DOMAIN, TAG,
      'createWindowFromCpp windowId=%{public}d type=%{public}s bounds=%{public}d,%{public}d,%{public}dx%{public}d',
      options.windowId, options.type,
      options.x ?? 0, options.y ?? 0,
      options.width ?? 800, options.height ?? 600);

    // Resolve the target display. Mirror-mode displays cannot host an Ability,
    // so fall back to the internal display when no valid display is requested.
    const requestedDisplayId = options.displayId;
    const resolvedDisplayId = resolveDisplayId(requestedDisplayId);
    const targetDisplay = getDisplayByIdOrDefault(resolvedDisplayId);
    hilog.info(DOMAIN, TAG,
      'createWindowFromCpp requestedDisplayId=%{public}d resolvedDisplayId=%{public}d sourceMode=%{public}d',
      requestedDisplayId ?? -1, resolvedDisplayId, targetDisplay?.sourceMode ?? -1);

    // Compute initial bounds, applying center if requested and no explicit x/y
    // were provided. Update options.x/y so that BaseWindowAbility.applyWindowOptions
    // also positions the window at the same place.
    let bounds: WindowBounds = {
      left: options.x ?? 100,
      top: options.y ?? 100,
      width: options.width ?? 800,
      height: options.height ?? 600,
    };
    if (options.center === true && options.hasX !== true && options.hasY !== true) {
      bounds = centerBounds(bounds, targetDisplay);
      options.x = bounds.left;
      options.y = bounds.top;
    }

    // Diagnostic logging for multi-display / mirror-mode issues.
    try {
      const defaultDisp = display.getDefaultDisplaySync();
      hilog.info(DOMAIN, TAG,
        'createWindowFromCpp default display id=%{public}d width=%{public}d height=%{public}d',
        defaultDisp.id, defaultDisp.width, defaultDisp.height);

      display.getAllDisplays()
        .then((displays) => {
          for (const d of displays) {
            hilog.info(DOMAIN, TAG,
              'createWindowFromCpp all display id=%{public}d width=%{public}d height=%{public}d density=%{public}f',
              d.id, d.width, d.height, d.densityPixels);
          }
        })
        .catch((e: Error) => {
          hilog.error(DOMAIN, TAG, 'createWindowFromCpp getAllDisplays failed: %{public}s', String(e));
        });
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'createWindowFromCpp log display failed: %{public}s', String(e));
    }

    if (options.type === 'sub' || options.type === 'panel' || options.type === 'dialog') {
      const parentHarmonyId = options.parentHarmonyWindowId ?? -1;
      let parent = parentHarmonyId > 0 ? AbilityManager.get(parentHarmonyId) : undefined;
      if (!parent && options.parentWindowId && options.parentWindowId > 0) {
        parent = AbilityManager.getByCppWindowId(options.parentWindowId);
      }
      if (parent && parent.windowStage) {
        AppWindowAdapter.createSubWindowFromCpp(parent.windowStage, parent.context, options);
        return;
      }
      hilog.warn(DOMAIN, TAG,
        '%{public}s window parent not found (parentHarmonyWindowId=%{public}d, parentWindowId=%{public}d), fallback to ability',
        options.type, parentHarmonyId, options.parentWindowId ?? -1);
    }

    const context = AppWindowAdapter.getActiveContext();
    if (!context) {
      hilog.error(DOMAIN, TAG, 'createWindowFromCpp: no active UIAbilityContext');
      return;
    }

    let bundleName = '';
    try {
      const bundleInfo = bundleManager.getBundleInfoForSelfSync(
        bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
      bundleName = bundleInfo.name;
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'getBundleInfoForSelfSync failed: %{public}s', String(e));
      return;
    }

    const abilityName = getAbilityNameForType(options.type);
    const want: Want = {
      bundleName: bundleName,
      abilityName: abilityName,
      parameters: {
        instanceKey: String(options.windowId),
        cppWindowId: options.windowId,
        windowType: options.type,
        x: options.x ?? 0,
        y: options.y ?? 0,
        width: options.width ?? 800,
        height: options.height ?? 600,
        show: options.show ?? true,
        title: options.title ?? '',
        resizable: options.resizable ?? true,
        movable: options.movable ?? true,
        minimizable: options.minimizable ?? true,
        maximizable: options.maximizable ?? true,
        closable: options.closable ?? true,
        focusable: options.focusable ?? true,
        alwaysOnTop: options.alwaysOnTop ?? false,
        parentWindowId: options.parentWindowId ?? -1,
        parentHarmonyWindowId: options.parentHarmonyWindowId ?? -1,
        center: options.center ?? false,
        hasX: options.hasX ?? false,
        hasY: options.hasY ?? false,
        fullscreen: options.fullscreen ?? false,
        minWidth: options.minWidth ?? 0,
        minHeight: options.minHeight ?? 0,
        maxWidth: options.maxWidth ?? 0,
        maxHeight: options.maxHeight ?? 0,
        modal: options.modal ?? false,
      },
    };

    hilog.info(DOMAIN, TAG,
      'createWindowFromCpp startAbility bounds left=%{public}d top=%{public}d width=%{public}d height=%{public}d',
      bounds.left, bounds.top, bounds.width, bounds.height);

    const startOptions: StartOptions = {
      processMode: contextConstant.ProcessMode.ATTACH_TO_STATUS_BAR_ITEM,
      startupVisibility: (options.show ?? true)
        ? contextConstant.StartupVisibility.STARTUP_SHOW
        : contextConstant.StartupVisibility.STARTUP_HIDE,
      windowLeft: bounds.left,
      windowTop: bounds.top,
      windowWidth: bounds.width,
      windowHeight: bounds.height,
      displayId: resolvedDisplayId,
    };

    const param: CreateWindowParam = {
      context,
      instanceKey: String(options.windowId),
      abilityName,
      show: options.show ?? true,
      bounds,
    };

    AppWindowAdapter.startAbilityWithRetry(param, want, startOptions, 1);
  }

  // Legacy entry point used by EntryAbility to create the initial window.
  static createWindow(param: CreateWindowParam): void {
    let bundleName = '';
    try {
      const bundleInfo = bundleManager.getBundleInfoForSelfSync(
        bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
      bundleName = bundleInfo.name;
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'getBundleInfoForSelfSync failed: %{public}s', String(e));
      return;
    }

    const want: Want = {
      bundleName: bundleName,
      abilityName: param.abilityName,
      parameters: {
        instanceKey: param.instanceKey,
        electron_debug: AppStorage.get<string>('electron_debug') ?? '',
      },
    };

    const bounds: WindowBounds = param.bounds ?? { left: 100, top: 100, width: 800, height: 600 };
    const options: StartOptions = {
      processMode: contextConstant.ProcessMode.ATTACH_TO_STATUS_BAR_ITEM,
      startupVisibility: param.show
        ? contextConstant.StartupVisibility.STARTUP_SHOW
        : contextConstant.StartupVisibility.STARTUP_HIDE,
      windowLeft: bounds.left,
      windowTop: bounds.top,
      windowWidth: bounds.width,
      windowHeight: bounds.height,
    };

    AppWindowAdapter.startAbilityWithRetry(param, want, options, 1);
  }

  private static createSubWindowFromCpp(
    parentStage: window.WindowStage,
    parentContext: common.UIAbilityContext,
    options: CreateWindowOptions
  ): void {
    const name = `lynxtron-sub-${options.windowId}`;
    hilog.info(DOMAIN, TAG, 'createSubWindowFromCpp name=%{public}s', name);

    const subWindowOptions: window.SubWindowOptions = {
      title: options.title ?? '',
      decorEnabled: true,
      isModal: options.modal ?? false,
      maximizeSupported: options.maximizable ?? true,
      outlineEnabled: false,
    };
    parentStage.createSubWindowWithOptions(name, subWindowOptions)
      .then((subWindow) => {
        const originWindowId = subWindow.getWindowProperties().id;
        AbilityManager.register(options.windowId, originWindowId, originWindowId, parentContext, parentStage);

        // Title and title-bar buttons.
        try {
          subWindow.setWindowTitle(options.title ?? '');
        } catch (e) {
          hilog.error(DOMAIN, TAG, 'subWindow setWindowTitle failed: %{public}s', String(e));
        }
        try {
          subWindow.setWindowTitleButtonVisible(
            options.maximizable ?? true,
            options.minimizable ?? true,
            options.closable ?? true
          );
        } catch (e) {
          hilog.error(DOMAIN, TAG, 'subWindow setWindowTitleButtonVisible failed: %{public}s', String(e));
        }
        try {
          subWindow.setResizeByDragEnabled(options.resizable ?? true);
        } catch (e) {
          hilog.error(DOMAIN, TAG, 'subWindow setResizeByDragEnabled failed: %{public}s', String(e));
        }
        try {
          subWindow.setWindowTitleMoveEnabled(options.movable ?? true);
        } catch (e) {
          hilog.error(DOMAIN, TAG, 'subWindow setWindowTitleMoveEnabled failed: %{public}s', String(e));
        }

        // Bounds.
        let targetX = options.x ?? 0;
        let targetY = options.y ?? 0;
        const targetWidth = options.width ?? 400;
        const targetHeight = options.height ?? 300;
        if (options.center === true && options.hasX !== true && options.hasY !== true) {
          const centered = centerBounds({
            left: 0,
            top: 0,
            width: targetWidth,
            height: targetHeight,
          });
          targetX = centered.left;
          targetY = centered.top;
        }
        subWindow.moveWindowToAsync(targetX, targetY)
          .then(() => hilog.info(DOMAIN, TAG, 'subWindow moveWindowToAsync OK'))
          .catch((e: BusinessError) => hilog.error(DOMAIN, TAG, 'subWindow moveWindowToAsync failed: %{public}s', JSON.stringify(e)));
        subWindow.resizeAsync(targetWidth, targetHeight)
          .then(() => hilog.info(DOMAIN, TAG, 'subWindow resizeAsync OK'))
          .catch((e: BusinessError) => hilog.error(DOMAIN, TAG, 'subWindow resizeAsync failed: %{public}s', JSON.stringify(e)));

        // Always on top.
        if (options.alwaysOnTop) {
          subWindow.setWindowTopmost(true)
            .then(() => hilog.info(DOMAIN, TAG, 'subWindow setWindowTopmost OK'))
            .catch((e: BusinessError) => hilog.error(DOMAIN, TAG, 'subWindow setWindowTopmost failed: %{public}s', JSON.stringify(e)));
        }

        // Initial fullscreen.
        if (options.fullscreen) {
          subWindow.maximize(window.MaximizePresentation.ENTER_IMMERSIVE)
            .then(() => hilog.info(DOMAIN, TAG, 'subWindow enter-full-screen OK'))
            .catch((e: BusinessError) => hilog.error(DOMAIN, TAG, 'subWindow enter-full-screen failed: %{public}s', JSON.stringify(e)));
        }

        // Size constraints.
        if (options.minWidth || options.minHeight || options.maxWidth || options.maxHeight) {
          try {
            subWindow.setWindowLimits({
              minWidth: options.minWidth ?? 0,
              minHeight: options.minHeight ?? 0,
              maxWidth: options.maxWidth ?? 0,
              maxHeight: options.maxHeight ?? 0,
            })
              .then(() => hilog.info(DOMAIN, TAG, 'subWindow setWindowLimits OK'))
              .catch((e: BusinessError) => hilog.error(DOMAIN, TAG, 'subWindow setWindowLimits failed: %{public}s', JSON.stringify(e)));
          } catch (e) {
            hilog.error(DOMAIN, TAG, 'subWindow setWindowLimits failed: %{public}s', String(e));
          }
        }

        // Subwindow focus behavior aligned with libelectron: keep the soft
        // keyboard usable but start non-focused so the parent keeps focus.
        try {
          subWindow.keepKeyboardOnFocus(true);
        } catch (e) {
          hilog.error(DOMAIN, TAG, 'subWindow keepKeyboardOnFocus failed: %{public}s', String(e));
        }
        subWindow.setWindowFocusable(false)
          .then(() => hilog.info(DOMAIN, TAG, 'subWindow setWindowFocusable(false) OK'))
          .catch((e: BusinessError) => hilog.error(DOMAIN, TAG, 'subWindow setWindowFocusable(false) failed: %{public}s', JSON.stringify(e)));

        // Bind C++ window id to the subwindow's HarmonyOS window id.
        lynxtron.setWindowIdForWindow(options.windowId, originWindowId);

        // Register window operation callbacks (minimize/restore/show/close/etc.).
        BaseWindowAbility.registerWindowOpCallbackForWindow(originWindowId, subWindow, parentContext);

        // Load UI content and show.
        subWindow.setUIContent('pages/Index', (err) => {
          if (err?.code) {
            hilog.error(DOMAIN, TAG, 'subWindow setUIContent failed: %{public}s', JSON.stringify(err) ?? '');
            return;
          }
          hilog.info(DOMAIN, TAG, 'subWindow setUIContent OK');
          if (options.show !== false) {
            subWindow.showWindow()
              .then(() => {
                hilog.info(DOMAIN, TAG, 'subWindow showWindow OK');
                BaseWindowAbility.reportWindowRect(originWindowId, subWindow);
              })
              .catch((e: BusinessError) => hilog.error(DOMAIN, TAG, 'subWindow showWindow failed: %{public}s', JSON.stringify(e)));
          }
        });
    })
    .catch((err: BusinessError) => {
      hilog.error(DOMAIN, TAG, 'createSubWindowWithOptions failed: %{public}s', JSON.stringify(err) ?? '');
    });
  }

  private static startAbilityWithRetry(
    param: CreateWindowParam,
    want: Want,
    options: StartOptions,
    attempt: number,
  ): void {
    if (attempt === 1) {
      hilog.info(DOMAIN, TAG,
        'startAbility abilityName=%{public}s instanceKey=%{public}s show=%{public}s',
        param.abilityName, param.instanceKey, String(param.show));
    }

    param.context.startAbility(want, options)
      .then(() => {
        hilog.info(DOMAIN, TAG, 'startAbility success attempt=%{public}d', attempt);
      })
      .catch((e: BusinessError) => {
        if (e?.code === ERR_START_OPTIONS_CHECK_FAILED && attempt < START_MAX_ATTEMPTS) {
          hilog.warn(DOMAIN, TAG,
            'startAbility 16000067, retry %{public}d/%{public}d in %{public}dms',
            attempt, START_MAX_ATTEMPTS, START_RETRY_INTERVAL_MS);
          setTimeout(() => {
            AppWindowAdapter.startAbilityWithRetry(param, want, options, attempt + 1);
          }, START_RETRY_INTERVAL_MS);
          return;
        }
        hilog.error(DOMAIN, TAG,
          'startAbility failed after %{public}d attempt(s): %{public}d %{public}s',
          attempt, e?.code ?? -1, e?.message ?? String(e));
      });
  }

  private static getActiveContext(): common.UIAbilityContext | undefined {
    // The active context is the context of the currently running Ability.
    // For the first window it is EntryAbility; for subsequent windows it can
    // be any existing WindowAbility. We retrieve it from the global app storage
    // set by BaseWindowAbility.onWindowStageCreate.
    return AppStorage.get<common.UIAbilityContext>('active_ability_context');
  }
}
