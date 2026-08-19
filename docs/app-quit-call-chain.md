# app.quit() 完整调用链路文档

## 概述

`app.quit()` 优雅关闭应用：触发事件链关闭所有窗口，最终退出进程。

HarmonyOS 特殊点：`LynxtronMain` 运行在 detached 线程，消息循环退出后线程结束但 ArkUI 进程仍在。bridge 通过 `napi_threadsafe_function` 把退出码投递回 ArkUI 主线程、调用 `terminateSelf()` 优雅终止。**不能用 `exit()`/`_exit()`**：OpenHarmony 的 `appspawn_server` 会拦截 app 进程的 `exit()` 并以 SIGABRT（"Unexpected call: exit"）中止进程。

---

## 完整调用链路

### 1. JS 层入口

**文件**: `src/lib/browser/api/app.ts:9-11`

```ts
const bindings = process._linkedBinding('lynxtron_binding_app');
const { app } = bindings;
```

**文件**: `src/lib/browser/init.ts:219-222` — 自动退出钩子:
```ts
app.on('window-all-closed', () => {
  if (app.listenerCount('window-all-closed') === 1) {
    app.quit();
  }
});
```

### 2. Native Binding 注册

**文件**: `src/shell/api/api_app.cc:1142`

```cpp
.SetMethod("quit", base::BindRepeating(&Application::Quit, application))
```

**文件**: `src/shell/common/node_bindings.cc:48` — 模块注册:
```cpp
V(lynxtron_binding_app)  // LYNXTRON_BROWSER_BINDINGS 宏
```

### 3. Application::Quit() — 核心逻辑

**文件**: `src/shell/app/application.cc:113-128`

```cpp
void Application::Quit() {
  if (is_quitting_) return;          // 重入保护
  is_quitting_ = HandleBeforeQuit(); // 触发 before-quit 事件
  if (!is_quitting_) return;         // JS preventDefault → 中止
  if (WindowList::IsEmpty()) {
    NotifyAndShutdown();
  } else {
    WindowList::CloseAllWindows();   // 逐个关闭窗口
  }
}
```

### 4. JS 事件链

| 事件 | 文件:行号 | 触发时机 | 可阻止? |
|------|-----------|----------|---------|
| `before-quit` | `api_app.cc:485-489` | Quit 开始时 | ✅ `preventDefault()` |
| `close` (per window) | `api_base_window.cc:115-119` | 每个窗口关闭前 | ✅ `preventDefault()` |
| `window-all-closed` | `api_app.cc:497-499` | 所有窗口关闭后 | ❌ |
| `will-quit` | `api_app.cc:491-495` | Shutdown 前 | ✅ `preventDefault()` |
| `quit` | `api_app.cc:501-508` | Shutdown 时 (含 exitCode) | ❌ |

### 5. 窗口关闭路径

**文件**: `src/shell/app/window_list.cc:84-95`

```cpp
void WindowList::CloseAllWindows() {
  for (auto& window : windows_) {
    if (!window->IsClosed())
      window->Close();  // → 平台实现
  }
}
```

**平台实现**:

| 平台 | 文件 | 行号 | 实现 |
|------|------|------|------|
| Windows | `native_window_win.cc` | 131-138 | `window_->Close()` (Win32) |
| macOS | `native_window_mac.mm` | - | `[NSWindow close]` |
| HarmonyOS | `native_window_harmony.cc` | 56-59 | `NotifyWindowCloseButtonClicked()` (模拟) |

### 6. 最终 Shutdown

**文件**: `src/shell/app/application.cc:276-289`

```cpp
void Application::NotifyAndShutdown() {
  if (is_shutdown_) return;
  bool prevent_default = false;
  for (auto& o : observers_) o->OnWillQuit(&prevent_default);
  if (prevent_default) {
    is_quitting_ = false;  // JS 阻止 → 恢复
    return;
  }
  Shutdown();
}
```

**文件**: `src/shell/app/application.cc:155-172`

```cpp
void Application::Shutdown() {
  if (is_shutdown_) return;
  is_shutdown_ = true;
  is_quitting_ = true;
  for (auto& o : observers_) o->OnQuit();
  RunQuitClosure();  // → run_loop->QuitWhenIdleClosure()
}
```

### 7. 消息循环退出

**文件**: `src/shell/app/application.cc:48-53`

```cpp
void Application::RunQuitClosure() {
  if (quit_main_message_loop_.is_null()) return;
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, std::move(quit_main_message_loop_));
}
```

消息循环退出 → `MainRunner::Run()` 返回 → `LynxtronMain()` 返回。

### 8. HarmonyOS 进程退出 [本次修改]

`app.quit()`/`app.exit()` 只是退出消息循环并让 `LynxtronMain` 正常返回，**不是杀进程**。HarmonyOS 上 `LynxtronMain` 运行在 detached 线程，返回后 ArkUI 主线程仍在运行，因此由 bridge 通过 `napi_threadsafe_function` 把退出码投递回 ArkUI 主线程，在那里调用 `terminateSelf()` 让框架走正常的 Ability 销毁流程（事件驱动，无轮询）。

> **为什么不能 `exit()`**：OpenHarmony 的 `appspawn_server` 会拦截 app 进程对 `exit()` 的调用并报 `SIGABRT`（"Unexpected call: exit(0)"）。electron_ohos 能靠 `main()` 返回退出，是因为它是 **native 应用**（`main()` 是进程入口）；lynxtron-C 是 **ArkTS 应用**（入口是 ArkTS 运行时，无开发者 `main()`），因此必须用框架的 `terminateSelf()`。

**文件**: `src/shell/app/lynxtron_napi_bridge.cc`

```cpp
napi_threadsafe_function g_exit_tsfn = nullptr;

std::call_once(started, [] {
    std::thread([] {
        int rc = g_lynxtron_main(3, argv);
        OH_LOG_INFO(LOG_APP, "LynxtronMain returned rc=%{public}d", rc);
        if (g_exit_tsfn) {                       // 不 exit()
          napi_call_threadsafe_function(g_exit_tsfn, &rc, napi_tsfn_blocking);
          napi_release_threadsafe_function(g_exit_tsfn, napi_tsfn_release);
        }
    }).detach();
});

// 在 ArkUI 主线程执行（threadsafe function 回调）
void ExitCallJS(napi_env env, napi_value, void*, void* data) {
  // 取 g_ability_context_ref 上的 terminateSelf 并调用
  napi_call_function(env, ability_ctx, terminate_self, 0, nullptr, nullptr);
}
```

`EnsureExitThreadsafeFunction()` 在 `SetAbilityContext` 里创建（绑定 ArkUI 主线程的 env）。`terminateSelf()` 触发框架的 `onWindowStageDestroy`/`onDestroy`，进程正常结束；只有系统 KILL/SIGTERM 信号（`main_parts_posix.cc`）才是“杀”进程。

### 9. app.quit() vs app.exit() 的区别

| | quit | exit |
|---|---|---|
| JS `before-quit` 事件 | ✅ | ❌ |
| 窗口 `close` 事件 | ✅ (逐个优雅关闭) | ❌ (`DestroyAllWindows` 强杀) |
| `will-quit` 事件 | ✅ | ❌ |
| 核心方法 | `application.cc:113` | `application.cc:130` |

### 10. HarmonyOS 信号处理

**文件**: `src/shell/app/main_parts.cc:248-251`

HarmonyOS 是 POSIX 系统，支持 SIGTERM/SIGINT/SIGHUP → `Application::Quit()`。

### 11. OHOS 系统侧退出 (ArkTS/Ability → 优雅退出) [本次修改]

参照 electron_ohos：系统侧（ArkTS/Ability）想退出应用时，走 `ExecuteCommandSingleton` 的 `kAppQuit` 命令 → `Browser::Get()->Quit()`，即同一条优雅退出路径，**没有 ForceStop/kill**。Lynxtron 用 NAPI bridge 的 `quit()` 等价实现：

**文件**: `src/shell/app/lynx_windowless_renderer_harmony.cc`

```cpp
void DispatchQuit() {
  if (auto* app = lynxtron::Application::Get()) app->Quit();
}

extern "C" __attribute__((visibility("default"))) void LynxtronQuit() {
  auto runner = lynxtron::GetUIThreadTaskRunner();
  if (runner) runner->PostTask(FROM_HERE, base::BindOnce(&DispatchQuit));
}
```

**文件**: `src/shell/app/lynxtron_napi_bridge.cc` — `quit()` NAPI `dlsym("LynxtronQuit")` 转发。

**文件**: `harmony_app/.../entryability/EntryAbility.ets`

```ts
onDestroy(): void {
  AppAdapter.getInstance().quit();  // → lynxtron.quit() → Application::Quit()
}
```

**文件**: `harmony_app/.../adapter/AppAdapter.ets`

```ts
quit(): void { lynxtron.quit(); }
```

随后 `LynxtronMain` 返回 → bridge 通过 threadsafe function 投递退出码 → ArkUI 主线程 `terminateSelf()`（见第 8 节），进程正常结束。

---

## 调用链路图

```
JS: app.quit()
  │
  ▼
C++: Application::Quit()                            [application.cc:113]
  ├─ is_quitting_? → return (重入保护)
  ├─ HandleBeforeQuit() → Emit("before-quit")       [api_app.cc:485]
  │    └─ preventDefault? → 中止 quit
  ├─ WindowList::IsEmpty()?
  │    YES → NotifyAndShutdown()
  │    NO  → WindowList::CloseAllWindows()           [window_list.cc:84]
  │           └─ 逐个 window->Close()
  │                ├─ [Win]  native_window_win.cc:131
  │                ├─ [Mac]  native_window_mac.mm
  │                └─ [OHOS] native_window_harmony.cc:56
  │                     NotifyWindowCloseButtonClicked()
  │                │
  │                └─ BaseWindow::WillCloseWindow()  [api_base_window.cc:115]
  │                     Emit("close") → preventDefault? → 中止
  │                │
  │                └─ WindowList::RemoveWindow()
  │                     └─ 空? → OnWindowAllClosed() → Emit("window-all-closed")
  │                           └─ is_quitting_? → NotifyAndShutdown()
  │
  ▼
NotifyAndShutdown()                                  [application.cc:276]
  ├─ OnWillQuit() → Emit("will-quit")               [api_app.cc:491]
  │    └─ preventDefault? → 恢复 is_quitting_=false
  └─ Shutdown()                                      [application.cc:155]
       ├─ is_shutdown_=true, is_quitting_=true
       ├─ OnQuit() → Emit("quit", exitCode)          [api_app.cc:501]
        └─ RunQuitClosure() → run_loop 退出
             └─ MainRunner::Run() 返回
                 └─ LynxtronMain() 返回
                       └─ [OHOS] bridge threadsafe function 投递退出码 → ArkUI 主线程 terminateSelf()
                             → 框架 onWindowStageDestroy/onDestroy → 进程正常结束
                       └─ [Other] main() 返回 → 进程结束
```

---

## HarmonyOS 特殊点总结

| 项 | 说明 |
|---|---|
| 主线程分离 | `LynxtronMain` 在 detach 线程运行，不阻塞 ArkUI 事件循环 |
| 进程退出 | `LynxtronMain` 返回后通过 threadsafe function 投递退出码，ArkUI 主线程 `terminateSelf()`（`exit()` 被 appspawn 拦截，禁止使用） |
| `Close()` | 调用 `NotifyWindowCloseButtonClicked()` 模拟窗口关闭 |
| 信号处理 | 支持 SIGTERM/SIGINT/SIGHUP |
| 零轮询 | 退出是事件驱动，不在 bridge 中检测 |
