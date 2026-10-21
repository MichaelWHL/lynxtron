import hilog from '@ohos.hilog';
import window from '@ohos.window';
import display from '@ohos.display';
import lynxtron from 'liblynxtron_napi.so';

const DOMAIN = 0x0000;
const TAG = 'WindowUtils';

const densityTrackedWindows: Set<number> = new Set<number>();

function reportWindowPixelRatio(windowId: number, win: window.Window): void {
  try {
    // Use this window's display, not the process-wide default display.
    const displayId = win.getWindowProperties().displayId;
    const ratio = display.getDisplayByIdSync(displayId).densityPixels;
    if (Number.isFinite(ratio) && ratio > 0) {
      lynxtron.notifyWindowPixelRatio(windowId, ratio);
    }
  } catch (e) {
    // Preserve the last good native ratio if the display disappears mid-move.
    hilog.warn(DOMAIN, TAG, 'reportWindowPixelRatio failed: %{public}s', String(e));
  }
}

export function trackWindowPixelRatio(windowId: number, win: window.Window): void {
  reportWindowPixelRatio(windowId, win);
  if (densityTrackedWindows.has(windowId)) return;
  densityTrackedWindows.add(windowId);
  const onDisplayChange = (_displayId: number): void => {
    reportWindowPixelRatio(windowId, win);
  };
  const onDensityChange = (_density: number): void => {
    reportWindowPixelRatio(windowId, win);
  };
  try {
    win.on('displayIdChange', onDisplayChange);
  } catch (e) {
    hilog.warn(DOMAIN, TAG, 'displayIdChange unsupported: %{public}s', String(e));
  }
  try {
    win.on('systemDensityChange', onDensityChange);
  } catch (e) {
    hilog.warn(DOMAIN, TAG, 'systemDensityChange unsupported: %{public}s', String(e));
  }
  try {
    win.on('windowEvent', (event: window.WindowEventType) => {
      if (event !== window.WindowEventType.WINDOW_DESTROYED) return;
      densityTrackedWindows.delete(windowId);
      try { win.off('displayIdChange', onDisplayChange); } catch (_) {}
      try { win.off('systemDensityChange', onDensityChange); } catch (_) {}
    });
  } catch (e) {
    hilog.warn(DOMAIN, TAG, 'density listener cleanup registration failed: %{public}s', String(e));
  }
}

// Reports the actual OS window rect (windowRect) to the C++ layer. The C++
// layer keeps this separate from bounds_, which tracks the drawable/content
// rect updated by XComponent surface callbacks.
export function reportWindowRect(windowId: number, win: window.Window): void {
  // Also re-query on moves/resizes as a fallback on devices without listeners.
  trackWindowPixelRatio(windowId, win);
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
