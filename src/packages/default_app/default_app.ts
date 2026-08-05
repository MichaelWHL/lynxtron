// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// @ts-nocheck

import { app, LynxWindow } from 'lynxtron';

let mainWindow: LynxWindow | null = null;

async function createWindow() {
  app.setName("LYNXTRON-ZLL")
  await app.whenReady().then(()=>{
    console.log("app.whenReady: is ok:",app.getName())
  });
  console.log("app.getName():",app.getName())
  const mainWindow = new LynxWindow({
    width: 1200,
    height: 800,
  });

  return mainWindow;
}

export const loadFile = async (appPath: string) => {
  mainWindow = await createWindow();
  mainWindow.show();
  mainWindow.loadFile(appPath);

  app.on('before-quit', () => {
    console.log('before-quit event fired');
  });

  app.on('window-all-closed', () => {
    console.log('window-all-closed event fired');
    app.quit();
  });

  setTimeout(() => {
    console.log('closing window after 10s');
    mainWindow.close();
  }, 10000);
};
