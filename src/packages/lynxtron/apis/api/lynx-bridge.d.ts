// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { LynxBridgeInvokeEvent } from './lynx-window';

export type LynxBridgeHandler = (
  event: LynxBridgeInvokeEvent,
  args: unknown
) => unknown | Promise<unknown>;

export interface LynxBridge extends NodeJS.EventEmitter {
  /**
   * Register a handler for an invoke method. The handler will be called when
   * the Lynx side calls `bridge.call(method, args)`.
   *
   * The return value of the handler will be sent back to the Lynx side via
   * `event.sendReply()`.
   */
  handle(method: string, handler: LynxBridgeHandler): void;

  /**
   * Register a one-time handler for an invoke method. The handler will be
   * removed after it is called once.
   */
  handleOnce(method: string, handler: LynxBridgeHandler): void;

  /**
   * Remove a previously registered handler for the given method.
   */
  removeHandler(method: string): void;
}

export declare const lynxBridge: LynxBridge;
