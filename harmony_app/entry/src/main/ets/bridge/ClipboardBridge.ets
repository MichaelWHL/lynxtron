// Copyright 2026 The Lynxtron Authors. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// ArkTS bridge for the HarmonyOS clipboard.  Mirrors the C++ clipboard
// adapter in api_clipboard_harmony.cc: the C++ side blocks on a future while
// this file performs the actual system-pasteboard work on the ETS main
// thread, then reports the result back through the NAPI bridge.
//
// Scope: only readText / writeText are wired up.  Every other Electron
// clipboard operation is reported as unsupported on the C++ side.

import common from '@ohos.app.ability.common';
import Want from '@ohos.app.ability.Want';
import hilog from '@ohos.hilog';
import pasteboard from '@ohos.pasteboard';
import promptAction from '@ohos.promptAction';
import abilityAccessCtrl, { Permissions } from '@ohos.abilityAccessCtrl';
import { BusinessError } from '@ohos.base';
import lynxtron from 'liblynxtron_napi.so';

const DOMAIN = 0x0000;
const TAG = 'ClipboardBridge';
const READ_PASTEBOARD: Permissions = 'ohos.permission.READ_PASTEBOARD';

/**
 * Single clipboard bridge instance.  Register once from BridgeRegistry;
 * the NAPI bridge dispatches (id, op, payload) here and this class resolves
 * each request through lynxtron.resolveClipboard(id, result).
 */
export class ClipboardBridge {
  private static instance: ClipboardBridge | null = null;
  private ctx: common.UIAbilityContext;
  private atManager: abilityAccessCtrl.AtManager;

  private constructor(ctx: common.UIAbilityContext) {
    this.ctx = ctx;
    this.atManager = abilityAccessCtrl.createAtManager();
  }

  /**
   * Register the dispatch handler with the lynxtron NAPI bridge.  Idempotent:
   * called once from BridgeRegistry.registerAll.
   */
  static register(context: common.UIAbilityContext): void {
    if (ClipboardBridge.instance) {
      hilog.warn(DOMAIN, TAG, 'Already registered, skipping');
      return;
    }
    ClipboardBridge.instance = new ClipboardBridge(context);
    const bridge = ClipboardBridge.instance;

    lynxtron.registerClipboardHandler((id: number, op: string, payload: string) => {
      bridge.dispatch(id, op, payload);
    });
  }

  /**
   * Route a clipboard request by operation name.  Unknown operations report
   * an error and resolve with an empty result so the C++ side unblocks.
   */
  private dispatch(id: number, op: string, payload: string): void {
    if (op === 'readText') {
      this.handleReadText(id);
    } else if (op === 'writeText') {
      this.handleWriteText(id, payload);
    } else {
      hilog.error(DOMAIN, TAG, '[Clipboard] unknown op=%{public}s', op);
      lynxtron.resolveClipboard(id, '');
    }
  }

  /**
   * Read the plain text of every pasteboard record, concatenated in order.
   * Iterating all records (rather than only the primary one) keeps text from
   * being lost when the first record is not a plain-text entry.
   */
  private async handleReadText(id: number): Promise<void> {
    const allowed = await this.ensurePastePermission();
    if (!allowed) {
      hilog.error(DOMAIN, TAG, '[Clipboard] readText denied: READ_PASTEBOARD not granted');
      lynxtron.resolveClipboard(id, '');
      return;
    }
    try {
      const data = pasteboard.getSystemPasteboard().getDataSync();
      let text = '';
      const count = data.getRecordCount();
      for (let i = 0; i < count; i++) {
        const plain = data.getRecord(i).plainText;
        if (plain !== undefined) {
          text += plain;
        }
      }
      lynxtron.resolveClipboard(id, text);
    } catch (e) {
      hilog.error(DOMAIN, TAG, '[Clipboard] readText failed: %{public}s', JSON.stringify(e));
      lynxtron.resolveClipboard(id, '');
    }
  }

  /**
   * Write plain text to the system pasteboard, replacing its current content.
   * Writing needs no permission; failures are logged and reported by code.
   */
  private handleWriteText(id: number, text: string): void {
    try {
      const data = pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text);
      pasteboard.getSystemPasteboard().setDataSync(data);
      lynxtron.resolveClipboard(id, '0');
    } catch (e) {
      hilog.error(DOMAIN, TAG, '[Clipboard] writeText failed: %{public}s', JSON.stringify(e));
      lynxtron.resolveClipboard(id, String((e as BusinessError).code ?? -1));
    }
  }

  /**
   * Ensure READ_PASTEBOARD is granted before reading.
   *
   * 1. Check the access token first: a granted permission needs no dialog.
   * 2. Otherwise ask the system with requestPermissionsFromUser.
   * 3. If the user denies, show a guide dialog (see
   *    openPastePermissionConfirm) that can open the system settings page;
   *    the current read still fails and is reported by the caller.
   */
  private async ensurePastePermission(): Promise<boolean> {
    try {
      const tokenId = this.ctx.applicationInfo.accessTokenId;
      const status = this.atManager.checkAccessTokenSync(tokenId, READ_PASTEBOARD);
      if (status === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
        return true;
      }
    } catch (e) {
      hilog.warn(DOMAIN, TAG, '[Clipboard] checkAccessTokenSync failed: %{public}s', String(e));
    }

    let granted = false;
    try {
      const res = await this.atManager.requestPermissionsFromUser(this.ctx, [READ_PASTEBOARD]);
      granted = res.authResults.length > 0 && res.authResults[0] === 0;
    } catch (e) {
      hilog.error(DOMAIN, TAG, '[Clipboard] requestPermissionsFromUser failed: %{public}s', String(e));
    }
    if (granted) {
      return true;
    }

    // Denied: guide the user to system settings instead of failing silently.
    await this.openPastePermissionConfirm();
    return false;
  }

  /**
   * Show a guide dialog after the clipboard permission was denied.  Choosing
   * the confirm action opens this application's entry in the system settings
   * where the permission can be granted manually.  Mirrors the permission
   * flow of the Electron-ohos PermissionManagerAdapter.
   */
  private async openPastePermissionConfirm(): Promise<void> {
    try {
      const rm = this.ctx.resourceManager;
      const res = await promptAction.showDialog({
        title: rm.getStringSync($r('app.string.pasteboard_dialog_title').id),
        message: rm.getStringSync($r('app.string.pasteboard_dialog_content').id),
        buttons: [
          {
            text: rm.getStringSync($r('app.string.pasteboard_dialog_confirm').id),
            color: '#000000'
          },
          {
            text: rm.getStringSync($r('app.string.pasteboard_dialog_cancel').id),
            color: '#000000'
          }
        ]
      });
      if (res.index === 0) {
        const want: Want = {
          bundleName: 'com.huawei.hmos.settings',
          abilityName: 'com.huawei.hmos.settings.MainAbility',
          uri: 'application_info_entry',
          parameters: { pushParams: this.ctx.abilityInfo.bundleName }
        };
        await this.ctx.startAbility(want);
      }
    } catch (e) {
      hilog.error(DOMAIN, TAG, '[Clipboard] permission guide dialog failed: %{public}s', String(e));
    }
  }
}
