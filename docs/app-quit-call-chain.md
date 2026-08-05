# app.quit() 完整调用链路文档

## 概述

`app.quit()` 优雅关闭应用：触发事件链关闭所有窗口，最终退出进程。

HarmonyOS 特殊点：`LynxtronMain` 运行在 detached 线程，消息循环退出后线程结束但 ArkUI 进程仍在。通过在返回后 `_exit()` 直接终止进程解决。

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

**文件**: `src/shell/app/lynxtron_napi_bridge.cc:99-108`

```cpp
std::call_once(started, [] {
    std::thread([] {
        static char argv0[] = "lynxtron";
        char* argv[] = {argv0, nullptr};
        int rc = g_lynxtron_main(1, argv);
        OH_LOG_INFO(LOG_APP, "LynxtronMain returned rc=%{public}d", rc);
        _exit(rc);  // HarmonyOS: 后 台线程返回 → 终止进程
    }).detach();
});
```

HarmonyOS 上 `LynxtronMain` 在 detach 线程中运行。其他平台 `main()` 返回后进程自然退出，但 OHOS 的 ArkUI 主线程仍在运行，需要通过 `_exit()` 显式终止。

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
                      └─ [OHOS] _exit(rc) → 进程结束   [lynxtron_napi_bridge.cc:107]
                      └─ [Other] main() 返回 → 进程结束
```

---

## HarmonyOS 特殊点总结

| 项 | 说明 |
|---|---|
| 主线程分离 | `LynxtronMain` 在 detach 线程运行，不阻塞 ArkUI 事件循环 |
| 进程退出 | `_exit(rc)` 在 `LynxtronMain` 返回后显式终止 |
| `Close()` | 调用 `NotifyWindowCloseButtonClicked()` 模拟窗口关闭 |
| 信号处理 | 支持 SIGTERM/SIGINT/SIGHUP |
| 零轮询 | 退出是事件驱动，不在 bridge 中检测 |
