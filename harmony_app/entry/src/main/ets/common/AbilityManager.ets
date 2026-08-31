import common from '@ohos.app.ability.common';
import window from '@ohos.window';

export interface AbilityProxy {
  // C++ NativeWindowHarmony id used by parent/child creation requests.
  cppWindowId: number;
  // Cross-layer routing id. In Phase 1 this is the HarmonyOS system window id;
  // in Phase 2 it will be the C++-allocated window id passed via want.parameters.
  windowId: number;
  // HarmonyOS system window id, kept for IME and system API calls.
  originWindowId: number;
  context: common.UIAbilityContext;
  windowStage: window.WindowStage;
}

export class AbilityManager {
  private static readonly proxies: Map<number, AbilityProxy> = new Map();
  // Map from C++-allocated window id to the same proxy. Used when a child
  // window is created before its parent's HarmonyOS window id has been bound.
  private static readonly cppToProxy: Map<number, AbilityProxy> = new Map();

  static register(
    cppWindowId: number,
    windowId: number,
    originWindowId: number,
    context: common.UIAbilityContext,
    windowStage: window.WindowStage
  ): void {
    const proxy: AbilityProxy = { cppWindowId, windowId, originWindowId, context, windowStage };
    AbilityManager.proxies.set(windowId, proxy);
    if (cppWindowId > 0) {
      AbilityManager.cppToProxy.set(cppWindowId, proxy);
    }
  }

  static unregister(windowId: number): void {
    const proxy = AbilityManager.proxies.get(windowId);
    if (proxy) {
      AbilityManager.cppToProxy.delete(proxy.cppWindowId);
    }
    AbilityManager.proxies.delete(windowId);
  }

  static get(windowId: number): AbilityProxy | undefined {
    return AbilityManager.proxies.get(windowId);
  }

  static getByCppWindowId(cppWindowId: number): AbilityProxy | undefined {
    return AbilityManager.cppToProxy.get(cppWindowId);
  }

  static getContext(windowId: number): common.UIAbilityContext | undefined {
    return AbilityManager.proxies.get(windowId)?.context;
  }

  static getWindowStage(windowId: number): window.WindowStage | undefined {
    return AbilityManager.proxies.get(windowId)?.windowStage;
  }

  static getOriginWindowId(windowId: number): number {
    return AbilityManager.proxies.get(windowId)?.originWindowId ?? -1;
  }

  static getByContext(context: common.UIAbilityContext): AbilityProxy | undefined {
    for (const proxy of AbilityManager.proxies.values()) {
      if (proxy.context === context) {
        return proxy;
      }
    }
    return undefined;
  }

  static getAllWindowIds(): number[] {
    return Array.from(AbilityManager.proxies.keys());
  }
}
