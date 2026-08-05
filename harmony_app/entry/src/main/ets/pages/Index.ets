import lynxtron from 'liblynxtron_napi.so';
import hilog from '@ohos.hilog';
import web_webview from '@ohos.web.webview';
import { NodeController, BuilderNode, FrameNode } from '@ohos.arkui.node';
import { UIContext } from '@ohos.arkui.UIContext';

// ---- Same-layer rendering (official ArkUI PlatformView-style embedding) ----
// A @Builder that builds the real ArkWeb Web node. NodeController.makeNode()
// builds it into a BuilderNode and hands its FrameNode to a NodeContainer, which
// composites it same-layer with the Clay XComponent. This is the HarmonyOS
// blessed way for a third-party UI framework to embed native components
// (Web/Video/TextInput/Canvas/XComponent), superior to a plain Stack overlay.
@Builder
function buildWeb(controller: web_webview.WebviewController) {
  Web({
    src: "data:text/html,<body style='margin:0;background:%23107c41;font-family:sans-serif'><h1 style='color:white;padding:20px'>Same-layer Web via NodeContainer</h1><p style='color:%23d6ffd6;padding:0 20px;font-size:18px'>Built by NodeController.makeNode() -&gt; BuilderNode -&gt; FrameNode, hosted in a NodeContainer (official ArkUI same-layer rendering).</p></body>",
    controller: controller
  })
    .width('100%')
    .height('100%')
}

const wrappedWeb: WrappedBuilder<[web_webview.WebviewController]> = wrapBuilder(buildWeb);

class WebNodeController extends NodeController {
  private webController: web_webview.WebviewController = new web_webview.WebviewController();
  private builderNode: BuilderNode<[web_webview.WebviewController]> | null = null;

  makeNode(uiContext: UIContext): FrameNode | null {
    this.builderNode = new BuilderNode(uiContext);
    this.builderNode.build(wrappedWeb, this.webController);
    return this.builderNode.getFrameNode();
  }
}

const DOMAIN = 0x0000;
const TAG = 'LynxtronETS';

function describeError(e: Object): string {
  const err = e as Record<string, Object>;
  const parts: string[] = [];
  if (err) {
    if (err.name !== undefined) parts.push(String(err.name));
    if (err.code !== undefined) parts.push('code=' + String(err.code));
    if (err.message !== undefined) parts.push(String(err.message));
  }
  if (parts.length === 0) {
    parts.push(String(e));
  }
  return parts.join(' | ');
}

function inspectModule(): string {
  if (typeof lynxtron === 'undefined' || lynxtron === null) {
    return 'UNDEFINED/NULL';
  }
  const mod = lynxtron as Record<string, Object>;
  const keys = Object.keys(mod);
  const types: string[] = [];
  for (const k of keys) {
    types.push(k + ':' + typeof mod[k]);
  }
  return 'typeof=' + typeof lynxtron + ' keys=[' + keys.join(',') + '] ' + types.join(',');
}

const moduleDesc = inspectModule();
hilog.info(DOMAIN, TAG, '=== Module load diagnostics ===');
hilog.info(DOMAIN, TAG, 'typeof lynxtron = %{public}s', typeof lynxtron);
hilog.info(DOMAIN, TAG, 'inspect: %{public}s', moduleDesc);
if (typeof lynxtron !== 'undefined' && lynxtron !== null) {
  hilog.info(DOMAIN, TAG, 'typeof lynxtron.start = %{public}s', typeof (lynxtron as Record<string, Object>).start);
}

@Entry
@Component
struct Index {
  @State message: string = 'Lynxtron for HarmonyOS';
  @State lastResult: string = '(not started yet)';
  @State moduleInfo: string = moduleDesc;
  @State logLines: string[] = [];
  @State electronDebug: string = AppStorage.get<string>('electron_debug') ?? '(not set)';
  private webNodeController: WebNodeController = new WebNodeController();

  aboutToAppear(): void {
    // LynxtronMain is now started from XComponent.onLoad (see build()), so the
    // native surface exists before the render pipeline spins up.
    hilog.info(DOMAIN, TAG, 'aboutToAppear — waiting for XComponent surface');
  }

  startLynxtron(): void {
    if (typeof lynxtron === 'undefined' || lynxtron === null) {
      const msg = 'lynxtron module is undefined/null — native .so did not register';
      hilog.error(DOMAIN, TAG, '%{public}s', msg);
      this.lastResult = msg;
      this.addLog('ERR: ' + msg);
      return;
    }

    const mod = lynxtron as Record<string, Object>;
    const startType = typeof mod.start;
    hilog.info(DOMAIN, TAG, 'typeof lynxtron.start = %{public}s', startType);
    this.addLog('typeof .start = ' + startType);

    if (startType !== 'function') {
      const detail = inspectModule();
      const msg = '.start is ' + startType + ', not function. ' + detail;
      hilog.error(DOMAIN, TAG, '%{public}s', msg);
      this.lastResult = msg;
      this.addLog('ERR: ' + msg);
      return;
    }

    hilog.info(DOMAIN, TAG, '>>> calling lynxtron.start() now');
    this.addLog('Calling lynxtron.start()...');

    try {
      const rc: number = lynxtron.start();
      hilog.info(DOMAIN, TAG, '<<< lynxtron.start() returned rc=%{public}d', rc);
      this.lastResult = 'rc=' + rc;
      this.addLog('OK rc=' + rc);
    } catch (e) {
      const desc = describeError(e as Object);
      const err = e as Record<string, Object>;
      hilog.error(DOMAIN, TAG, 'lynxtron.start() threw: %{public}s', desc);
      this.addLog('THROW: ' + desc);

      if (err?.stack !== undefined) {
        const stack = String(err.stack);
        hilog.error(DOMAIN, TAG, 'stack: %{public}s', stack);
        this.addLog('STACK: ' + stack);
      }

      const allKeys = Object.keys(err);
      if (allKeys.length > 0) {
        const dump = allKeys.map((k: string): string => k + '=' + String(err[k])).join('; ');
        hilog.error(DOMAIN, TAG, 'error fields: %{public}s', dump);
        this.addLog('FIELDS: ' + dump);
      }

      this.lastResult = desc;
    }
  }

  addLog(line: string): void {
    this.logLines = [...this.logLines, line];
    if (this.logLines.length > 30) {
      this.logLines = this.logLines.slice(this.logLines.length - 30);
    }
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column() {
        // XComponent produces a native surface; its onLoad NAPI callback in
        // lynxtron_napi_bridge.cc receives OH_NativeXComponent and hands the
        // EGL window down to NativeWindowHarmony for Chromium/Lynx to draw into.
        XComponent({
          id: 'lynxtron_surface',
          type: XComponentType.SURFACE,
          libraryname: 'lynxtron_napi'
        })
          .width('100%')
          .layoutWeight(1)
          .onLoad(() => {
            hilog.info(DOMAIN, TAG, 'XComponent onLoad — surface ready');
            this.startLynxtron();
          })

        Text('Result: ' + this.lastResult)
          .fontSize(11)
          .fontColor('#999999')
          .height(16)
          .onClick(()=>{

          })
      }
      .width('100%')
      .height('100%')

      // Same-layer Web hosted via NodeContainer (official ArkUI mechanism).
      NodeContainer(this.webNodeController)
        .width(1100)
        .height(700)
        .margin({ top: 120, left: 120 })
        .border({ width: 3, color: Color.Red })
    }
    .width('100%')
    .height('100%')
  }
}
