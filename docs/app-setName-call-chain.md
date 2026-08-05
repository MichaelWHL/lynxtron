# app.setName 完整调用链路文档

## 概述

`app.setName` 将 JS 侧设置的名称同步到 HarmonyOS 原生窗口标题栏（Mission Label）。

核心路径：

```
JS: app.setName('X')
  → Application::SetName()           (写入全局 OverriddenApplicationName)
  → NativeWindow 构造时 GetName()     (读回来作默认 title)
  → NativeWindowHarmony::SetTitle()   (写入 g_harmony_window_title)
  → SyncIme (bridge 50ms 轮询)        (dlsym 读标题)
  → context.setMissionLabel()         (OHOS 原生标题栏)
```

---

## 完整调用链路（按层级）

### 1. JS 层 — default_app.ts

**文件**: `src/packages/default_app/default_app.ts:12`

```ts
app.setName("LYNXTRON-ZLL")
await app.whenReady();
```

在窗口创建前调用，窗口创建时构造函数会读取这个名字作为默认标题。

---

### 2. JS Binding 层 — app.ts / api_app.cc

**文件**: `src/lib/browser/api/app.ts:9-31`

```ts
const bindings = process._linkedBinding('lynxtron_binding_app');
const { app } = bindings;
const nativeNSetter = app.setName;
Object.defineProperty(app, 'name', {
  set: (name) => nativeNSetter.call(app, name),
});
```

**文件**: `src/shell/api/api_app.cc:1157-1158`

```cpp
.SetMethod("setName",
           base::BindRepeating(&Application::SetName, application))
```

将 JS 的 `app.setName(name)` 绑定到 C++ `Application::SetName()`。

---

### 3. Application 层 — application.cc

**文件**: `src/shell/app/application.cc:194-196`

```cpp
void Application::SetName(const std::string& name) {
  OverriddenApplicationName() = name;
}
```

写入全局静态字符串。

**文件**: `src/shell/common/application_info.cc:16-19`

```cpp
std::string& OverriddenApplicationName() {
  static base::NoDestructor<std::string> overridden_application_name;
  return *overridden_application_name;
}
```

全局存储，无需 IPC，纯进程内。

---

### 4. HarmonyOS 平台 Fallback — application_harmony.cc

**文件**: `src/shell/app/application_harmony.cc:82-84` [本次修改]

```cpp
std::string Application::GetExecutableFileProductName() const {
  return GetApplicationName();  // 原为 return std::string();
}
```

**文件**: `src/shell/app/application.cc:186-192`

```cpp
std::string Application::GetName() const {
  std::string ret = OverriddenApplicationName();  // app.setName 值
  if (ret.empty()) {
    ret = GetExecutableFileProductName();         // HarmonyOS fallback
  }
  return ret;
}
```

**文件**: `src/shell/common/application_info_harmony.cc:36-45`

```cpp
std::string GetApplicationName() {
  std::string ret = OverriddenApplicationName();
  if (ret.empty()) {
    ret = "Lynxtron";  // 硬编码 fallback
  }
  return ret;
}
```

---

### 5. NativeWindow 构造 — native_window.cc

**文件**: `src/shell/app/native_window.cc:157-158`

```cpp
SetTitle(
    options.ValueOrDefault(options::kTitle, Application::Get()->GetName()));
```

窗口构造时，如果 `options.title` 未传，取 `Application::GetName()`（即 `app.setName` 的值）作为默认标题。

---

### 6. 基类声明 — native_window.h

**文件**: `src/shell/app/native_window.h:159`

```cpp
virtual void SetTitle(const std::string& title) = 0;
```

纯虚函数，由各平台实现。

---

### 7. HarmonyOS 实现 — native_window_harmony.cc [本次修改]

**文件**: `src/shell/app/native_window_harmony.cc`

**全局存储** (17-19 行):
```cpp
static std::string g_harmony_window_title;
```

**SetTitle 同步** (144-147 行):
```cpp
void SetTitle(const std::string& title) override {
  title_ = title;
  g_harmony_window_title = title;  // 同步到全局，供 bridge 读取
}
```

**C 导出函数** (227-230 行):
```cpp
extern "C" __attribute__((visibility("default")))
const char* LynxtronGetWindowTitle() {
  return lynxtron::g_harmony_window_title.c_str();
}
```

`visibility("default")` 使 symbol 可被 `liblynxtron_napi.so` 通过 `dlsym` 找到。

---

### 8. NAPI Bridge — lynxtron_napi_bridge.cc [本次修改]

**文件**: `src/shell/app/lynxtron_napi_bridge.cc`

**类型定义 + 全局指针** (144, 149 行):
```cpp
using GetTitleFn = const char* (*)();
GetTitleFn g_get_title = nullptr;
```

**Context 存储** (371-372 行):
```cpp
napi_ref g_ability_context_ref = nullptr;
std::string g_last_synced_title;
```

**SetAbilityContext NAPI** (630-644 行):
```cpp
napi_value SetAbilityContext(napi_env env, napi_callback_info info) {
  // 从 EntryAbility.ets 接收 UIAbilityContext
  // 存为 napi_ref，供 SyncWindowTitle 使用
  napi_create_reference(env, argv[0], 1, &g_ability_context_ref);
}
```

**SyncImeImpl** (648-678 行) — 原有 IME 逻辑，无改动、只函数名提取。

**SyncWindowTitle** (680-697 行) — 新增:
```cpp
void SyncWindowTitle(napi_env env) {
  // dlsym("LynxtronGetWindowTitle") → 读标题
  // napi_get_reference_value → 取 context
  // napi_call_function → context.setMissionLabel(title)
}
```

**SyncIme 入口** (699-704 行):
```cpp
napi_value SyncIme(napi_env env, napi_callback_info) {
  SyncImeImpl(env);        // IME 逻辑
  SyncWindowTitle(env);    // 标题同步
  // 未来加: SyncFoo(env);
}
```

**GetWindowTitle NAPI** (752-761 行) — 供 ETS 直接查询标题:
```cpp
napi_value GetWindowTitle(napi_env env, napi_callback_info) {
  // dlsym → LynxtronGetWindowTitle → return 字符串
}
```

**NAPI 注册** (`Init`, 776-781 行):
```cpp
{"getWindowTitle", nullptr, GetWindowTitle, ...},
{"setAbilityContext", nullptr, SetAbilityContext, ...},
```

---

### 9. ArkTS 层 — EntryAbility.ets [本次修改]

**文件**: `harmony_app/entry/src/main/ets/entryability/EntryAbility.ets:43-44`

```typescript
AppStorage.setOrCreate('abilityContext', this.context);
lynxtron.setAbilityContext(this.context);
```

在 `onCreate` 中将 `UIAbilityContext` 传给 bridge，供 `SyncWindowTitle` 调 `setMissionLabel`。

---

### 10. ArkTS 轮询 — Index.ets

**文件**: `harmony_app/entry/src/main/ets/pages/Index.ets:98`

```typescript
setInterval(() => this.syncImeState(), 50);  // 已有代码，无需修改
```

已在 50ms 轮询 `lynxtron.syncIme()`，后者（bridge 中 `SyncIme`）内部调度 `SyncWindowTitle()`。

---

## 关键结论

| 项 | 说明 |
|---|---|
| 修改时机 | `app.setName` 须在窗口创建前调用，创建后不更新已有窗口 |
| 无 IPC | 纯进程内全局变量 |
| 无 Observer | 不改已有窗口 |
| 平台差异 | macOS/Windows 走 native window API；HarmonyOS 走 mission label |
| OHOS 原生 API | `UIAbilityContext.setMissionLabel()` 是唯一入口（无 NDK C API） |
| 桥接方式 | liblynxtron.so 导出 → liblynxtron_napi.so dlsym → 50ms SyncIme 轮询 |
| 扩展性 | 新 API 同步逻辑写入独立函数，在 `SyncIme` 入口加一行调用即可 |
