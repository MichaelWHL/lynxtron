import common from '@ohos.app.ability.common';
import window from '@ohos.window';

// Unified proxy interface for AbilityManager. A BaseWindowAbility instance
// implements this interface so that window management logic can operate on
// windows without knowing the concrete Ability class.
export interface LynxWindowProxy {
  getWindow(): window.Window;
  getWindowStage(): window.WindowStage;
  getWindowContext(): common.UIAbilityContext;
  getWindowId(): number;
  getOriginWindowId(): number;
  getCppWindowId(): number;
  setCppWindowId(id: number): void;
  isMainAbility(): boolean;
}
