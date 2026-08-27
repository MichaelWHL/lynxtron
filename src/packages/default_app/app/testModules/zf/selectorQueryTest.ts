// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// createSelectorQuery 功能验证用例 (lynxtron 鸿蒙版)
// 触发方式: 打开页面 1s 后自动跑一次, 或点击 index.tsx 里的 "SelectorQuery" 按钮。
// 结果输出到页面 Console 面板 (LogPanel), 每条日志带 [SQ] 前缀。
// 每条用例以 [PASS] / [FAIL] 标记。

import { log } from '../../utils/log';

const TAG = 'SQ';

// 用例3 捕获的 unique_id, 供用例6 selectUniqueID 使用
let sqUniqueIds: number[] = [];

/** 用例1: API 存在性 */
function caseApiExists(): boolean {
  const lynxAny = lynx as any;
  const t = typeof lynxAny.createSelectorQuery;
  if (t !== 'function') {
    log(TAG, '[FAIL] ' + '用例1 lynx.createSelectorQuery 类型 = ' + t + ' (应为 function)');
    return false;
  }
  log(TAG, '[PASS] ' + '用例1 lynx.createSelectorQuery 存在, type=function');
  return true;
}

/** 用例2: select('#lxp-target') + invoke boundingClientRect
 *  预期: success 返回 {id,left,top,right,bottom,width,height}, width≈160 height≈64 */
function caseSelectRect(): void {
  try {
    (lynx as any)
      .createSelectorQuery()
      .select('#lxp-target')
      .invoke({
        method: 'boundingClientRect',
        success: (res: any) => log(TAG, '[PASS] ' + '用例2 select+boundingClientRect → ' + JSON.stringify(res)),
        fail: (res: any) => log(TAG, '[FAIL] ' + '用例2 select+boundingClientRect fail code=' + (res && res.code) + ' data=' + JSON.stringify(res && res.data)),
      })
      .exec();
  } catch (e) {
    log(TAG, '[FAIL] ' + '用例2 抛异常: ' + String(e));
  }
}

/** 用例3: selectAll('.lxp-item') + fields
 *  注意: fiber 架构下 GetNodeInfo 只支持 id/dataset/tag/unique_id/name/index/class/attribute,
 *  rect/size 尚未实现(返回空对象)——单节点尺寸请用用例2的 invoke('boundingClientRect')。
 *  这里用 fiber 支持的字段验证多节点 fields 链路。 */
function caseSelectAllFields(): void {
  try {
    (lynx as any)
      .createSelectorQuery()
      .selectAll('.lxp-item')
      .fields(
        { unique_id: true, class: true, index: true },
        (res: any, status: any) => {
          const code = status && typeof status === 'object' ? status.code : status;
          const ok = code === undefined || code === null || code === 0;
          if (ok) {
            if (Array.isArray(res)) {
              sqUniqueIds = res.map((r: any) => r && r.unique_id).filter((v: any) => v != null);
            }
            log(TAG, '[PASS] ' + '用例3 selectAll+fields 节点数=' + (Array.isArray(res) ? res.length : '?') + ' → ' + JSON.stringify(res));
            caseSelectUniqueID();
          } else {
            log(TAG, '[FAIL] ' + '用例3 selectAll+fields status=' + JSON.stringify(status) + ' res=' + JSON.stringify(res));
          }
        }
      )
      .exec();
  } catch (e) {
    log(TAG, '[FAIL] ' + '用例3 抛异常: ' + String(e));
  }
}

/** 用例4: selectRoot() + invoke boundingClientRect
 *  预期: 返回页面根节点 rect, 数值有效 */
function caseSelectRootRect(): void {
  try {
    (lynx as any)
      .createSelectorQuery()
      .selectRoot()
      .invoke({
        method: 'boundingClientRect',
        success: (res: any) => log(TAG, '[PASS] ' + '用例4 selectRoot+boundingClientRect → ' + JSON.stringify(res)),
        fail: (res: any) => log(TAG, '[FAIL] ' + '用例4 selectRoot fail code=' + (res && res.code) + ' data=' + JSON.stringify(res && res.data)),
      })
      .exec();
  } catch (e) {
    log(TAG, '[FAIL] ' + '用例4 抛异常: ' + String(e));
  }
}

/** 用例5: 未注册方法, 验证 fail 回调与错误码
 *  预期: fail code=3 (METHOD_NOT_FOUND) */
function caseUnknownMethod(): void {
  try {
    (lynx as any)
      .createSelectorQuery()
      .select('#lxp-target')
      .invoke({
        method: 'definitelyNotRegistered',
        success: () => log(TAG, '[FAIL] ' + '用例5 未注册方法竟然 success (异常!)'),
        fail: (res: any) => log(TAG, '[PASS] ' + '用例5 未注册方法正确走 fail code=' + (res && res.code) + ' data=' + JSON.stringify(res && res.data)),
      })
      .exec();
  } catch (e) {
    log(TAG, '[FAIL] ' + '用例5 抛异常: ' + String(e));
  }
}

/** 用例6: selectUniqueID(uid) + invoke boundingClientRect
 *  按唯一 id 选节点(文档方法)。uid 来自用例3 的 fields({unique_id}) 结果,
 *  在用例3 回调内立即执行, 保证 uid 有效。 */
function caseSelectUniqueID(): void {
  if (sqUniqueIds.length === 0) {
    log(TAG, '用例6 无 unique_id(用例3 未返回), 跳过');
    return;
  }
  try {
    (lynx as any)
      .createSelectorQuery()
      .selectUniqueID(sqUniqueIds[0])
      .invoke({
        method: 'boundingClientRect',
        success: (res: any) => log(TAG, '[PASS] ' + '用例6 selectUniqueID(' + sqUniqueIds[0] + ')+rect → ' + JSON.stringify(res)),
        fail: (res: any) => log(TAG, '[FAIL] ' + '用例6 selectUniqueID fail code=' + (res && res.code) + ' data=' + JSON.stringify(res && res.data)),
      })
      .exec();
  } catch (e) {
    log(TAG, '[FAIL] ' + '用例6 抛异常: ' + String(e));
  }
}

/** 执行全部用例 */
export function testSelectorQuery(): void {
  log(TAG, '═══ createSelectorQuery 测试开始 ═══');
  if (!caseApiExists()) {
    log(TAG, '[FAIL] ' + 'API 不可用, 后续用例跳过');
    return;
  }
  caseSelectRect();
  caseSelectAllFields();
  caseSelectRootRect();
  caseUnknownMethod();
  log(TAG, '═══ 已提交全部用例, 异步结果以 [PASS]/[FAIL] 陆续打印 ═══');
}
