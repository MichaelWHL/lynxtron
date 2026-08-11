# HarmonyOS 窗口创建规约

## 目标

让 JS 层 `new BaseWindow(options)` 在 HarmonyOS 上真正创建出新窗口，并把 `lynxtronoss2` 的窗口构造参数自然映射到 HarmonyOS 的 Ability/Window 创建流程。所有参数通过 `options` 显式传递，不硬塞默认值。

## 架构

```
JS: new BaseWindow(options)
  → C++: BaseWindow::New → NativeWindow::Create → NativeWindowHarmony
  → C++: 解析 options → HarmonyWindowCreationOptions
  → C++: LynxtronCreateHarmonyWindow(window_id, options)
  → NAPI: 构造 NAPI 对象 → ArkTS AppWindowAdapter.createWindowFromCpp(options)
  → ArkTS: startAbility(want, startOptions)
  → 系统: 创建 Ability/Window
  → ArkTS: BaseWindowAbility.onWindowStageCreate
  → ArkTS: lynxtron.setWindowIdForWindow(cppWindowId, originWindowId)
  → C++: LynxtronOnHarmonyWindowCreated → 绑定 harmony_window_id_
```

## 支持的平台能力

### 已支持窗口类型

| type | Ability | 说明 |
|---|---|---|
| `"main"` | `WindowAbility` | 普通主窗口 |
| `"float"` | `FloatWindowAbility` | 浮动窗口（Phase 1 复用主窗口逻辑，类型已区分） |

### 已支持 options

| option | 映射 |
|---|---|
| `x`, `y`, `width`, `height` | `StartOptions.windowLeft/Top/Width/Height` |
| `show` | `StartupVisibility.STARTUP_SHOW/HIDE` |
| `title` | `window.Window.setWindowTitle()` |
| `minimizable`, `maximizable`, `closable` | `setWindowTitleButtonVisible()` |
| `resizable` | `setResizeByDragEnabled()` |
| `movable` | `setWindowTitleMoveEnabled()` |
| `alwaysOnTop` | `setWindowTopmost()` |
| `parent` | 解析为 `parentHarmonyWindowId`（sub 类型后续使用） |

### 暂不支持的参数

`frame`, `thickFrame`, `transparent`, `skipTaskbar`, `visibleOnAllWorkspaces`, `hasShadow`, `progressBar`, `webPreferences`, `test_bench_replay`, `enable_napi_addon`。

## 关闭语义

`win.close()` 触发完整 Electron 关闭流程：
1. 触发 `close` 事件。
2. 若 `event.preventDefault()` 被调用，停止关闭。
3. 否则调用 `CloseImmediately()` 通知 ArkTS `terminateSelf()`，并触发 `closed` 事件。

## 多窗口状态联动

- C++ 通过 `InvokeWindowOp` 下发 `minimize/maximize/restore/show/focus/close/setAlwaysOnTop/enter-full-screen/leave-full-screen`。
- ArkTS 通过 `notifyWindowState` 上报 `foreground/background/minimize/restore/maximize/enter-full-screen/leave-full-screen/show/hide/resized/closed`。
- 状态变化会触发对应的 JS 事件（`minimize`, `restore`, `maximize`, `enter-full-screen`, `leave-full-screen`, `show`, `hide`, `resized`, `focus`, `blur`, `always-on-top-changed` 等）。
- `close` 事件仅在 CPP 发起关闭时触发（可 `preventDefault`）；手动关闭触发 `closed` 事件。

## 关键文件

- `src/shell/app/native_window_harmony.cc`
- `src/shell/app/window_creation_bridge_harmony.h`
- `src/shell/app/window_creation_bridge_harmony.cc`
- `src/shell/app/lynxtron_napi_bridge.cc`
- `harmony_app/entry/src/main/ets/adapter/AppWindowAdapter.ets`
- `harmony_app/entry/src/main/ets/ability/BaseWindowAbility.ets`
- `harmony_app/entry/src/main/ets/window/FloatWindowAbility.ets`
- `harmony_app/entry/src/main/ets/application/AbilityStage.ets`
- `harmony_app/entry/src/main/module.json5`
