// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { BaseWindow, Event } from 'lynxtron';
import type { LynxWindow as LWT } from 'lynxtron';
import { onResourceFetcher, LynxFetchEvent } from './lynx-resource-fetcher';

const { LynxWindow } = process._linkedBinding('lynxtron_lynx_window') as {
  LynxWindow: typeof LWT;
};

Object.setPrototypeOf(LynxWindow.prototype, BaseWindow.prototype);

const nativeLoadFile = LynxWindow.prototype.loadFile;
const nativeLoadURL = LynxWindow.prototype.loadURL;
const nativeLoadBundle = LynxWindow.prototype.loadBundle;
const nativeUpdateMetaData = LynxWindow.prototype.updateMetaData;
const nativeSendGlobalEvent = LynxWindow.prototype.sendGlobalEvent;

// The native layer returns `false` only for synchronous input validation or
// request setup failures. Actual template load completion remains event-driven.
const normalizeLoadOptions = (method: string, options?: any) => {
  if (options == null) {
    return undefined;
  }
  if (typeof options !== 'object') {
    throw new TypeError(`${method} options must be an object`);
  }
  return options;
};

LynxWindow.prototype.loadFile = function (
  this: LWT,
  filePath: string,
  options?: any
): boolean {
  return (
    nativeLoadFile.call(
      this,
      filePath,
      normalizeLoadOptions('loadFile', options)
    ) !== false
  );
};

LynxWindow.prototype.loadURL = function (
  this: LWT,
  url: string,
  options?: any
): boolean {
  return (
    nativeLoadURL.call(this, url, normalizeLoadOptions('loadURL', options)) !==
    false
  );
};

LynxWindow.prototype.loadBundle = function (
  this: LWT,
  templateBundle: any,
  options?: any
): boolean {
  return (
    nativeLoadBundle.call(
      this,
      templateBundle,
      normalizeLoadOptions('loadBundle', options)
    ) !== false
  );
};

LynxWindow.prototype.updateMetaData = function (this: LWT, meta: any): boolean {
  if (!meta || typeof meta !== 'object') {
    throw new TypeError('updateMetaData requires a LynxUpdateMeta instance');
  }
  return nativeUpdateMetaData.call(this, meta);
};

LynxWindow.prototype.sendGlobalEvent = function (
  this: LWT,
  eventName: string,
  ...args: any[]
): boolean {
  return nativeSendGlobalEvent.call(this, eventName, [...args]);
};

LynxWindow.prototype._init = function (this: LWT) {
  // Call parent class's _init.
  BaseWindow.prototype._init.call(this);

  // Avoid recursive require.
  const { app } = require('lynxtron');

  // Set ID at constructon time so it's accessible after
  // underlying window destruction.
  const id = this.id;
  Object.defineProperty(this, 'id', {
    value: id,
    writable: false,
  });

  const nativeSetBounds = this.setBounds;
  this.setBounds = (bounds, ...opts) => {
    bounds = {
      ...this.getBounds(),
      ...bounds,
    };
    nativeSetBounds.call(this, bounds, ...opts);
  };

  // Handle bridge.call() invocations from the Lynx renderer (TSX).
  // The LynxBridgeModule calls EmitWithoutEvent("-lynx-invoke", channel, ...args)
  // which triggers this event with (event, channel, ...rest).
  // We resolve known channels to C++ linked bindings and invoke the callback.
  this.on('-lynx-invoke', function (this: LWT, event: any, channel: string, callback: any) {
    console.log('[zybapi] lynx-window -lynx-invoke channel=', channel);
    if (channel === 'checkAppUpdate') {
      console.log('[zybapi] lynx-window dispatching checkAppUpdate');
      const bindings = process._linkedBinding('lynxtron_binding_update_check');
      bindings.checkAppUpdate()
        .then((result: any) => { console.log('[zybapi] lynx-window checkAppUpdate resolved:', JSON.stringify(result).substring(0, 200)); if (typeof callback === 'function') callback(result); })
        .catch((err: any) => { console.log('[zybapi] lynx-window checkAppUpdate rejected:', err); if (typeof callback === 'function') callback({ error: true, message: String(err) }); });
    } else if (channel === 'showUpdateDialog') {
      console.log('[zybapi] lynx-window dispatching showUpdateDialog');
      const bindings = process._linkedBinding('lynxtron_binding_update_check');
      bindings.showUpdateDialog()
        .then((result: any) => { console.log('[zybapi] lynx-window showUpdateDialog resolved:', result); if (typeof callback === 'function') callback({ resultCode: result }); })
        .catch((err: any) => { console.log('[zybapi] lynx-window showUpdateDialog rejected:', err); if (typeof callback === 'function') callback({ error: true, message: String(err) }); });
    } else if (channel === 'loadProduct') {
      console.log('[zybapi] lynx-window dispatching loadProduct');
      const bindings = process._linkedBinding('lynxtron_binding_update_check');
      // args[0] holds the params JSON from the Lynx page
      const params = event && event.sender ? undefined : (arguments.length > 2 ? arguments[2] : '{}');
      const paramsJson = typeof params === 'string' ? params : JSON.stringify(params || {});
      console.log('[zybapi] lynx-window loadProduct paramsJson=', paramsJson);
      bindings.loadProduct(paramsJson)
        .then((result: any) => { console.log('[zybapi] lynx-window loadProduct resolved:', JSON.stringify(result).substring(0, 200)); if (typeof callback === 'function') callback(result); })
        .catch((err: any) => { console.log('[zybapi] lynx-window loadProduct rejected:', err); if (typeof callback === 'function') callback({ error: true, message: String(err) }); });
    }
  });

  // Dispatch messages from lynx window to the LynxBridgeMain module.
  // this.on('-lynx-message', function (this: LWT, event, channel, args) {
  //   lynxBridgeMain.emit(channel, event, args);
  // });

  // this.on('-lynx-invoke', function (this: LWT, event, channel, args) {
  //   // event.sender = event.sender || this;
  //   lynxBridgeMain.emit('-internal-lynx-invoke', event, channel, args);
  // });

  // this.on('lynx-file-load', function (this: LWT, event, args) {
  //   lynxBridgeMain.emit('lynx-file-load', event, args);
  // });

  // this.on('lynx-file-verify-complete', function (this: LWT, event, args) {
  //   lynxBridgeMain.emit('lynx-file-verify-complete', event, args);
  // });

  // Redirect focus/blur event to app instance too.
  this.on('blur', (event: Event) => {
    app.emit('lynx-window-blur', event, this);
  });
  this.on('focus', (event: Event) => {
    app.emit('lynx-window-focus', event, this);
  });

  // Subscribe to visibilityState changes and pass to renderer process.
  let isVisible = this.isVisible() && !this.isMinimized();
  const visibilityChanged = () => {
    const newState = this.isVisible() && !this.isMinimized();
    if (isVisible !== newState) {
      isVisible = newState;
      // const visibilityState = isVisible ? 'visible' : 'hidden';
      // this.webContents.emit('-window-visibility-change', visibilityState);
    }
  };

  const visibilityEvents = ['show', 'hide', 'minimize', 'maximize', 'restore'];
  for (const event of visibilityEvents) {
    this.on(event as any, visibilityChanged);
  }

  app.emit('lynx-window-created', { preventDefault() {} }, this);

  this.on(
    '-on-fetch-resource',
    (event: LynxFetchEvent, resourceType: string, url: string) => {
      onResourceFetcher(event, resourceType, url);
    }
  );

  // Object.defineProperty(this, 'devToolsWebContents', {
  //   enumerable: true,
  //   configurable: false,
  //   get () {
  //     return this.webContents.devToolsWebContents;
  //   }
  // });
};

const isLynxWindow = (win: any) => {
  return win && win.constructor.name === 'LynxWindow';
};

LynxWindow.fromId = (id: number) => {
  const win = BaseWindow.fromId(id);
  return isLynxWindow(win) ? ((win as any) as LWT) : null;
};

LynxWindow.getAllWindows = () => {
  return (BaseWindow.getAllWindows().filter(isLynxWindow) as any[]) as LWT[];
};

LynxWindow.getFocusedWindow = () => {
  for (const window of LynxWindow.getAllWindows()) {
    if (window.isFocused()) return window;
  }
  return null;
};

// LynxWindow.fromWebContents = (webContents: WebContents) => {
//   return webContents.getOwnerBrowserWindow();
// };

// LynxWindow.fromBrowserView = (browserView: BrowserView) => {
//   return LynxWindow.fromWebContents(browserView.webContents);
// };

// LynxWindow.prototype.setTouchBar = function (touchBar) {
//   (TouchBar as any)._setOnWindow(touchBar, this);
// };

// Forwarded to webContents:

// LynxWindow.prototype.loadURL = function (...args) {
//   return this.webContents.loadURL(...args);
// };

// LynxWindow.prototype.getURL = function () {
//   return this.webContents.getURL();
// };

// LynxWindow.prototype.loadFile = function (...args) {
//   return this.webContents.loadFile(...args);
// };

// LynxWindow.prototype.reload = function (...args) {
//   return this.webContents.reload(...args);
// };

// LynxWindow.prototype.send = function (...args) {
//   return this.webContents.send(...args);
// };

// LynxWindow.prototype.openDevTools = function (...args) {
//   return this.webContents.openDevTools(...args);
// };

// LynxWindow.prototype.closeDevTools = function () {
//   return this.webContents.closeDevTools();
// };

// LynxWindow.prototype.isDevToolsOpened = function () {
//   return this.webContents.isDevToolsOpened();
// };

// LynxWindow.prototype.isDevToolsFocused = function () {
//   return this.webContents.isDevToolsFocused();
// };

// LynxWindow.prototype.toggleDevTools = function () {
//   return this.webContents.toggleDevTools();
// };

// LynxWindow.prototype.inspectElement = function (...args) {
//   return this.webContents.inspectElement(...args);
// };

// LynxWindow.prototype.inspectSharedWorker = function () {
//   return this.webContents.inspectSharedWorker();
// };

// LynxWindow.prototype.inspectServiceWorker = function () {
//   return this.webContents.inspectServiceWorker();
// };

// LynxWindow.prototype.showDefinitionForSelection = function () {
//   return this.webContents.showDefinitionForSelection();
// };

// LynxWindow.prototype.capturePage = function (...args) {
//   return this.webContents.capturePage(...args);
// };

// LynxWindow.prototype.getBackgroundThrottling = function () {
//   return this.webContents.getBackgroundThrottling();
// };

// LynxWindow.prototype.setBackgroundThrottling = function (allowed: boolean) {
//   return this.webContents.setBackgroundThrottling(allowed);
// };

module.exports = LynxWindow;
