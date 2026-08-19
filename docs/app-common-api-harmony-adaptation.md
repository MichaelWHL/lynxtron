# app 常用 API OHOS 鸿蒙化适配

适配情况、调用链路与改动说明：

- `app.getPath()`
- `app.isPackaged`
- `app.setAsDefaultProtocolClient()`
- `app.commandLine.appendSwitch()`
- `app.on("window-all-closed")`

---

## 一、适配状态总览

| API                            | 鸿蒙适配状态 | 说明                                                         |
| ------------------------------ | ------------ | ------------------------------------------------------------ |
| `app.getPath()`                | ✅ 已适配    | `DIR_APP_DATA` 走 env var → probing 兜底，其余派生            |
| `app.isPackaged`               | ✅ 已适配    | OHOS 无 unpackaged 开发场景，恒返回 `true`                    |
| `app.setAsDefaultProtocolClient()` | ⚠️ 暂未适配 | 当前为 stub 返回 `false`，需靠 `module.json5` 的 `skills`/`scheme` 声明实现 Deep Link |
| `app.commandLine.appendSwitch()` | ✅ 无需适配  | 平台无关，直接操作 `base::CommandLine::ForCurrentProcess()`   |
| `app.on("window-all-closed")`  | ✅ 已适配    | 事件链跨平台复用，OHOS 窗口 `Close()` 模拟关闭按钮触发链路    |

---

## 二、app.getPath()

### 2.1 调用链路

```
JS: app.getPath(name)
  → src/lib/browser/api/app.ts:9   (lynxtron_binding_app)
  → App::GetPath                   src/shell/api/api_app.cc:667-677
  → GetPathConstant(name)          src/shell/api/api_app.cc:331-377   (字符串→枚举)
  → base::PathService::Get(key)    (注册入口 main_parts.cc:161 / node_main.cc:77)
  → PathProvider()                 src/shell/common/path_provider.cc:105-270
       ├─ DIR_APP_DATA:  OHOS env var优先 → probing兜底  (line 154-178) ← 核心适配
       ├─ DIR_USER_DATA: DIR_APP_DATA/{appName}          (line 109-116) ← 自动派生
       ├─ DIR_USER_CACHE: DIR_APP_DATA/{appName}         (line 131-153) ← 本次适配
       ├─ DIR_APP_LOGS:  DIR_USER_DATA/logs              (line 186-202) ← 自动派生
       └─ DIR_APP_DICTIONARIES: DIR_USER_DATA/Dictionaries (line 123-130)
```

### 2.2 核心问题

OHOS 上 `OS_LINUX` 为 true（`build_config.h` 将 `__OHOS__` 视为 `OS_LINUX` 的 sibling），原 `path_provider.cc` 会走 `base::nix::GetXDGDirectory`，解析到 `~/.config`，在 OHOS 沙箱内不正确。

### 2.3 解决方案：双保险

```
优先路径: ETS context.filesDir ──→ setenv("LYNXTRON_FILES_DIR") → getenv → 直接用
兜底路径: (env var 为空时) probing el2/base/files / el1/base/files
```

只需改 `DIR_APP_DATA` 一个 key，`DIR_USER_DATA` / `DIR_APP_LOGS` / `DIR_APP_DICTIONARIES` 均从其派生：

```
DIR_APP_DATA         → /data/storage/el2/base/files
DIR_USER_DATA        → {DIR_APP_DATA}/{appName}            ← 自动派生
DIR_APP_LOGS         → {DIR_USER_DATA}/logs                 ← 自动派生
DIR_APP_DICTIONARIES → {DIR_USER_DATA}/Dictionaries        ← 自动派生
DIR_USER_CACHE       → {DIR_APP_DATA}/{appName}            ← 单独适配（原走 XDG）
```

### 2.4 改动文件

| 文件 | 行号 | 改动 | 意图 |
|------|------|------|------|
| `src/shell/common/path_provider.cc` | 16-18 | 新增 `#include <stdlib.h>` | 提供 `getenv` |
| `src/shell/common/path_provider.cc` | 132-133 | `DIR_USER_CACHE` 新增 `IS_HARMONY` 分支，parent → `DIR_APP_DATA` | 避免走 XDG |
| `src/shell/common/path_provider.cc` | 154-178 | `DIR_APP_DATA` 新增 `IS_HARMONY` 分支（优先级高于 `OS_LINUX`） | env var → probing 兜底 |
| `src/shell/app/lynxtron_napi_bridge.cc` | 647-658 | `SetAbilityContext` 提取 `filesDir` → `setenv` | ETS → C++ 路径透传 |

> 详细文档见 `docs/app-getPath-harmony-adaptation.md`

---

## 三、app.isPackaged

### 3.1 调用链路

```
JS: app.isPackaged                    (只读属性)
  → src/packages/lynxtron/apis/api/app.d.ts:1823   (readonly isPackaged: boolean)
  → .SetProperty("isPackaged", &App::IsPackaged)   src/shell/api/api_app.cc:1153
  → App::IsPackaged()                src/shell/api/api_app.cc:642-665
```

### 3.2 适配逻辑

```cpp
// src/shell/api/api_app.cc:642-665
bool App::IsPackaged() {
  auto env = base::Environment::Create();
  if (env->HasVar("ELECTRON_FORCE_IS_PACKAGED")) {
    return true;
  }

#if BUILDFLAG(IS_HARMONY)
  // On HarmonyOS, apps are always developed on Windows/Mac and packaged before
  // running on device. There is no "unpackaged" development scenario on OHOS,
  // so we always treat the app as packaged.
  return true;
#else
  // 其余平台通过 exe 名称判断 (lynxtron.exe / lynxtron)
  ...
#endif  // BUILDFLAG(IS_HARMONY)
}
```

### 3.3 设计说明

- 其他平台通过**可执行文件名**判断是否 unpackaged（`lynxtron` / `lynxtron.exe`）。
- OHOS 无本地开发/unpackaged 场景，应用一定是从 Windows/Mac 打包后部署到设备，因此恒返回 `true`。
- `ELECTRON_FORCE_IS_PACKAGED` 环境变量在所有平台生效，用于调试强制视为 packaged。

### 3.4 影响范围

`isPackaged` 在 `node_bindings.cc:261` 被用于限制 packaged 应用中的 `NODE_OPTIONS` 白名单，OHOS 上 `isPackaged == true` 会收紧 NODE_OPTIONS，符合预期。

---

## 四、app.setAsDefaultProtocolClient()

### 4.1 调用链路

```
JS: app.setAsDefaultProtocolClient(protocol, [path, args])
  → .SetMethod("setAsDefaultProtocolClient", ...)     src/shell/api/api_app.cc:1165-1167
  → Application::SetAsDefaultProtocolClient()          src/shell/app/application_harmony.cc:50-53 (stub)
  → return false
```

### 4.2 当前状态：stub 未实现

```cpp
// src/shell/app/application_harmony.cc:50-53
bool Application::SetAsDefaultProtocolClient(const std::string& protocol,
                                             gin::Arguments* args) {
  return false;
}
```

同文件还包含 `RemoveAsDefaultProtocolClient`（line 45-48）与 `IsDefaultProtocolClient`（line 55-58），均为返回 `false` 的 stub。

### 4.3 OHOS 正确的实现方式：Deep Link

Electron 通过写注册表（Win）/ Info.plist（Mac）注册协议。OHOS 没有注册表/Info.plist，协议注册改为**在 `module.json5` 声明 `skills` → `uris` → `scheme`**，由系统负责路由。

当前已配置（`harmony_app/entry/src/main/module.json5:35-48`）：

```json5
"skills": [
  {
    "entities": ["entity.system.home"],
    "actions": ["action.system.home"],
    "uris": [
      { "scheme": "lynxtron" }
    ]
  }
]
```

### 4.4 适配建议（未实施）

| 项 | 说明 |
|----|------|
| 注册协议 | 在 `module.json5` 静态声明 `scheme`（如 `retouchpro`），无需运行时调用 |
| 运行时 | `setAsDefaultProtocolClient` 可改为校验 `module.json5` 声明的 scheme 是否匹配，返回 `true`/`false` |
| 接收请求 | 已通过 `onNewWant` → `handleWantUri` → `open-url` 事件完成（见 `docs/open-url-open-file-call-chain.md`） |
| `isDefaultProtocolClient` | 可改为读取 AbilityInfo 判断 scheme 是否声明 |

> 注意：`scheme` 必须符合 OHOS 命名规则；Deep Link 的 scheme 在打包时已固化，运行时无法像 Electron 那样动态注册。

---

## 五、app.commandLine.appendSwitch()

### 5.1 调用链路

```
JS: app.commandLine.appendSwitch(theSwitch, value?)
  → src/lib/browser/api/app.ts:33-47   Object.assign 挂载 commandLine 对象
      appendSwitch → commandLine.appendSwitch(String(theSwitch), value?)
  → process._linkedBinding('lynxtron_binding_command_line')   app.ts:10
  → api_command_line.cc:32-43  AppendSwitch()
  → base::CommandLine::ForCurrentProcess()->AppendSwitch(Native)
```

### 5.2 实现（平台无关，无需适配）

```cpp
// src/shell/api/api_command_line.cc:32-43
void AppendSwitch(const std::string& switch_string,
                  gin_helper::Arguments* args) {
  auto switch_str = base::ToLowerASCII(switch_string);
  auto* command_line = base::CommandLine::ForCurrentProcess();

  base::CommandLine::StringType value;
  if (args->GetNext(&value)) {
    command_line->AppendSwitchNative(switch_str, value);
  } else {
    command_line->AppendSwitch(switch_str);
  }
}
```

### 5.3 暴露方式

`api_command_line.cc` 通过 `NODE_LINKED_BINDING_CONTEXT_AWARE(lynxtron_binding_command_line, ...)` 独立注册（`node_bindings.cc:56` 的 `V(lynxtron_binding_command_line)`），在 `app.ts:33-47` 被 `Object.assign` 到 `app.commandLine` 上，与 `App` 绑定解耦。

### 5.4 为何无需适配

- 所有逻辑只依赖 `base::CommandLine`，不涉及平台文件/注册表/系统窗口。
- OHOS 上 `base::CommandLine` 由 `LynxtronCommandLine::Init`（`lynxtron_command_line.cc:24`）从 `library_main.cc:143/152` 初始化 argv，与 Linux/POSIX 路径一致。
- `appendSwitch` / `hasSwitch` / `getSwitchValue` / `removeSwitch` / `appendArgument` 全部开箱即用。

---

## 六、app.on("window-all-closed")

### 6.1 调用链路

```
JS: app.on('window-all-closed', listener)
  → 事件注册：App 继承 gin_helper::EventEmitter
  → 最后一个窗口被移除时触发

窗口关闭 → 所有窗口关闭后的通知链路：
  NativeWindowHarmony::Close()             src/shell/app/native_window_harmony.cc:56-59
    → NotifyWindowCloseButtonClicked()
    → BaseWindow::WillCloseWindow()        (emit 'close'，可 preventDefault)
    → WindowList::RemoveWindow(this)       src/shell/app/window_list.cc:59-66
        └─ windows_.empty() 时:
            Notify(&WindowListObserver::OnWindowAllClosed)
            → Application::OnWindowAllClosed()   src/shell/app/application.cc:305-313
                ├─ is_exiting_   → Shutdown()
                ├─ is_quitting_  → NotifyAndShutdown()
                └─ 否则           → observers_.Notify(OnWindowAllClosed)
                                    → App::OnWindowAllClosed()  api_app.cc:497-499
                                      → Emit("window-all-closed")
```

### 6.2 OHOS 特殊点

| 项 | 说明 |
|----|------|
| 窗口关闭模拟 | OHOS 无原生窗口关闭按钮，`NativeWindowHarmony::Close()`（`native_window_harmony.cc:56-59`）直接调用 `NotifyWindowCloseButtonClicked()` 模拟用户点击关闭 |
| 事件链复用 | `WindowList::RemoveWindow` → `Application::OnWindowAllClosed` → `App::OnWindowAllClosed` 全平台共享，OHOS 无需单独改 |
| 默认退出行为 | `init.ts:219-222` 注册默认钩子：若无业务监听 `window-all-closed`，自动 `app.quit()` |

### 6.3 与 app.quit() 的关系

`window-all-closed` 是 `app.quit()` 关闭流程的中间环节（详见 `docs/app-quit-call-chain.md`）：

```
app.quit()
  → before-quit → CloseAllWindows() → 每窗口 close
  → WindowList 变空 → window-all-closed → will-quit → quit → 进程退出
```

- 主动 `app.quit()`：`is_quitting_ = true`，`window-all-closed` 后直接 `NotifyAndShutdown()`。
- 用户手动关窗（无 quit）：`is_quitting_ = false`，`window-all-closed` 事件触发后，由 JS 层决定是否 `app.quit()`（`default_app.ts:39-43` 即在事件里显式调用 `app.quit()`）。

---

## 七、关键文件索引

| 文件 | 行号 | 作用 |
|------|------|------|
| `src/shell/api/api_app.cc` | 642-665 | `IsPackaged()`，OHOS 恒返回 `true` |
| `src/shell/api/api_app.cc` | 667-693 | `GetPath()` / `SetPath()` 实现 |
| `src/shell/api/api_app.cc` | 331-377 | `GetPathConstant()` 字符串→枚举 |
| `src/shell/api/api_app.cc` | 497-499 | `OnWindowAllClosed()` → Emit |
| `src/shell/api/api_app.cc` | 1153 | 暴露 `isPackaged` 属性 |
| `src/shell/api/api_app.cc` | 1165-1167 | 暴露 `setAsDefaultProtocolClient` |
| `src/shell/common/path_provider.cc` | 154-178 | `DIR_APP_DATA` OHOS env var → probing |
| `src/shell/common/path_provider.cc` | 132-133 | `DIR_USER_CACHE` parent → `DIR_APP_DATA` |
| `src/shell/app/lynxtron_napi_bridge.cc` | 647-658 | `SetAbilityContext` 提取 `filesDir` |
| `src/shell/api/api_command_line.cc` | 32-43 | `AppendSwitch()`（平台无关） |
| `src/lib/browser/api/app.ts` | 10, 33-47 | `commandLine` 绑定挂载到 `app` |
| `src/shell/common/lynxtron_command_line.cc` | 24-31 | argv 初始化（OHOS 走 POSIX 路径） |
| `src/shell/app/application_harmony.cc` | 45-58 | `Set/Remove/IsDefaultProtocolClient` stub |
| `src/shell/app/application.cc` | 305-313 | `OnWindowAllClosed()` 分发 |
| `src/shell/app/window_list.cc` | 59-66 | 窗口清空 → 通知 `OnWindowAllClosed` |
| `src/shell/app/native_window_harmony.cc` | 56-64 | `Close()` 模拟关闭按钮 |
| `src/lib/browser/init.ts` | 219-222 | 默认 window-all-closed → quit 钩子 |
| `harmony_app/entry/src/main/module.json5` | 35-48 | Deep Link `scheme` 声明（`lynxtron`） |
