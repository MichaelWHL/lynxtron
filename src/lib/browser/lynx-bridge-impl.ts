// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { EventEmitter } from 'events';

interface LynxBridgeInvokeEvent {
  sendReply(result?: unknown): boolean;
}

type HandlerFn = (event: LynxBridgeInvokeEvent, args: any) => any;

export class LynxBridgeImpl extends EventEmitter {
  private _invokeHandlers: Map<string, HandlerFn> = new Map();

  constructor() {
    super();
    this.on('-internal-lynx-invoke', (event, channel, args) => {
      const fn = this._invokeHandlers.get(channel);
      if (fn && typeof fn === 'function') {
        fn(event, args);
      }
    });
  }

  handle(method: string, fn: HandlerFn) {
    if (this._invokeHandlers.has(method)) {
      throw new Error(`Attempted to register a second handler for '${method}'`);
    }
    if (typeof fn !== 'function') {
      throw new Error(
        `Expected handler to be a function, but found type '${typeof fn}'`
      );
    }

    this._invokeHandlers.set(method, async (event, args) => {
      event.sendReply(await Promise.resolve(fn(event, args)));
    });
  }

  handleOnce(method: string, fn: HandlerFn) {
    this.handle(method, (e, args) => {
      this.removeHandler(method);
      return fn(e, args);
    });
  }

  removeHandler(method: string) {
    this._invokeHandlers.delete(method);
  }
}
