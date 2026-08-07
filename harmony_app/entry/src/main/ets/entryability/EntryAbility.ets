import UIAbility from '@ohos.app.ability.UIAbility';
import Want from '@ohos.app.ability.Want';
import AbilityConstant from '@ohos.app.ability.AbilityConstant';
import hilog from '@ohos.hilog';
import window from '@ohos.window';
import lynxtron from 'liblynxtron_napi.so';
import { BridgeRegistry } from '../bridge/BridgeRegistry';

const DOMAIN = 0x0000;
const TAG = 'Lynxtron';

function dumpWantParameters(want: Want): void {
  const params = want.parameters;
  if (!params) {
    hilog.warn(DOMAIN, TAG, 'want.parameters is null/undefined');
    return;
  }
  const dict = params as Record<string, Object>;
  const keys = Object.keys(dict);
  hilog.info(DOMAIN, TAG, 'want.parameters keys=[%{public}s]', keys.join(','));
  for (const k of keys) {
    hilog.info(DOMAIN, TAG, '  %{public}s = %{public}s', k, String(dict[k]));
  }
}

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG,
      'EntryAbility onCreate launchReason=%{public}d lastExitReason=%{public}d',
      launchParam.launchReason, launchParam.lastExitReason);

    dumpWantParameters(want);

    const params = want.parameters as Record<string, Object> | undefined;
    const debug = params?.['electron_debug'];
    if (debug !== undefined) {
      const value = String(debug);
      hilog.info(DOMAIN, TAG, '>>> electron_debug=%{public}s detected', value);
      AppStorage.setOrCreate('electron_debug', value);
    } else {
      hilog.info(DOMAIN, TAG, '(no electron_debug in launch params)');
    }
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG,
      'EntryAbility onNewWant launchReason=%{public}d', launchParam.launchReason);
    dumpWantParameters(want);
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, 'EntryAbility onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(DOMAIN, TAG, 'onWindowStageCreate');

    // The input method service routes text per window. XComponent draws its own
    // editable, so the native IME client (see lynxtron_napi_bridge.cc) has no
    // ArkUI node to infer the window from and must be told explicitly.
    try {
      const id: number = windowStage.getMainWindowSync().getWindowProperties().id;
      lynxtron.setWindowId(id);
      hilog.info(DOMAIN, TAG, 'published IME windowId=%{public}d', id);
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'setWindowId failed: %{public}s', String(e));
    }
    BridgeRegistry.registerAll(this.context);
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'loadContent failed: %{public}s',
          JSON.stringify(err) ?? '');
        return;
      }
      hilog.info(DOMAIN, TAG, 'loadContent OK');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, 'onWindowStageDestroy');
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, 'onForeground');
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, 'onBackground');
  }
}
