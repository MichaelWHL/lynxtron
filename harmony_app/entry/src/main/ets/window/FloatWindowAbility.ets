import window from '@ohos.window';
import hilog from '@ohos.hilog';
import BaseWindowAbility from '../ability/BaseWindowAbility';

const DOMAIN = 0x0000;
const TAG = 'FloatWindowAbility';

export default class FloatWindowAbility extends BaseWindowAbility {
  onWindowCreated(windowStage: window.WindowStage, mainWindow: window.Window): void {
    hilog.info(DOMAIN, TAG, 'onWindowCreated windowId=%{public}d', this.windowId);

    // Phase 1: float window uses the same page as a normal window. The actual
    // floating behavior is controlled by StartOptions / windowStage configuration
    // and will be refined once the main+float creation path is stable.
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'loadContent failed: %{public}s', JSON.stringify(err) ?? '');
        return;
      }
      hilog.info(DOMAIN, TAG, 'loadContent OK');
      this.applyWindowOptions(mainWindow, windowStage);
    });
  }
}
