// testDemo.ts 中暴露的全部测试方法名
export const TEST_FN_NAMES = [
    'testOpenExternal',
    'testOpenPath',
    'testShowOpenDialog',
    'testShowSaveDialog',
    'testCreateFromPath',
    'testCreateFromBitmap',
    'testOnlock',
    'testFetchJson',
    // -- poll() 替代 select() 回归测试 (node_bindings_harmony.cc PollEvents) --
    'testPollHttpBasic',
    'testPollHttpConcurrent',
    'testPollTimerPrecision',
    'testPollTimerAndIO',
    'testPollConnectRefused',
    'testPollRequestTimeout',
    'testPollHttpLoop',
    'testPollNoTimerIO',
    //
    'testGetPrimaryDisplay',
    "testClipboardWriteText"
] as const;

export type BridgeEventCallback = { sendReply: (result?: unknown) => void };
export let testFns: Record<string, TestFn> | null = null;
export type TestFn = () => Promise<void> | void;

export async function ensureTestFns(): Promise<Record<string, TestFn>> {
    if (!testFns) {
        const mod: Record<string, unknown> = await import('./testDemo.js');
        testFns = {};
        for (const name of TEST_FN_NAMES) {
            if (typeof mod[name] === 'function') {
                testFns[name] = mod[name] as TestFn;
            }
        }
    }
    return testFns;
}

export function safeStringify(v: unknown): string {
    if (typeof v === 'string') return v;
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    try {
        const s = JSON.stringify(v);
        return s === undefined ? String(v) : s;
    } catch {
        return String(v);
    }
}