// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { LynxWindow, lynxBridge } from 'lynxtron';
import type { LynxBridgeInvokeEvent } from 'lynxtron';

import { expect } from 'chai';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { closeAllWindows } from './lib/window-helpers';

type EventCallback = LynxBridgeInvokeEvent;

describe('communication between node and lynx', () => {
  afterEach(async () => {
    lynxBridge.removeHandler('onRender-test-event');
    await closeAllWindows();
  });

  it('jsb from lynx', async function () {
    this.timeout(30000);
    const w = new LynxWindow({
      width: 800,
      height: 600,
      title: 'Lynxtron JSB Demo',
    });

    const invokePromise = once(w as any, '-lynx-invoke') as Promise<
      [EventCallback, string, any]
    >;

    const messagePromise = once(w as any, '-lynx-message') as Promise<
      [string, any]
    >;

    const bundlePath = path.resolve(
      __dirname,
      './case/lynx-card/dist/bridging-lynx-node.lynx.bundle'
    );
    expect(fs.existsSync(bundlePath)).to.equal(true);
    const started = await (w as any).loadFile(bundlePath);

    expect(started).to.equal(true);

    const [callback, methodName, params] = await Promise.race([
      invokePromise,
      setTimeout(10000).then(() => {
        throw new Error('Timed out waiting for -lynx-invoke');
      }),
    ]);

    expect(methodName).to.equal('onRender-test-event');
    expect(params.msg).to.equal('test-test');
    callback.sendReply({ methodName, params });

    const [messageMethod, messageParams] = await Promise.race([
      messagePromise,
      setTimeout(10000).then(() => {
        throw new Error('Timed out waiting for -lynx-message');
      }),
    ]);

    expect(messageMethod).to.equal('callback');
    expect(messageParams.from).to.deep.equal('-lynx-invoke-callback');
    expect(w.isDestroyed()).to.equal(false);
  });

  it('contextBridge', async function () {
    this.timeout(30000);
    const w = new LynxWindow({
      width: 800,
      height: 600,
      title: 'Lynxtron JSB Demo',
      lynxPreference: {
        preload: path.resolve(
          __dirname,
          './case/lynx-card/src/contextbridge-lynx-node/preload.js'
        ),
      },
    });

    const messagePromise = once(w as any, '-lynx-message') as Promise<
      [string, any]
    >;

    const bundlePath = path.resolve(
      __dirname,
      './case/lynx-card/dist/contextbridge-lynx-node.lynx.bundle'
    );
    expect(fs.existsSync(bundlePath)).to.equal(true);
    const started = await (w as any).loadFile(bundlePath);

    expect(started).to.equal(true);

    await w.sendGlobalEvent('node_event', { msg: 'test-test' });

    const [messageMethod, messageParams] = await Promise.race([
      messagePromise,
      setTimeout(10000).then(() => {
        throw new Error('Timed out waiting for -lynx-message');
      }),
    ]);

    expect(messageMethod).to.equal('nodejs_event');
    expect(messageParams.from).to.deep.equal('contextBridge');
    expect(w.isDestroyed()).to.equal(false);
  });

  it('lynxBridge.handle receives invoke from lynx', async function () {
    this.timeout(15000);

    const resultPromise = new Promise<{ method: string; args: unknown }>(
      (resolve) => {
        lynxBridge.handle('onRender-test-event', (_event, args) => {
          resolve({ method: 'onRender-test-event', args });
          return { success: true };
        });
      }
    );

    const w = new LynxWindow({
      width: 800,
      height: 600,
      title: 'Lynxtron LynxBridge Test',
    });

    const bundlePath = path.resolve(
      __dirname,
      './case/lynx-card/dist/bridging-lynx-node.lynx.bundle'
    );
    expect(fs.existsSync(bundlePath)).to.equal(true);
    w.loadFile(bundlePath);

    const result = await Promise.race([
      resultPromise,
      setTimeout(5000).then(() => {
        throw new Error('Timed out waiting for lynxBridge.handle');
      }),
    ]);

    expect(result.method).to.equal('onRender-test-event');
    expect((result.args as any).msg).to.equal('test-test');
  });

  it('lynxBridge.on receives message from lynx', async function () {
    this.timeout(15000);

    const w = new LynxWindow({
      width: 800,
      height: 600,
      title: 'Lynxtron LynxBridge Message Test',
    });

    // First handle the invoke so the Lynx side can proceed to send message
    lynxBridge.handle('onRender-test-event', (event, _args) => {
      event.sendReply({ success: true });
    });

    const messagePromise = once(lynxBridge, 'callback') as Promise<[any]>;

    const bundlePath = path.resolve(
      __dirname,
      './case/lynx-card/dist/bridging-lynx-node.lynx.bundle'
    );
    expect(fs.existsSync(bundlePath)).to.equal(true);
    w.loadFile(bundlePath);

    const [params] = await Promise.race([
      messagePromise,
      setTimeout(5000).then(() => {
        throw new Error('Timed out waiting for lynxBridge message');
      }),
    ]);

    expect(params.from).to.equal('-lynx-invoke-callback');
  });
});
