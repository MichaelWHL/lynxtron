// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { wrapFsWithAsar } from '../node/asar-fs-wrapper';
import runPreloadScripts from './api/preload-runner';
import { APIS } from './api/context-bridge';

// Initialize ASAR support in the BTS Node context before preload scripts run.
wrapFsWithAsar(require('fs'));

interface BridgeRuntime {
  createPromise<T>(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void
    ) => void
  ): Promise<T>;
  flushMicrotasks(): void;
}

// --- Context Bridge Setup ---
(() => {
  let apisTarget: APIS | null = null;
  let bridgeRuntime: BridgeRuntime | null = null;
  const apis: APIS = {};
  const objectCache = new WeakMap<object, APIS>();

  function isThenable(value: unknown): value is PromiseLike<unknown> {
    return (
      !!value &&
      (typeof value === 'object' || typeof value === 'function') &&
      typeof (value as PromiseLike<unknown>).then === 'function'
    );
  }

  function mergeInPlace(target: APIS, source: APIS) {
    for (const [k, v] of Object.entries(source || {})) {
      target[k] = v;
    }
  }

  function wrapPromise<T>(value: T): T | Promise<unknown> {
    if (isThenable(value) && bridgeRuntime) {
      return wrapThenable(value);
    }
    return value;
  }

  function linkNodePromise<T>(
    thenable: PromiseLike<T>,
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: unknown) => void
  ) {
    // Install .then() from the Node realm. Some Node promises do not reliably
    // progress when their handlers are attached from the Lynx context.
    thenable.then(
      (value) => {
        resolve(value);
        bridgeRuntime?.flushMicrotasks();
      },
      (reason) => {
        reject(reason);
        bridgeRuntime?.flushMicrotasks();
      }
    );
  }

  function wrapThenable<T>(thenable: PromiseLike<T>): Promise<T> {
    // Allocate the wrapper Promise in the Lynx realm so caller-side await/.then
    // uses the same microtask queue as the consuming Lynx code.
    return bridgeRuntime!.createPromise<T>((resolve, reject) => {
      linkNodePromise(thenable, resolve, reject);
    });
  }

  function wrap<T>(value: T, receiver?: object): T | APIS | Promise<unknown> {
    if (typeof value === 'function') {
      return ((...args: unknown[]) =>
        wrapPromise(Reflect.apply(value, receiver, args))) as T;
    }
    if (isThenable(value) && bridgeRuntime) {
      return wrapThenable(value);
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    if (objectCache.has(value)) {
      return objectCache.get(value)!;
    }

    const exposed: APIS = {};
    objectCache.set(value, exposed);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) {
        continue;
      }
      Object.defineProperty(exposed, key, {
        enumerable: descriptor.enumerable,
        configurable: true,
        get() {
          return wrap(Reflect.get(value, key, value), value);
        },
      });
    }
    return exposed;
  }

  function initModuleAPI(moduleApis: APIS, runtime: BridgeRuntime) {
    apisTarget = moduleApis;
    bridgeRuntime = runtime;
    mergeInPlace(apisTarget, apis);
  }

  function exposeInLynxBTS(newApis: APIS) {
    if (!newApis || typeof newApis !== 'object') {
      return;
    }

    const wrappedApis = wrap(newApis) as APIS;
    mergeInPlace(apis, wrappedApis);
    if (apisTarget) {
      mergeInPlace(apisTarget, wrappedApis);
    }
  }

  Object.defineProperty(globalThis, '__contextBridge', {
    value: Object.freeze({
      initModuleAPI,
      exposeInLynxBTS,
    }),
    enumerable: false,
    configurable: false,
    writable: false,
  });
})();

const Module = require('module') as NodeJS.ModuleInternal;

const makeLynxtronModule = (name: string) => {
  const lynxtronModule = new Module('lynxtron', null);
  lynxtronModule.id = 'lynxtron';
  lynxtronModule.loaded = true;
  lynxtronModule.filename = name;
  Object.defineProperty(lynxtronModule, 'exports', {
    get: () => require('lynxtron'),
  });
  Module._cache[name] = lynxtronModule;
};

makeLynxtronModule('lynxtron');

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'lynxtron') {
    return 'lynxtron';
  } else {
    return originalResolveFilename(request, parent, isMain, options);
  }
};

const bridgeData: APIS = {};

// --- Lynxtron BTS Env Setup ---
export function setupLynxtronBTS(
  console: Console,
  preload_paths: string[],
  bridgeRuntime: BridgeRuntime
) {
  // replace console
  globalThis.console = console;
  // @ts-ignore
  globalThis.__contextBridge.initModuleAPI(bridgeData, bridgeRuntime);
  try {
    runPreloadScripts(preload_paths);
  } catch (e) {
    console.error('runPreloadScripts error: ', e);
  }
}

// --- Get Lynxtron BTS Bridge Data ---
export function getLynxtronBTSBridgeData() {
  return bridgeData;
}
