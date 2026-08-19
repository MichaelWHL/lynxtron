# app.on("open-url") 和 app.on("open-file") 完整调用链路文档

## 概述

`open-url` 和 `open-file` 是应用接收外部 URL/文件的事件。当 OS 或其他应用通过自定义 Scheme (`myapp://xxx`) 或文件关联打开当前应用时，这两个事件被触发，将 URL 或文件路径传递给 JS 层。

在 HarmonyOS 上，有两种触发路径：
- **热启动**: `UIAbility.onNewWant()` — 应用已运行，系统分发新 Want
- **冷启动**: `UIAbility.onCreate()` — 应用首次启动时携带 Want URI

两者通过 NAPI bridge 跨 .so 投递给 native 层。冷启动时 `LynxtronMain` 尚未启动、主循环未就绪，URL 会暂存在 pending 队列中，等主循环就绪后刷入。冷启动还需确保 `liblynxtron.so` 已加载才能完成 `dlsym` 函数解析。

---

## 冷启动 vs 热启动时序

```
冷启动:
  onCreate → handleWantUri → lynxtron.openUrl(url)
    → EnsureLynxtronLoaded() (dlopen liblynxtron.so)
    → LynxtronHandleOpenURL → runner=null → 暂存 g_pending_urls
    → LynxtronMain 启动 → PreMainMessageLoopRun
    → LynxtronFlushPendingOpenURLs() → OpenURL → Emit("open-url")

热启动:
  onNewWant → handleWantUri → lynxtron.openUrl(url)
    → LynxtronHandleOpenURL → runner 已就绪 → PostTask
    → OpenURL → Emit("open-url")
```

---

## 完整调用链路 (open-url)

### 1. ETS 层 — 冷启动/热启动统一入口

**文件**: `harmony_app/entry/src/main/ets/entryability/EntryAbility.ets`

```ts
onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
  // ... 初始化 + electron_debug 处理 ...
  AppAdapter.getInstance().setAbilityContext(this.context);
  this.handleWantUri(want);   // 冷启动: onCreate 携带 Want URI
}

onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
  // ... 日志 ...
  this.handleWantUri(want);   // 热启动: 系统分发新 Want
}

private handleWantUri(want: Want): void {
  let uriNotNull = want["uri"] !== undefined && want["uri"] !== '';
  if (!uriNotNull) return;
  let uri = want['uri'] as string;
  if (uri.startsWith("file://docs/")) {
    AppAdapter.getInstance().openNewWindow(uri.replace("file://docs/", "file:///"));
  } else if (uri.startsWith("file:///")) {
    AppAdapter.getInstance().openNewWindow(uri);
  } else {
    AppAdapter.getInstance().openURL(uri);
  }
}
```

### 2. ETS 层 — AppAdapter 统一管理

**文件**: `harmony_app/entry/src/main/ets/adapter/AppAdapter.ets`

```ts
class AppAdapter {
  private static instance: AppAdapter;
  private context: common.UIAbilityContext | null = null;

  static getInstance(): AppAdapter { /* singleton */ }

  setAbilityContext(context: common.UIAbilityContext): void {
    this.context = context;
    lynxtron.setAbilityContext(context);
  }

  openURL(url: string): void {
    lynxtron.openUrl(url);        // NAPI 调用 → liblynxtron_napi.so
  }

  openNewWindow(openUrl: string): void {
    lynxtron.openPath(openUrl);   // NAPI 调用 → liblynxtron_napi.so
  }
}

export default AppAdapter;
```

### 3. NAPI Bridge 层 — 跨 .so 调用 (ETS 线程)

**文件**: `src/shell/app/lynxtron_napi_bridge.cc`

```cpp
napi_value OpenUrl(napi_env env, napi_callback_info info) {
  // 1. 从 NAPI args 提取 URL 字符串
  std::string url(...);

  // 2. 确保 liblynxtron.so 已加载（冷启动时 Start() 可能尚未调用）
  if (!g_handle_open_url) {
    EnsureLynxtronLoaded();       // dlopen liblynxtron.so（幂等，多次调用安全）
    if (g_lynxtron_handle) {
      g_handle_open_url = reinterpret_cast<LynxtronHandleOpenURLFn>(
          dlsym(g_lynxtron_handle, "LynxtronHandleOpenURL"));
    }
  }

  // 3. 调用 native 函数
  if (g_handle_open_url) {
    g_handle_open_url(url.c_str());
  }
}
```

> **冷启动关键**: `onCreate` 执行时 `lynxtron.start()` 尚未调用，`g_lynxtron_handle` 为 null。
> 需要通过 `EnsureLynxtronLoaded()` 主动执行 `dlopen("liblynxtron.so")` 才能拿到函数指针。
> `EnsureLynxtronLoaded()` 是幂等的 — 后续 `Start()` 再调会因 `g_lynxtron_main` 已设置而立即返回。

`OpenPath` 逻辑相同，dlsym 解析 `LynxtronHandleOpenPath`。

**NAPI 函数注册** (`lynxtron_napi_bridge.cc`):
```cpp
napi_property_descriptor desc[] = {
    // ...
    {"openUrl", nullptr, OpenUrl, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"openPath", nullptr, OpenPath, nullptr, nullptr, nullptr, napi_default, nullptr},
};
```

### 4. Native 导出层 — 线程跳转 + 冷启动延迟投递

**文件**: `src/shell/app/lynx_windowless_renderer_harmony.cc`

```cpp
namespace {
std::mutex g_pending_mutex;
std::vector<std::string> g_pending_urls;        // 冷启动暂存
std::vector<std::string> g_pending_file_paths;  // 冷启动暂存

void DispatchOpenURL(const std::string& u) {
  if (auto* app = lynxtron::Application::Get())
    app->OpenURL(u);
}
void DispatchOpenFile(const std::string& fp) {
  if (auto* app = lynxtron::Application::Get())
    app->OpenFile(fp);
}
}  // namespace

extern "C" __attribute__((visibility("default"))) void
LynxtronHandleOpenURL(const char* url) {
  if (!url || !*url) return;
  auto runner = lynxtron::GetUIThreadTaskRunner();
  if (runner) {
    // 热启动: UI 线程已就绪，直接 PostTask
    runner->PostTask(FROM_HERE, base::BindOnce(&DispatchOpenURL, std::string(url)));
  } else {
    // 冷启动: UI 线程未就绪，暂存到 pending 队列
    std::lock_guard<std::mutex> lock(g_pending_mutex);
    g_pending_urls.emplace_back(url);
  }
}

// 主循环就绪后由 main_parts.cc 调用，刷入 pending 队列
extern "C" __attribute__((visibility("default"))) void
LynxtronFlushPendingOpenURLs() {
  std::vector<std::string> urls, file_paths;
  {
    std::lock_guard<std::mutex> lock(g_pending_mutex);
    urls.swap(g_pending_urls);
    file_paths.swap(g_pending_file_paths);
  }
  for (const auto& u : urls) DispatchOpenURL(u);
  for (const auto& fp : file_paths) DispatchOpenFile(fp);
}
```

> **线程安全**: `LynxtronHandleOpenURL` 可从任意线程调用（ETS onNewWant 线程 / ETS onCreate 线程），
> `g_pending_mutex` 保护 pending 队列的并发写入。

### 4.1 主循环就绪钩子 — 刷入 pending URL

**文件**: `src/shell/app/main_parts.cc`

文件顶层声明 (`#if BUILDFLAG(IS_HARMONY)` 块):
```cpp
#if BUILDFLAG(IS_HARMONY)
extern "C" void LynxtronFlushPendingOpenURLs();
#endif
```

调用点 (`Initialize()` 末尾, `PreMainMessageLoopRun` 之后):
```cpp
MP_LOG("step 26: Application::PreMainMessageLoopRun");
Application::Get()->PreMainMessageLoopRun();

#if BUILDFLAG(IS_HARMONY)
  LynxtronFlushPendingOpenURLs();
#endif
```

> `extern "C"` 声明必须放在文件顶层（不在 namespace/函数体内），编译通过 `#if` 仅在 HarmonyOS 可见。

### 5. Application 层 — Observer 通知 (UI 主线程)

**文件**: `src/shell/app/application.cc:220-222`

```cpp
void Application::OpenURL(const std::string& url) {
  observers_.Notify(&ApplicationObserver::OnOpenURL, url);
}
```

**文件**: `src/shell/app/application.cc:213-218`

```cpp
bool Application::OpenFile(const std::string& file_path) {
  bool prevent_default = false;
  observers_.Notify(&ApplicationObserver::OnOpenFile, &prevent_default, file_path);
  return prevent_default;   // open-file 支持 preventDefault
}
```

### 6. App 层 — Observer 实现 (UI 主线程)

**文件**: `src/shell/api/api_app.cc:473-474` (注册)

```cpp
App::App() {
  Application::Get()->AddObserver(this);   // 启动时注册观察者
}
```

**文件**: `src/shell/api/api_app.cc:517-519`

```cpp
void App::OnOpenURL(const std::string& url) {
  Emit("open-url", url);
}
```

**文件**: `src/shell/api/api_app.cc:511-514`

```cpp
void App::OnOpenFile(bool* prevent_default, const std::string& file_path) {
  if (Emit("open-file", file_path)) {
    *prevent_default = true;
  }
}
```

### 7. EventEmitter 桥接 → JS

**文件**: `src/shell/api/event_emitter_mixin.h:33-44`

`EventEmitterMixin::Emit()` → `gin_helper::EmitEvent()` → `node::MakeCallback(isolate, obj, "emit", args)`

**文件**: `src/shell/common/gin_helper/event_emitter_caller.h:34-45`

将 C++ 参数转为 v8 值数组，调用 JS 的 `EventEmitter.emit(name, args...)`。

### 8. JS 监听

```js
app.on("open-url", (event, url) => {
  console.log("received url:", url);
  // 开发者自行决定如何处理 url（解析、跳转、忽略等）
});

app.on("open-file", (event, file_path) => {
  event.preventDefault();  // 阻止应用后续打开文件的默认行为
  console.log("received file:", file_path);
});
```

---

## open-url vs open-file 区别

| 特性 | open-url | open-file |
|------|----------|-----------|
| **触发条件** | 非 file:/// 的 URI（http、自定义 scheme 等） | file:/// 或 file://docs/ 路径 |
| **preventDefault** | 不支持 | 支持，阻止默认打开行为 |
| **native 调用** | `Application::OpenURL()` | `Application::OpenFile()` |
| **参数类型** | `url: string` | `path: string` |

---

## 单实例锁 (HarmonyOS)

**文件**: `src/shell/api/api_app.cc:743-752`

```cpp
bool App::HasSingleInstanceLock() const {
#if BUILDFLAG(IS_HARMONY)
  return true;   // OHOS 的 launchType: "singleton" 管理单实例，无需 ProcessSingleton
#else
  if (process_singleton_) { return true; }
  return false;
#endif
}

bool App::RequestSingleInstanceLock(gin::Arguments* args) {
#if BUILDFLAG(IS_HARMONY)
  return true;   // 同上
#endif
  // ... 其他平台 ProcessSingleton 逻辑 ...
}
```

---

## 与 Electron (OHOS) 链路对比

| 节点 | Electron (OHOS) | Lynxtron-C |
|------|----------------|------------|
| **URL 接收** | `BrowserAdapter` (外部 SDK) 自动回调 | ETS `onCreate`/`onNewWant` + NAPI 手动传入 |
| **冷启动 .so 加载** | Chromium 进程直接加载 `libelectron.so` | NAPI bridge `EnsureLynxtronLoaded()` 主动 dlopen |
| **命令分发** | `ExecuteCommandSingleton` switch 多命令 | 单函数直接调用 `LynxtronHandleOpenURL` |
| **冷启动延迟** | `PreMainMessageLoopRun` 中 `GetStartUri()` | pending 队列 + `LynxtronFlushPendingOpenURLs()` |
| **线程跳转** | `content::GetUIThreadTaskRunner()->PostTask` | `GetUIThreadTaskRunner()->PostTask` |
| **容器调用** | `Browser::Get()->OpenURL()` | `Application::Get()->OpenURL()` |
| **Observer** | `BrowserObserver::OnOpenURL` | `ApplicationObserver::OnOpenURL` |
| **Emit** | `App::OnOpenURL()` → `Emit("open-url", url)` | 完全相同 |
| **JS 监听** | `app.on("open-url", ...)` | 完全相同 |
| **外部依赖** | 依赖 `//ohos/adapter:adapter` (Chromium 闭源 SDK) | 零外部依赖 |
| **单实例锁** | `HasSingleInstanceLock()` → `return true` | 相同 |

---

## 关键文件索引

| 文件 | 作用 | 平台 |
|------|------|------|
| `harmony_app/.../entryability/EntryAbility.ets` | OHOS 冷/热启动 Want 回调，`onCreate`+`onNewWant` 统一 `handleWantUri` | HarmonyOS |
| `harmony_app/.../adapter/AppAdapter.ets` | ETS 适配器单例，统一管理 lynxtron NAPI 调用 | HarmonyOS |
| `src/shell/app/lynxtron_napi_bridge.cc` | NAPI Bridge，`EnsureLynxtronLoaded()` + dlsym + 注册 `openUrl`/`openPath` | HarmonyOS |
| `src/shell/app/lynx_windowless_renderer_harmony.cc` | `LynxtronHandleOpenURL/OpenPath` + pending 队列 + `LynxtronFlushPendingOpenURLs` | HarmonyOS |
| `src/shell/app/main_parts.cc` | `PreMainMessageLoopRun` 后 `#if IS_HARMONY` 调 `LynxtronFlushPendingOpenURLs` | HarmonyOS |
| `src/shell/app/application.cc` | `Application::OpenURL/OpenFile` → observer 通知 | 全平台 |
| `src/shell/app/application_observer.h` | `ApplicationObserver::OnOpenURL/OnOpenFile` 接口 | 全平台 |
| `src/shell/api/api_app.cc` | `App::OnOpenURL/OnOpenFile` → `Emit("open-url/open-file")` + 单实例锁 | 全平台 |
| `src/shell/api/event_emitter_mixin.h` | `Emit()` → gin_helper/EmitEvent 桥接 V8 | 全平台 |
| `src/packages/lynxtron/apis/api/app.d.ts` | JS API `@platform darwin, harmony` 声明 | Darwin + HarmonyOS |
