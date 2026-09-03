// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// =============================================================================
// -----------------------------------------------------------------------------
// What it does:
//   1. saveUris(): stores the URI list into local preferences after the
//      system picker grants access.
//   2. initPermissions(): on app start, reads the stored URI list and calls
//      fileShare.activatePermission() for every URI, restoring the grants
//      that would otherwise be lost when the process restarts.
// =============================================================================
import common from '@ohos.app.ability.common';
import { fileShare } from '@kit.CoreFileKit';
import { BusinessError } from '@ohos.base';
import hilog from '@ohos.hilog';
import preferences from '@ohos.data.preferences';

const DOMAIN = 0x0000;
const TAG = 'PersistManager';

const PREF_NAME = 'lynxtron_persist_store';
const PREF_KEY = 'persisted_uris';

/**
 * Persistent file-access manager (singleton).
 */
export class PersistManager {
  private static instance: PersistManager | null = null;
  private ctx: common.UIAbilityContext;

  /** Returns the singleton; call register() first. */
  static getInstance(): PersistManager {
    if (!PersistManager.instance) {
      throw new Error('PersistManager not registered yet');
    }
    return PersistManager.instance;
  }

  private constructor(ctx: common.UIAbilityContext) {
    this.ctx = ctx;
  }

  /**
   * Registers the manager (invoked by BridgeRegistry.registerAll) and
   * immediately performs the startup activation.
   */
  static register(context: common.UIAbilityContext): void {
    if (PersistManager.instance) {
      return;
    }
    PersistManager.instance = new PersistManager(context);
    // Activate URIs persisted in earlier runs so that file access
    // survives app restarts.
    PersistManager.instance.initPermissions();
  }

  /**
   * Startup activation: read the stored URI list and activate each URI.
   * OHOS requires calling activatePermission once per process run; the
   * persisted grant alone does not survive a restart.
   */
  initPermissions(): void {
    const uris = this.getUris();
    if (uris.length === 0) {
      return;
    }
    this.activateFileAccessPersist(uris);
  }

  /**
   * Stores the URI list into preferences for the next startup activation.
   */
  saveUris(uris: string[]): void {
    if (uris.length === 0) {
      return;
    }
    try {
      const pref = preferences.getPreferencesSync(this.ctx, { name: PREF_NAME });
      pref.putSync(PREF_KEY, JSON.stringify(uris));
      pref.flush((err: BusinessError) => {
        if (err) {
          hilog.error(DOMAIN, TAG, '[PERSIST] saveUris flush failed: %{public}s',
            JSON.stringify(err));
        }
      });
    } catch (e) {
      hilog.error(DOMAIN, TAG, '[PERSIST] saveUris error: %{public}s', String(e));
    }
  }

  /**
   * Reads back the URI list stored by saveUris().
   */
  private getUris(): string[] {
    try {
      const pref = preferences.getPreferencesSync(this.ctx, { name: PREF_NAME });
      const raw: string = pref.getSync(PREF_KEY, '[]') as string;
      const arr: object = JSON.parse(raw);
      return Array.isArray(arr) ? (arr as string[]) : [];
    } catch (e) {
      hilog.error(DOMAIN, TAG, '[PERSIST] getUris error: %{public}s', String(e));
      return [];
    }
  }

  /**
   * Re-activates file access for the given URIs via fileShare.activatePermission.
   */
  private activateFileAccessPersist(uris: string[]): void {
    const policies: fileShare.PolicyInfo[] = [];
    for (const uri of uris) {
      const policy: fileShare.PolicyInfo = {
        uri: uri,
        operationMode: fileShare.OperationMode.READ_MODE |
          fileShare.OperationMode.WRITE_MODE,
      };
      policies.push(policy);
    }
    fileShare.activatePermission(policies).then(() => {
      // Success: grants are active until the next process exit.
    }).catch((err: BusinessError<Array<fileShare.PolicyErrorResult>>) => {
      hilog.error(DOMAIN, TAG, '[PERSIST] activatePermission FAILED: %{public}s',
        JSON.stringify(err));
    });
  }
}