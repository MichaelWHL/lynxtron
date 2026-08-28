import UIAbility from '@ohos.app.ability.UIAbility';
import Want from '@ohos.app.ability.Want';
import AbilityConstant from '@ohos.app.ability.AbilityConstant';
import { BusinessError } from '@ohos.base';
import hilog from '@ohos.hilog';
import window from '@ohos.window';
import { StatusBarManager } from '../manager/StatusBarManager';
import LogUtil from '../utils/LogUtils';
import AppAdapter from '../adapter/AppAdapter';
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

    AppStorage.setOrCreate('abilityContext', this.context);
    AppAdapter.getInstance().setAbilityContext(this.context);

    this.handleWantUri(want);
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG,
      'EntryAbility onNewWant launchReason=%{public}d', launchParam.launchReason);
    dumpWantParameters(want);
    LogUtil.info(TAG,
      `[ohoswindow] in WebAbility onNewWant, want is ${JSON.stringify(want)}, param is ${JSON.stringify(launchParam)}.`);
    this.handleWantUri(want);
  }

  private handleWantUri(want: Want): void {
    let uriNotNull = want["uri"] !== undefined && want["uri"] !== '';
    if (!uriNotNull) {
      return;
    }
    let uri = want['uri'] as string;
    if (uri.startsWith("file://docs/")) {
      AppAdapter.getInstance().openNewWindow(uri.replace("file://docs/", "file:///"));
    } else if (uri.startsWith("file:///")) {
      AppAdapter.getInstance().openNewWindow(uri);
    } else {
      LogUtil.debug(TAG, `Trigger open-url event. uri = ${uri}`);
      AppAdapter.getInstance().openURL(uri);
    }
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, 'EntryAbility onDestroy');
    // System/ArkTS side wants to quit: route through the graceful native path
    // (Application::Quit, same as JS app.quit()) rather than force-killing the
    // detached LynxtronMain thread. Mirrors electron_ohos's kAppQuit command.
    AppAdapter.getInstance().quit();
  }

  async onWindowStageCreate(windowStage: window.WindowStage): Promise<void> {
    hilog.info(DOMAIN, TAG, 'onWindowStageCreate');

    // EntryAbility does not host an XComponent and does NOT create any app window
    // itself. Both app windows are created by the JS app via `new LynxWindow()`,
    // which flows through the C++ driven path (LynxtronCreateHarmonyWindow →
    // createWindowFromCpp → WindowAbility). Publish this ability's context so
    // createWindowFromCpp can call startAbility before any WindowAbility exists.
    AppStorage.setOrCreate('active_ability_context', this.context);
    BridgeRegistry.registerAll(this.context);
    // Initialize the status-bar item, then start LynxtronMain.
    StatusBarManager.init(this.context)
      .then(() => {
        hilog.info(DOMAIN, TAG, 'StatusBarManager.init OK');
      })
      .catch((e: BusinessError) => {
        hilog.error(DOMAIN, TAG, 'StatusBarManager.init failed: %{public}s', String(e));
      });

    const mainWindow = windowStage.getMainWindowSync();
    try {
      const props = mainWindow.getWindowProperties();
      const displayId = props.displayId;
      AppStorage.setOrCreate('entry_ability_display_id', displayId);
      hilog.info(DOMAIN, TAG, 'EntryAbility displayId=%{public}d', displayId);
    } catch (e) {
      hilog.warn(DOMAIN, TAG, 'EntryAbility get displayId failed: %{public}s', String(e));
    }

    mainWindow.setUIContent('pages/Entry', (err) => {
      lynxtron.setWindowObject(mainWindow);
      // mainWindow.setWindowDecorVisible(false);
      // mainWindow.setWindowTitleButtonVisible(false, false, false)
      // mainWindow.maximize(window.MaximizePresentation.ENTER_IMMERSIVE_DISABLE_TITLE_AND_DOCK_HOVER)
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'setUIContent failed: %{public}s',
          JSON.stringify(err) ?? '');
        return;
      }
      hilog.info(DOMAIN, TAG, 'setUIContent OK');

      // Start LynxtronMain. The JS app (default_app.ts) then creates BOTH app
      // windows through `new LynxWindow()` → LynxtronCreateHarmonyWindow →
      // createWindowFromCpp. No window is created here by EntryAbility.
      try {
        lynxtron.start();
        hilog.info(DOMAIN, TAG, 'lynxtron.start() OK');
      } catch (e) {
        hilog.error(DOMAIN, TAG, 'lynxtron.start() failed: %{public}s', String(e));
      }
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
