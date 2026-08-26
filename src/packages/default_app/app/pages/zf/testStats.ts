// ZF 测试模块 · 统计 store(基于 [PASS]/[FAIL] 日志标记统一计数)
// 设计: 统计 = 数日志中出现的 [PASS]/[FAIL] 标记。
//  - 主进程 testDemo 的 console 输出经 bridge-log 进入本 store;
//  - 渲染层测试的 logPass/logFail 也进入本 store;
//  - 自动执行 + 手动触发都会产生 [PASS]/[FAIL], 天然全部纳入统计。
import { subscribeLogs } from '../../utils/log';

export interface TestCount {
  passed: number;
  failed: number;
}

export interface StatsSnapshot {
  moduleId: string;
  total: number; // 接口数 = [PASS]+[FAIL] 标记数
  passed: number;
  failed: number;
  rate: string; // 通过率 如 '85.7'
  perTest: Record<string, TestCount>;
}

let moduleId: string | null = null;
let currentTest: string | null = null;
const perTest: Record<string, TestCount> = {};
let lastSeq = 0; // 日志流游标, 避免重复计数
let listeners: Array<() => void> = [];
let wired = false;

function emit(): void {
  for (const l of listeners) l();
}

function ensureWired(): void {
  if (wired) return;
  wired = true;
  subscribeLogs((entries) => {
    // 只处理新增日志
    for (const e of entries) {
      if (e.id <= lastSeq) continue;
      lastSeq = e.id;
      if (moduleId == null) continue;
      const isPass = e.text.indexOf('[PASS]') >= 0;
      const isFail = e.text.indexOf('[FAIL]') >= 0;
      if (!isPass && !isFail) continue;
      if (isPass) {
        if (currentTest && perTest[currentTest]) perTest[currentTest].passed++;
      } else if (isFail) {
        if (currentTest && perTest[currentTest]) perTest[currentTest].failed++;
      }
    }
    emit();
  });
}

/** 进入模块: 清空本模块统计, 置当前模块上下文 */
export function beginModule(id: string): void {
  moduleId = id;
  for (const k of Object.keys(perTest)) delete perTest[k];
  currentTest = null;
  emit();
}

/** 设置/清空当前测试上下文(用于按测试归因, 非必须) */
export function setCurrentTest(id: string | null): void {
  currentTest = id;
  if (id && !perTest[id]) perTest[id] = { passed: 0, failed: 0 };
  emit();
}

export function subscribe(fn: () => void): () => void {
  ensureWired();
  listeners.push(fn);
  fn();
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function getSnapshot(): StatsSnapshot {
  let passed = 0;
  let failed = 0;
  for (const k of Object.keys(perTest)) {
    passed += perTest[k].passed;
    failed += perTest[k].failed;
  }
  const total = passed + failed;
  const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
  return { moduleId: moduleId ?? '', total, passed, failed, rate, perTest: { ...perTest } };
}

/** 领导要求格式的一行统计 */
export function formatSummary(label: string): string {
  const s = getSnapshot();
  return `[STATS] 模块 ${label} 本模块总接口数量:${s.total}，通过:${s.passed}，失败:${s.failed}，通过率:${s.rate}%`;
}
