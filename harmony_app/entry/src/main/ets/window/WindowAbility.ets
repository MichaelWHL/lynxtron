import window from '@ohos.window';
import hilog from '@ohos.hilog';
import BaseWindowAbility from '../ability/BaseWindowAbility';

const DOMAIN = 0x0000;
const TAG = 'WindowAbility';

export default class WindowAbility extends BaseWindowAbility {
  onWindowCreated(windowStage: window.WindowStage, mainWindow: window.Window): void {
    hilog.info(DOMAIN, TAG, 'onWindowCreated windowId=%{public}d', this.windowId);

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
