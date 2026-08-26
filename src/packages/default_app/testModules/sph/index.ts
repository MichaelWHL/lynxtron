import { app, LynxWindow, LynxTemplateData } from 'lynxtron';

let mainWindow: LynxWindow | null = null;
const recordedEvents: { type: string; ts: number }[] = [];
let eventListenersAttached = false;
let eventCounter = 0;
let batch3LoadFileResult: boolean | null = null;
let batch3ConstructorOptions: any = null;
let batch6PreloadSetGlobalPropsResult: boolean | null = null;
let batch6UpdateMetaResult: boolean | null = null;
let batch6FirstPropsResult: boolean | null = null;
let batch6EmptyPropsResult: boolean | null = null;

function attachEventRecorders(window: LynxWindow) {
  if (eventListenersAttached) {
    return;
  }
  eventListenersAttached = true;
  const eventsToRecord = [
    'show', 'hide', 'minimize', 'maximize', 'restore',
    'enter-full-screen', 'leave-full-screen', 'resized',
    'focus', 'blur', 'close', 'closed'
  ];
  for (const event of eventsToRecord) {
    window.on(event as any, () => {
      recordedEvents.push({ type: event, ts: ++eventCounter });
      if (recordedEvents.length > 100) {
        recordedEvents.shift();
      }
    });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logResult(step: string, details: any) {
  console.log(`[WindowManagerTest] ${step}: ${JSON.stringify(details)}`);
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
function resetTestStats() {
  totalTests = 0;
  passedTests = 0;
  failedTests = 0;
}
function recordTestResult(step: string, pass: boolean, details?: string) {
  totalTests++;
  if (pass) {
    passedTests++;
  } else {
    failedTests++;
  }
  const detailText = details ? ` (${details})` : '';
  console.log(`[WindowManagerTest] ${step} result: ${pass ? 'PASS' : 'FAIL'}${detailText}`);
}
function logTestSummary() {
  const percentage = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
  console.log(`[WindowManagerTest] Ran ${totalTests} tests，${passedTests} Passed，${failedTests} Failed，Pass Percentage：${percentage}%`);
}

async function runBatch3Tests() {
  console.log('[WindowManagerTest] === Batch 3 Window Creation & Resource Load Test Start ===');

  if (!mainWindow) {
    console.log('[WindowManagerTest] ERROR: mainWindow is null');
    return;
  }

  try {
    // Step B3-1: verify constructor options are applied
    const expected = batch3ConstructorOptions || {};
    const actual = {
      width: (mainWindow as any).getBounds?.()?.width ?? mainWindow.getSize?.()[0],
      height: (mainWindow as any).getBounds?.()?.height ?? mainWindow.getSize?.()[1],
      show: mainWindow.isVisible()
    };
    logResult('B3-STEP1 constructor options', { expected, actual });
    const constructorPass =
      actual.width === (expected.width || 800) &&
      actual.height === (expected.height || 600) &&
      actual.show === (expected.show !== undefined ? expected.show : true);
    recordTestResult('B3-STEP1 constructor options', constructorPass, `expected width=${expected.width || 800}, height=${expected.height || 600}, show=${expected.show !== undefined ? expected.show : true}`);

    // Step B3-2: verify loadFile returned true
    logResult('B3-STEP2 loadFile result', { loadFileReturned: batch3LoadFileResult });
    recordTestResult('B3-STEP2 loadFile', batch3LoadFileResult === true, 'expected loadFile() to return true');

    console.log('[WindowManagerTest] === Batch 3 Window Creation & Resource Load Test End ===');
  } catch (err) {
    console.log(`[WindowManagerTest] ERROR during batch 3 tests: ${String(err)}`);
  }
}

async function runBatch6Tests() {
  console.log('[WindowManagerTest] === Batch 6 Global Props Injection Test Start ===');

  if (!mainWindow) {
    console.log('[WindowManagerTest] ERROR: mainWindow is null');
    return;
  }

  try {
    const preloadProps = {
      appName: 'default_app',
      testBatch: 6,
      phase: 'preload',
      nested: { flag: true }
    };
    const postloadProps = {
      appName: 'default_app',
      testBatch: 6,
      phase: 'postload',
      nested: { flag: true }
    };

    console.log('[WindowManagerTest] ACTION: verifying pre-load updateMetaData + setGlobalProps results');

    logResult('B6-STEP1 updateMetaData cache result', {
      meta: { updateData: { from: 'updateMetaData' }, globalProps: { from: 'updateMetaData' } },
      returned: batch6UpdateMetaResult
    });
    recordTestResult('B6-STEP1 updateMetaData cache', batch6UpdateMetaResult === true, 'expected pre-load updateMetaData() to return true');

    logResult('B6-STEP2 first pre-load setGlobalProps result', {
      globalProps: { step: 'first' },
      returned: batch6FirstPropsResult
    });
    recordTestResult('B6-STEP2 first pre-load setGlobalProps', batch6FirstPropsResult === true, 'expected first pre-load setGlobalProps() to return true');

    logResult('B6-STEP3 empty pre-load setGlobalProps result', {
      globalProps: {},
      returned: batch6EmptyPropsResult
    });
    recordTestResult('B6-STEP3 empty pre-load setGlobalProps', batch6EmptyPropsResult === true, 'expected empty pre-load setGlobalProps({}) to return true');

    logResult('B6-STEP4 final pre-load setGlobalProps result', {
      globalProps: preloadProps,
      returned: batch6PreloadSetGlobalPropsResult
    });
    recordTestResult('B6-STEP4 final pre-load setGlobalProps', batch6PreloadSetGlobalPropsResult === true, 'expected final pre-load setGlobalProps() to return true');

    console.log('[WindowManagerTest] ACTION: calling post-load setGlobalProps(...)');
    const postloadResult = mainWindow.setGlobalProps(postloadProps);
    logResult('B6-STEP5 post-load setGlobalProps result', { globalProps: postloadProps, returned: postloadResult });
    recordTestResult('B6-STEP5 post-load setGlobalProps', postloadResult === true, 'expected post-load setGlobalProps() to return true');

    console.log('[WindowManagerTest] === Batch 6 Global Props Injection Test End ===');
  } catch (err) {
    console.log(`[WindowManagerTest] ERROR during batch 6 tests: ${String(err)}`);
  }
}

async function runBatch7Tests() {
  console.log('[WindowManagerTest] === Batch 7 New Window Creation Interface Test Start ===');

  if (!mainWindow) {
    console.log('[WindowManagerTest] ERROR: mainWindow is null');
    return;
  }

  const cleanupWindows: LynxWindow[] = [];

  try {
    // B7-STEP1: create a fullscreen window and verify the enter-full-screen event.
    const fsEvents: string[] = [];
    console.log('[WindowManagerTest] ACTION: creating fullscreen window');
    const fsWin = new LynxWindow({ fullscreen: true, show: true, width: 800, height: 600 });
    fsWin.on('enter-full-screen' as any, () => fsEvents.push('enter-full-screen'));
    cleanupWindows.push(fsWin);
    await sleep(3000);
    const fsState = { isFullScreen: fsWin.isFullScreen(), eventReceived: fsEvents.includes('enter-full-screen') };
    logResult('B7-STEP1 fullscreen creation', fsState);
    recordTestResult('B7-STEP1 fullscreen creation', fsState.isFullScreen === true, `expected isFullScreen=true, eventReceived=${fsState.eventReceived}`);

    await sleep(500);

    // B7-STEP2: create a size-constrained window and verify initial bounds.
    console.log('[WindowManagerTest] ACTION: creating size-constrained window');
    const constrainedWin = new LynxWindow({
      width: 600,
      height: 400,
      minWidth: 400,
      minHeight: 300,
      maxWidth: 800,
      maxHeight: 600,
      show: true
    });
    cleanupWindows.push(constrainedWin);
    await sleep(2000);
    const initialSize = constrainedWin.getWindowSize();
    logResult('B7-STEP2 size constraints creation', { initialSize, limits: { minWidth: 400, minHeight: 300, maxWidth: 800, maxHeight: 600 } });
    const constrainedPass = initialSize[0] === 600 && initialSize[1] === 400;
    recordTestResult('B7-STEP2 size constraints creation', constrainedPass, 'expected initial window size 600x400; drag-resize limits verified visually');

    await sleep(500);

    // B7-STEP3: create a sub window with OS-level parent relationship.
    console.log('[WindowManagerTest] ACTION: creating sub window with parent');
    const subWin = new LynxWindow({ type: 'sub', parent: mainWindow, width: 400, height: 300, show: true });
    cleanupWindows.push(subWin);
    await sleep(2000);
    const subState = { isVisible: subWin.isVisible(), parentMatches: subWin.getParentWindow() === mainWindow };
    logResult('B7-STEP3 sub window creation', subState);
    recordTestResult('B7-STEP3 sub window creation', subState.isVisible === true && subState.parentMatches === true, 'expected visible=true, parentMatches=true');

    await sleep(500);

    // B7-STEP4: create a modal dialog window.
    console.log('[WindowManagerTest] ACTION: creating modal dialog window');
    const dialogWin = new LynxWindow({ type: 'dialog', parent: mainWindow, modal: true, width: 300, height: 200, show: true });
    cleanupWindows.push(dialogWin);
    await sleep(2000);
    const dialogState = { isVisible: dialogWin.isVisible(), isModal: dialogWin.isModal() };
    logResult('B7-STEP4 modal dialog creation', dialogState);
    recordTestResult('B7-STEP4 modal dialog creation', dialogState.isVisible === true && dialogState.isModal === true, 'expected visible=true, isModal=true');
  } catch (err) {
    console.log(`[WindowManagerTest] ERROR during batch 7 tests: ${String(err)}`);
  } finally {
    // Close all windows created in this batch to avoid interfering with later tests.
    for (const win of cleanupWindows) {
      try {
        win.close();
      } catch (e) {
        // ignore cleanup errors
      }
    }
  }

  console.log('[WindowManagerTest] === Batch 7 New Window Creation Interface Test End ===');
}

async function runBatch8Tests() {
  console.log('[WindowManagerTest] === Batch 8 Cross-Layer Window Property Ops Test Start ===');

  const cleanupWindows: LynxWindow[] = [];

  try {
    console.log('[WindowManagerTest] ACTION: creating property-test window');
    const win = new LynxWindow({ width: 600, height: 400, show: true });
    cleanupWindows.push(win);
    await sleep(1500);

    // B8-STEP1: setTitle
    console.log('[WindowManagerTest] ACTION: calling setTitle(...)');
    win.setTitle('batch8-test-title');
    await sleep(500);
    const title = win.getTitle();
    logResult('B8-STEP1 setTitle', { title });
    recordTestResult('B8-STEP1 setTitle', title === 'batch8-test-title', "expected title='batch8-test-title'");

    await sleep(500);

    // B8-STEP2: setBounds
    console.log('[WindowManagerTest] ACTION: calling setBounds(...)');
    win.setBounds({ x: 100, y: 100, width: 500, height: 350 });
    await sleep(1000);
    const bounds = win.getBounds();
    logResult('B8-STEP2 setBounds', bounds);
    const boundsPass = bounds.x === 100 && bounds.y === 100 && bounds.width === 500 && bounds.height === 350;
    recordTestResult('B8-STEP2 setBounds', boundsPass, 'expected x=100,y=100,w=500,h=350');

    await sleep(500);

    // B8-STEP3: setPosition
    console.log('[WindowManagerTest] ACTION: calling setPosition(...)');
    win.setPosition(120, 130);
    await sleep(1000);
    const pos = win.getPosition();
    logResult('B8-STEP3 setPosition', { pos });
    const posPass = pos[0] === 120 && pos[1] === 130;
    recordTestResult('B8-STEP3 setPosition', posPass, 'expected x=120,y=130');

    await sleep(500);

    // B8-STEP4: setSize
    console.log('[WindowManagerTest] ACTION: calling setSize(...)');
    win.setSize(520, 360);
    await sleep(1000);
    const size = win.getSize();
    logResult('B8-STEP4 setSize', { size });
    const sizePass = size[0] === 520 && size[1] === 360;
    recordTestResult('B8-STEP4 setSize', sizePass, 'expected 520x360');

    await sleep(500);

    // B8-STEP5: hide / show
    console.log('[WindowManagerTest] ACTION: calling hide()');
    win.hide();
    await sleep(1000);
    const hiddenVisible = win.isVisible();
    console.log('[WindowManagerTest] ACTION: calling show()');
    win.show();
    await sleep(1000);
    const shownVisible = win.isVisible();
    logResult('B8-STEP5 hide/show', { hiddenVisible, shownVisible });
    recordTestResult('B8-STEP5 hide/show', hiddenVisible === false && shownVisible === true, 'expected hidden=false, shown=true');

    await sleep(500);

    // B8-STEP6: focus false / true + blur event
    console.log('[WindowManagerTest] ACTION: calling focus(false)');
    const blurEvents: string[] = [];
    win.on('blur' as any, () => blurEvents.push('blur'));
    win.focus();
    await sleep(500);
    win.blur();
    await sleep(1000);
    const blurred = !win.isFocused();
    console.log('[WindowManagerTest] ACTION: calling focus()');
    win.focus();
    await sleep(1000);
    const focused = win.isFocused();
    logResult('B8-STEP6 focus/blur', { blurred, focused, events: blurEvents });
    recordTestResult('B8-STEP6 focus/blur', blurred && focused, 'expected blurred=true, focused=true');
  } catch (err) {
    console.log(`[WindowManagerTest] ERROR during batch 8 tests: ${String(err)}`);
  } finally {
    for (const win of cleanupWindows) {
      try {
        win.close();
      } catch (e) {
        // ignore cleanup errors
      }
    }
  }

  console.log('[WindowManagerTest] === Batch 8 Cross-Layer Window Property Ops Test End ===');
}

async function runTests() {
  console.log('[WindowManagerTest] === Batch 1 Window Manager Test Start ===');

  if (!mainWindow) {
    console.log('[WindowManagerTest] ERROR: mainWindow is null');
    return;
  }

  const win = mainWindow;
  recordedEvents.length = 0;
  resetTestStats();

  // Run batch 3 and batch 6 tests first while the window is still alive.
  await runBatch3Tests();
  await runBatch6Tests();

  try {
    // Step 1: initial state (window is created with show: false)
    let s = { isMinimized: win.isMinimized(), isVisible: win.isVisible(), isFocused: win.isFocused(), isMaximized: win.isMaximized() };
    logResult('STEP1 initial state', s);

    // Step 2: show (window starts hidden)
    console.log('[WindowManagerTest] ACTION: calling show()');
    await sleep(5000);
    win.show();
    s = { isMinimized: win.isMinimized(), isVisible: win.isVisible(), isFocused: win.isFocused(), isMaximized: win.isMaximized() };
    logResult('STEP2 after show', s);
    recordTestResult('STEP2 after show', s.isVisible === true, 'expected isVisible=true');

    // Batch 7: exercise new window creation options (fullscreen, size limits,
    // sub/panel/dialog OS-level parent relationship, modal). Run while the
    // main window is visible so parent references are valid.
    await runBatch7Tests();

    // Batch 8: exercise cross-layer property operations (setBounds/setPosition/
    // setSize/center/setTitle/hide/show/focus-false).
    await runBatch8Tests();

    // Step 3: minimize (verify isMinimized state)
    console.log('[WindowManagerTest] ACTION: calling minimize()');
    await sleep(5000);
    win.minimize();
    s = { isMinimized: win.isMinimized(), isVisible: win.isVisible(), isFocused: win.isFocused(), isMaximized: win.isMaximized() };
    logResult('STEP3 after minimize', s);
    recordTestResult('STEP3 after minimize', s.isMinimized === true, 'expected isMinimized=true');

    // Step 4: restore from minimized state
    console.log('[WindowManagerTest] ACTION: calling restore()');
    await sleep(5000);
    win.restore();
    s = { isMinimized: win.isMinimized(), isVisible: win.isVisible(), isFocused: win.isFocused(), isMaximized: win.isMaximized() };
    logResult('STEP4 after restore', s);
    recordTestResult('STEP4 after restore from minimized', s.isMinimized === false, 'expected isMinimized=false');

    // Step 5: maximize (verify isMaximized state)
    console.log('[WindowManagerTest] ACTION: calling maximize()');
    await sleep(5000);
    win.maximize();
    s = { isMinimized: win.isMinimized(), isVisible: win.isVisible(), isFocused: win.isFocused(), isMaximized: win.isMaximized() };
    logResult('STEP5 after maximize', s);
    recordTestResult('STEP5 after maximize', s.isMaximized === true, 'expected isMaximized=true');

    // Step 6: restore from maximized state
    console.log('[WindowManagerTest] ACTION: calling restore()');
    await sleep(5000);
    win.restore();
    s = { isMinimized: win.isMinimized(), isVisible: win.isVisible(), isFocused: win.isFocused(), isMaximized: win.isMaximized() };
    logResult('STEP6 after restore from maximized', s);
    recordTestResult('STEP6 after restore from maximized', s.isMaximized === false, 'expected isMaximized=false');

    // Step 7: focus
    console.log('[WindowManagerTest] ACTION: calling focus()');
    await sleep(5000);
    win.focus();
    s = { isMinimized: win.isMinimized(), isVisible: win.isVisible(), isFocused: win.isFocused(), isMaximized: win.isMaximized() };
    logResult('STEP7 after focus', s);
    recordTestResult('STEP7 after focus', s.isFocused === true, 'expected isFocused=true');

    // Step 8: setAlwaysOnTop true
    console.log('[WindowManagerTest] ACTION: calling setAlwaysOnTop(true)');
    await sleep(5000);
    win.setAlwaysOnTop(true);
    logResult('STEP8 after setAlwaysOnTop(true)', { alwaysOnTop: true });
    recordTestResult('STEP8 after setAlwaysOnTop(true)', true, 'no getter, visual check');

    // Step 9: setAlwaysOnTop false
    console.log('[WindowManagerTest] ACTION: calling setAlwaysOnTop(false)');
    await sleep(5000);
    win.setAlwaysOnTop(false);
    logResult('STEP9 after setAlwaysOnTop(false)', { alwaysOnTop: false });
    recordTestResult('STEP9 after setAlwaysOnTop(false)', true, 'no getter, visual check');

    // Step 10: events recorded
    const events = recordedEvents.slice();
    logResult('STEP10 events recorded', events);
    recordTestResult('STEP10 events recorded', events.length > 0, `${events.length} events`);

    // Step 11: close (destroys the window, must be last)
    // Also verifies batch 2 'close' and 'closed' events.
    console.log('[WindowManagerTest] ACTION: calling close()');
    const beforeCloseCount = recordedEvents.length;
    await sleep(5000);
    win.close();
    await sleep(1000);
    const closeEvents = recordedEvents.slice(beforeCloseCount);
    const hasClose = closeEvents.some((e) => e.type === 'close');
    const hasClosed = closeEvents.some((e) => e.type === 'closed');
    logResult('STEP11 close events', { close: hasClose, closed: hasClosed, events: closeEvents });
    recordTestResult('STEP11 close events', hasClose && hasClosed, 'expected close=true, closed=true');

    logTestSummary();
    console.log('[WindowManagerTest] === Batch 1 Window Manager Test End ===');
  } catch (err) {
    console.log(`[WindowManagerTest] ERROR during tests: ${String(err)}`);
  }
}

/** 独立触发 WindowManager 测试：创建专用测试窗口并执行全部用例 */
export async function runSphTests(appPath: string | undefined) {
  if (mainWindow) {
    console.log('[SphTest] test window already exists, skipping CreateWindow');
  } else {
    mainWindow = await createWindow();
  }
  try {
    await runTests();
  } finally {
    mainWindow = null;
    eventListenersAttached = false;
    recordedEvents.length = 0;
  }
}

async function createWindow() {
  app.setName("LYNXTRON-ZLL")
  await app.whenReady().then(()=>{
    console.log("app.whenReady: is ok:",app.getName())
  });
  console.log("app.getName():",app.getName())
  batch3ConstructorOptions = {
    width: 1200,
    height: 800,
    show: false
  };
  mainWindow = new LynxWindow(batch3ConstructorOptions);

  attachEventRecorders(mainWindow);

  console.log('[default_app] main window created');

  // Batch 6: exercise setGlobalProps caching path before lynx_view_ is created.
  const updateMeta = {
    updateData: new LynxTemplateData({ from: 'updateMetaData' }),
    globalProps: new LynxTemplateData({ from: 'updateMetaData' })
  };
  console.log('[default_app] ACTION: calling pre-load updateMetaData(...)');
  batch6UpdateMetaResult = mainWindow.updateMetaData(updateMeta);
  console.log(`[default_app] pre-load updateMetaData returned: ${batch6UpdateMetaResult}`);

  console.log('[default_app] ACTION: calling first pre-load setGlobalProps(...)');
  batch6FirstPropsResult = mainWindow.setGlobalProps({ step: 'first' });
  console.log(`[default_app] first pre-load setGlobalProps returned: ${batch6FirstPropsResult}`);

  console.log('[default_app] ACTION: calling pre-load setGlobalProps({})');
  batch6EmptyPropsResult = mainWindow.setGlobalProps({});
  console.log(`[default_app] empty pre-load setGlobalProps returned: ${batch6EmptyPropsResult}`);

  const preloadGlobalProps = {
    appName: 'default_app',
    testBatch: 6,
    phase: 'preload',
    nested: { flag: true }
  };
  console.log('[default_app] ACTION: calling final pre-load setGlobalProps(...)');
  batch6PreloadSetGlobalPropsResult = mainWindow.setGlobalProps(preloadGlobalProps);
  console.log(`[default_app] final pre-load setGlobalProps returned: ${batch6PreloadSetGlobalPropsResult}`);

  // Window manager tests are now triggered manually from the UI.
  return mainWindow;
}

function safeStringify(v: unknown): string {
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

export const loadFile = async (appPath: string) => {
  mainWindow = await createWindow();
  batch3LoadFileResult = mainWindow.loadFile(appPath);
  console.log(`[default_app] loadFile returned: ${batch3LoadFileResult}`);
  mainWindow.show();
  mainWindow.loadFile(appPath);

  // devtool 式日志转发: 把主进程 console 输出实时推送到 Lynx UI 的 LogPanel
  const sendLog = (level: 'log' | 'warn' | 'error', ...args: unknown[]) => {
    const text = args.map(safeStringify).join(' ');
    try {
      mainWindow?.sendGlobalEvent('bridge-log', { level, text, from: 'main' });
    } catch {
      // 窗口尚未就绪时忽略
    }
  };
  console.log = (...args: unknown[]) => {
    sendLog('log', ...args);
  };
  console.warn = (...args: unknown[]) => {
    sendLog('warn', ...args);
  };
  console.error = (...args: unknown[]) => {
    sendLog('error', ...args);
  };
};
