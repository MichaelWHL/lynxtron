import common from '@ohos.app.ability.common';
import window from '@ohos.window';
import { LynxWindowProxy } from './LynxWindowProxy';

export class AbilityManager {
  private static readonly proxies: Map<number, LynxWindowProxy> = new Map();
  // Map from C++-allocated window id to the same proxy. Used when a child
  // window is created before its parent's HarmonyOS window id has been bound.
  private static readonly cppToProxy: Map<number, LynxWindowProxy> = new Map();

  static addProxy(proxy: LynxWindowProxy): void {
    AbilityManager.proxies.set(proxy.getOriginWindowId(), proxy);
    const cppId = proxy.getCppWindowId();
    if (cppId > 0) {
      AbilityManager.cppToProxy.set(cppId, proxy);
    }
  }

  static removeProxy(proxy: LynxWindowProxy): void {
    AbilityManager.cppToProxy.delete(proxy.getCppWindowId());
    AbilityManager.proxies.delete(proxy.getOriginWindowId());
  }

  static updateCppWindowId(proxy: LynxWindowProxy, newCppWindowId: number): void {
    AbilityManager.cppToProxy.delete(proxy.getCppWindowId());
    proxy.setCppWindowId(newCppWindowId);
    AbilityManager.cppToProxy.set(newCppWindowId, proxy);
  }

  static get(windowId: number): LynxWindowProxy | undefined {
    return AbilityManager.proxies.get(windowId);
  }

  static getByCppWindowId(cppWindowId: number): LynxWindowProxy | undefined {
    return AbilityManager.cppToProxy.get(cppWindowId);
  }

  static getByOriginWindowId(originWindowId: number): LynxWindowProxy | undefined {
    return AbilityManager.proxies.get(originWindowId);
  }

  static getByContext(context: common.UIAbilityContext): LynxWindowProxy | undefined {
    for (const proxy of AbilityManager.proxies.values()) {
      if (proxy.getWindowContext() === context) {
        return proxy;
      }
    }
    return undefined;
  }

  // Returns the placeholder proxy created by EntryAbility before its C++ window
  // id is known (cppWindowId === 0).
  static getMainProxy(): LynxWindowProxy | undefined {
    for (const proxy of AbilityManager.proxies.values()) {
      if (proxy.getCppWindowId() === 0) {
        return proxy;
      }
    }
    return undefined;
  }

  static getAllWindowIds(): number[] {
    return Array.from(AbilityManager.proxies.keys());
  }

  // Backward-compatible helpers used by adapters.
  static getContext(windowId: number): common.UIAbilityContext | undefined {
    return AbilityManager.proxies.get(windowId)?.getWindowContext();
  }

  static getWindowStage(windowId: number): window.WindowStage | undefined {
    return AbilityManager.proxies.get(windowId)?.getWindowStage();
  }

  static getOriginWindowId(windowId: number): number {
    return AbilityManager.proxies.get(windowId)?.getOriginWindowId() ?? -1;
  }
}
