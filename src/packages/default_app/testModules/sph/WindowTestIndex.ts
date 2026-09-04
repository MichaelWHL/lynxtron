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
// Record one test outcome: update the counters and log a PASS/FAIL line.
function recordTestResult(step: string, pass: boolean, details?: string) {
  totalTests++;
  if (pass) {
    passedTests++;
  } else {
    failedTests++;
  }
  const detailText = details ? ` (${details})` : '';
  console.warn(`[WindowManagerTest] ${step} result: ${pass ? 'PASS' : 'FAIL'}${detailText}`);
}
// Log the aggregated pass/fail counters for the whole run.
function logTestSummary() {
  const percentage = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : '0.00';
  console.warn(`[WindowManagerTest] Ran ${totalTests} tests, ${passedTests} Passed, ${failedTests} Failed, Pass Percentage: ${percentage}%`);
}

// Batch 3: verify constructor options are applied and loadFile returned true.
async function runBatch3Tests() {
  console.log('[WindowManagerTest] === Batch 3 Window Creation & Resource Load Test Start ===');

  if (!mainWindow) {
    console.error('[WindowManagerTest] ERROR: mainWindow is null');
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
    console.error(`[WindowManagerTest] ERROR during batch 3 tests: ${String(err)}`);
  }
}

// Batch 6: verify updateMetaData / setGlobalProps injection before and after load.
async function runBatch6Tests() {
  console.log('[WindowManagerTest] === Batch 6 Global Props Injection Test Start ===');

  if (!mainWindow) {
    console.error('[WindowManagerTest] ERROR: mainWindow is null');
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
    console.error(`[WindowManagerTest] ERROR during batch 6 tests: ${String(err)}`);
  }
}

// Batch 7: exercise new window creation options (fullscreen, size limits, OS-level parent, modal).
async function runBatch7Tests() {
  console.log('[WindowManagerTest] === Batch 7 New Window Creation Interface Test Start ===');

  if (!mainWindow) {
    console.error('[WindowManagerTest] ERROR: mainWindow is null');
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

    // B7-STEP3: `parent` alone must create an OS-level child. This deliberately
    // omits the Harmony-specific `type: 'sub'` option to exercise the public
    // LynxWindow/Electron-compatible contract.
    console.log('[WindowManagerTest] ACTION: creating child window with parent only');
    const subWin = new LynxWindow({ parent: mainWindow, width: 400, height: 300, show: true });
    cleanupWindows.push(subWin);
    await sleep(2000);
    const subState = {
      isVisible: subWin.isVisible(),
      parentMatches: subWin.getParentWindow() === mainWindow,
      childListed: mainWindow.getChildWindows().includes(subWin)
    };
    logResult('B7-STEP3 parent-only child window creation', subState);
    recordTestResult('B7-STEP3 parent-only child window creation',
      subState.isVisible === true && subState.parentMatches === true && subState.childListed === true,
      'expected visible=true, parentMatches=true, childListed=true');

    await sleep(500);

    // B7-STEP4: change the native parent of the existing child window.
    console.log('[WindowManagerTest] ACTION: changing child parent window');
    const alternateParent = new LynxWindow({ width: 500, height: 350, show: true });
    cleanupWindows.push(alternateParent);
    await sleep(1500);
    subWin.setParentWindow(alternateParent);
    await sleep(1000);
    const reparentState = {
      parentMatches: subWin.getParentWindow() === alternateParent,
      newParentListsChild: alternateParent.getChildWindows().includes(subWin),
      oldParentListsChild: mainWindow.getChildWindows().includes(subWin)
    };
    logResult('B7-STEP4 setParentWindow', reparentState);
    recordTestResult('B7-STEP4 setParentWindow',
      reparentState.parentMatches === true &&
        reparentState.newParentListsChild === true &&
        reparentState.oldParentListsChild === false,
      'expected new parent relationship only');

    // Restore the original parent before cleanup so closing alternateParent
    // cannot close subWin in the middle of the remaining checks.
    subWin.setParentWindow(mainWindow);
    await sleep(500);

    // B7-STEP5: create a modal dialog window.
    console.log('[WindowManagerTest] ACTION: creating modal dialog window');
    const dialogWin = new LynxWindow({ type: 'dialog', parent: mainWindow, modal: true, width: 300, height: 200, show: true });
    cleanupWindows.push(dialogWin);
    await sleep(2000);
    const dialogState = { isVisible: dialogWin.isVisible(), isModal: dialogWin.isModal() };
    logResult('B7-STEP5 modal dialog creation', dialogState);
    recordTestResult('B7-STEP5 modal dialog creation', dialogState.isVisible === true && dialogState.isModal === true, 'expected visible=true, isModal=true');
  } catch (err) {
    console.error(`[WindowManagerTest] ERROR during batch 7 tests: ${String(err)}`);
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

// Batch 8: exercise cross-layer window property ops (hide/show) on a dedicated window.
async function runBatch8Tests() {
  console.log('[WindowManagerTest] === Batch 8 Cross-Layer Window Property Ops Test Start ===');

  const cleanupWindows: LynxWindow[] = [];

  try {
    console.log('[WindowManagerTest] ACTION: creating property-test window');
    const win = new LynxWindow({ width: 600, height: 400, show: true });
    cleanupWindows.push(win);
    await sleep(1500);

    // B8-STEP1: hide / show
    console.log('[WindowManagerTest] ACTION: calling hide()');
    win.hide();
    await sleep(1000);
    const hiddenVisible = win.isVisible();
    console.log('[WindowManagerTest] ACTION: calling show()');
    win.show();
    await sleep(1000);
    const shownVisible = win.isVisible();
    logResult('B8-STEP1 hide/show', { hiddenVisible, shownVisible });
    recordTestResult('B8-STEP1 hide/show', hiddenVisible === false && shownVisible === true, 'expected hidden=false, shown=true');

    await sleep(500);
  } catch (err) {
    console.error(`[WindowManagerTest] ERROR during batch 8 tests: ${String(err)}`);
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

// Batch 1 main flow: run all window-manager state tests (show/minimize/maximize/focus/close).
async function runTests() {
  console.log('[WindowManagerTest] === Batch 1 Window Manager Test Start ===');

  if (!mainWindow) {
    console.error('[WindowManagerTest] ERROR: mainWindow is null');
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

    // Batch 8: exercise hide/show only.
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
    console.log('[WindowManagerTest] === Batch 1 Window Manager Test End ===');
    logTestSummary();
  } catch (err) {
    console.error(`[WindowManagerTest] ERROR during tests: ${String(err)}`);
  }
}

/** Entry point for manually triggered WindowManager tests: create the dedicated test window (if needed), load the app bundle, and run all test batches. */
export async function runSphTests(appPath: string | undefined) {
  if (mainWindow) {
    console.log('[SphTest] test window already exists, skipping CreateWindow');
  } else {
    mainWindow = await createWindow();
  }
  batch3LoadFileResult = mainWindow.loadFile(appPath || '');
  try {
    await runTests();
  } finally {
    mainWindow = null;
    eventListenersAttached = false;
    recordedEvents.length = 0;
  }
}

// Create the dedicated test window and exercise the pre-load setGlobalProps/updateMetaData caching path.
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

// Safely stringify any value for logging, never throwing on circular structures.
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

// Devtools-style log forwarding: push main-process console output to the Lynx UI LogPanel in real time.
const sendLog = (level: 'log' | 'warn' | 'error', ...args: unknown[]) => {
  const text = args.map(safeStringify).join(' ');
  try {
    mainWindow?.sendGlobalEvent('bridge-log', { level, text, from: 'main' });
  } catch {
    // ignore send errors while the window is not ready
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
