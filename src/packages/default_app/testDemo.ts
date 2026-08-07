// ──────────────────────────────────────────────
// shell.openExternal 测试用例
// ──────────────────────────────────────────────

import { shell, dialog, nativeImage, powerMonitor } from 'lynxtron';

/** 测试 shell.openExternal 各种协议的支持情况 */
export async function testOpenExternal() {
  const testCases: Array<{ label: string; url: string }> = [
    // ── HTTP/HTTPS 网页链接 ──
    { label: 'HTTP 网页', url: 'http://qq.com' },
    { label: 'HTTPS 网页', url: 'https://www.baidu.com' },
    { label: 'HTTPS 带路径和参数', url: 'https://github.com/lynx-family/lynxtron/issues?q=is%3Aopen' },

    // ── 邮件协议 ──
    { label: 'mailto 空收件人', url: 'mailto:' },
    { label: 'mailto 指定收件人', url: 'mailto:user@example.com' },
    { label: 'mailto 带主题和正文', url: 'mailto:user@example.com?subject=Hello&body=测试邮件正文' },

    // ── 电话/短信协议 ──
    { label: 'tel 拨号', url: 'tel:10086' },
    { label: 'sms 短信', url: 'sms:10086' },
    { label: 'sms 带正文', url: 'sms:10086?body=Hello' },

    // ── 文件协议 ──
    { label: 'file 本地文件', url: 'file:///tmp/test.txt' },

    // ── 特殊协议 ──
    { label: '自定义 scheme', url: 'myapp://open?page=home&id=42' },
    { label: 'ftp 协议', url: 'ftp://ftp.example.com' },
  ];

  console.log(`[shell.openExternal] 开始测试，共 ${testCases.length} 个用例`);
  let passed = 0;
  let failed = 0;

  for (const { label, url } of testCases) {
    try {
      await shell.openExternal(url);
      console.log(`  ✓ [${label}] ${url}`);
      passed++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ✗ [${label}] ${url} → ${message}`);
      failed++;
    }
  }

  console.log(`[shell.openExternal] 完成: ${passed} 通过, ${failed} 失败`);
}

// ──────────────────────────────────────────────
// shell.openPath 测试用例
// ──────────────────────────────────────────────

/** 测试 shell.openPath 用系统默认方式打开文件/目录（针对鸿蒙） */
export async function testOpenPath() {
  // 鸿蒙应用沙箱路径前缀
  const sandboxBase = '/data/storage';

  const testCases: Array<{ label: string; path: string }> = [
    // ── 鸿蒙系统级路径 ──
    { label: '系统 etc 目录', path: '/system/etc' },
    { label: 'proc 虚拟文件系统', path: '/proc/version' },

    // ── 鸿蒙应用沙箱路径 ──
    { label: 'el1 非加密区根目录', path: `${sandboxBase}/el1/base` },
    { label: 'el2 加密区根目录', path: `${sandboxBase}/el2/base` },
    { label: 'el2 haps 目录', path: `${sandboxBase}/el2/base/haps` },
    { label: 'el2 files 目录', path: `${sandboxBase}/el2/base/files` },

    // ── 存储/媒体路径 ──
    { label: '外部存储目录', path: '/storage/Users/currentUser' },
    { label: 'Download 下载目录', path: '/storage/Users/currentUser/Download' },

    // ── 当前运行时文件 ──
    // { label: '当前 ts 文件自身',          path:  },

    // ── 边界/异常场景 ──
    { label: '不存在的路径', path: `${sandboxBase}/nonexistent/ghost.txt` },
    { label: '空字符串', path: '' },
  ];

  console.log(`[shell.openPath] 开始测试（鸿蒙），共 ${testCases.length} 个用例`);
  let passed = 0;
  let failed = 0;

  for (const { label, path } of testCases) {
    try {
      const errorMsg = await shell.openPath(path);
      if (errorMsg) {
        // openPath 通过返回非空字符串来表示失败
        console.warn(`  ✗ [${label}] ${path} → ${errorMsg}`);
        failed++;
      } else {
        console.log(`  ✓ [${label}] ${path}`);
        passed++;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ✗ [${label}] ${path} → ${message}`);
      failed++;
    }
  }

  console.log(`[shell.openPath] 完成: ${passed} 通过, ${failed} 失败`);
}


// ──────────────────────────────────────────────
// dialog.showOpenDialog 测试用例
// 注意: 交互式测试 —— 每个用例都会弹出系统文件选择器,
//       需在真机上手动选择文件/目录或取消, 结果实时打印。
// ──────────────────────────────────────────────

// 类型宽松: 覆盖各种 options 组合, 具体字段对齐 Electron OpenDialogOptions
// (lynxtron 鸿蒙实现支持: title/message/button_label/default_path/filters/
//  properties[openFile|openDirectory|multiSelections|混合])
interface ShowOpenDialogCase {
  label: string;
  options: Record<string, unknown>;
}

const testCases: ShowOpenDialogCase[] = [
  // ── 基础选择 ──
  { label: '单选文件(默认)', options: { properties: ['openFile'] } },
  { label: '多选文件', options: { properties: ['openFile', 'multiSelections'] } },
  { label: '选择目录', options: { properties: ['openDirectory'] } },

  // ── 带参数 ──
  {
    label: '带 filters(*.js/*.ts)',
    options: {
      properties: ['openFile'],
      filters: [{ name: 'JavaScript/TypeScript', extensions: ['js', 'ts'] }],
    },
  },
  {
    label: '带 defaultPath(Desktop/test)',
    options: {
      properties: ['openFile'],
      defaultPath: 'file://docs/storage/Users/currentUser/Desktop/test',
    },
  },

  // ── 取消路径 (弹窗后直接取消) ──
  { label: '用户取消', options: { properties: ['openFile'] } },
];

/** 测试 dialog.showOpenDialog 各配置的弹窗/返回值/取消行为 */
export async function testShowOpenDialog() {
  console.log(`[dialog.showOpenDialog] 开始测试，共 ${testCases.length} 个用例（交互式, 每个都会弹 picker）`);
  let passed = 0;
  let failed = 0;

  for (const { label, options } of testCases) {
    console.log(`  ── [${label}] 弹窗中, 请在真机选择或取消 ──`);
    try {
      const result = await dialog.showOpenDialog(options);
      const filePaths: string[] = result.filePaths ?? [];
      if (result.canceled) {
        console.log(`  ✓ [${label}] canceled=true (用户取消)`);
        passed++;
      } else if (filePaths.length > 0) {
        console.log(`  ✓ [${label}] filePaths=${JSON.stringify(filePaths)}`);
        passed++;
      } else {
        console.warn(`  ✗ [${label}] canceled=false 但 filePaths 为空`);
        failed++;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ✗ [${label}] 抛异常 → ${message}`);
      failed++;
    }
  }
  console.log(`[dialog.showOpenDialog] 完成: ${passed} 通过, ${failed} 失败`);
}

// ──────────────────────────────────────────────
// dialog.showSaveDialog 测试用例
// 注意: 交互式测试 —— 每个用例都会弹出系统保存选择器,
//       需在真机上选择保存位置/输入文件名或取消, 结果实时打印。
// ──────────────────────────────────────────────

// 类型宽松: 覆盖各种 options 组合, 具体字段对齐 Electron SaveDialogOptions
// (lynxtron 鸿蒙实现支持: title/message/button_label/default_path/filters)
interface ShowSaveDialogCase {
  label: string;
  options: Record<string, unknown>;
}

const saveTestCases: ShowSaveDialogCase[] = [
  // ── 基础保存 ──
  // { label: '默认保存', options: {} },

  // ── 带 defaultPath ──
  {
    label: '带 defaultPath(Desktop/test/新文件)',
    options: {
      defaultPath: 'file://docs/storage/Users/currentUser/Desktop/test/新文件.txt',
    },
  },

  // ── 带 filters ──
  {
    label: '带 filters(*.txt/*.md)',
    options: {
      defaultPath: 'file://docs/storage/Users/currentUser/Desktop/test',
      filters: [{ name: 'Text', extensions: ['txt', 'md'] }],
    },
  },

  // ── 取消路径 (弹窗后直接取消) ──
  { label: '用户取消', options: {} },
];

/** 测试 dialog.showSaveDialog 各配置的弹窗/返回值/取消行为 */
export async function testShowSaveDialog() {
  console.log(`[dialog.showSaveDialog] 开始测试，共 ${saveTestCases.length} 个用例（交互式, 每个都会弹 picker）`);
  let passed = 0;
  let failed = 0;

  for (const { label, options } of saveTestCases) {
    console.log(`  ── [${label}] 弹窗中, 请在真机选择保存位置或取消 ──`);
    // ── 运行时字符串诊断: defaultPath 的码元与 UTF-8 hex ──
    const dp: unknown = (options as Record<string, unknown>).defaultPath;
    if (typeof dp === 'string') {
      const codes: number[] = [];
      for (let i = 0; i < dp.length; i++) codes.push(dp.charCodeAt(i));
      const bytes: number[] = [];
      try {
        const enc = new TextEncoder();
        for (const b of enc.encode(dp)) bytes.push(b);
      } catch { /* TextEncoder 不可用时跳过 */ }
      console.log(`  [diag] defaultPath len=${dp.length} charCodes=[${codes.join(',')}] utf8hex=[${bytes.map(b => b.toString(16).padStart(2, '0')).join('')}]`);
    } else {
      console.log(`  [diag] defaultPath 非字符串: ${String(dp)}`);
    }
    try {
      const result = await dialog.showSaveDialog(options);
      const filePath: string = result.filePath ?? '';
      if (result.canceled) {
        console.log(`  ✓ [${label}] canceled=true (用户取消)`);
        passed++;
      } else if (filePath.length > 0) {
        console.log(`  ✓ [${label}] filePath=${JSON.stringify(filePath)}`);
        passed++;
      } else {
        console.warn(`  ✗ [${label}] canceled=false 但 filePath 为空`);
        failed++;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ✗ [${label}] 抛异常 → ${message}`);
      failed++;
    }
  }
  console.log(`[dialog.showSaveDialog] 完成: ${passed} 通过, ${failed} 失败`);
}
export async function testCreateFromPath() {
  const result = await dialog.showOpenDialog({
    title: '选择图片',
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const imagePath = result.filePaths[0];
    console.log(imagePath)
    const image = nativeImage.createFromPath(imagePath);

    console.log("isEmpty", image.isEmpty()); // false 表示成功加载
    console.log('size:', image.getSize());
  }
}
export async function testCreateFromBitmap() {
  const result = await dialog.showOpenDialog({
    title: '选择图片',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    // 先用 createFromPath 加载
    const img = nativeImage.createFromPath(result.filePaths[0]);

    // createFromBitmap 测试：toBitmap → 构造新 NativeImage
    const raw = img.toBitmap();           // Buffer (BGRA 像素数据)
    const size = img.getSize();
    const img2 = nativeImage.createFromBitmap(raw, {
      width: size.width,
      height: size.height
    });
    console.log('createFromBitmap isEmpty:', img2.isEmpty());  // 期望 false
    console.log('createFromBitmap size:', img2.getSize());     // 期望与原图一致

    // toPNG 测试
    const png = img.toPNG();              // Buffer (PNG 编码字节)
    console.log('toPNG type:', png.constructor.name);        // Buffer
    console.log('toPNG bytes:', png.length);                 // > 0

    // 验证 PNG 可被重新解析
    const img3 = nativeImage.createFromBuffer(png);
    console.log('reparse fromPNG isEmpty:', img3.isEmpty());  // 期望 false
  }
}

export function testOnlock() {
  let lockCount = 0;
  let unlockCount = 0;
  let lastEvent: 'lock-screen' | 'unlock-screen' | null = null;

  const onLock = () => {
    lockCount++;

    if (lastEvent === 'lock-screen') {
      console.error('[powerMonitor] FAIL: duplicate lock-screen');
    } else {
      console.log(`[powerMonitor] PASS: lock-screen #${lockCount}`);
    }

    lastEvent = 'lock-screen';
  };

  const onUnlock = () => {
    unlockCount++;

    if (lastEvent !== 'lock-screen') {
      console.error(
        `[powerMonitor] FAIL: unexpected unlock-screen, lastEvent=${lastEvent}`
      );
    } else {
      console.log(`[powerMonitor] PASS: unlock-screen #${unlockCount}`);
    }

    lastEvent = 'unlock-screen';
  };

  powerMonitor.on('lock-screen', onLock);
  powerMonitor.on('unlock-screen', onUnlock);

  console.log('[powerMonitor] listeners registered');

  // 测试结束时调用，验证 off() 并避免监听器残留。
  function stopPowerMonitorTest(): void {
    powerMonitor.off('lock-screen', onLock);
    powerMonitor.off('unlock-screen', onUnlock);

    console.log(
      `[powerMonitor] listeners removed: lock=${lockCount}, unlock=${unlockCount}`
    );
  }

  setTimeout(() => {
    stopPowerMonitorTest()
  }, 5 * 1000)
}