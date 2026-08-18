# frame-timings 帧率监控 HarmonyOS 适配文档

## 概述

`win.on('frame-timings')` 是 Lynxtron 暴露给 JS 的帧率监控接口：开启后每隔一个采样周期（默认 1000ms）推送一次该周期内每一帧的 `[startNs, finishNs]` 数据，JS 侧据此统计 FPS / 平均帧耗时 / 最大帧耗时。

现状：该功能在 Windows / macOS 上已经可用，但 **HarmonyOS（OHOS）上收不到数据**。原因是引擎层（clay）的帧时序监听者 `FrameTimingListener` 只在 Win/Mac 的 renderer 里注册，OHOS 使用的 windowless renderer 没有接这一环。

本次改动补齐两件事：

1. **OHOS 帧数据桥接**：在 windowless renderer 里注册 `FrameTimingListener`，把 clay 光栅化产出的帧耗时转发到 embedder 客户端。
2. **暴露 JS 开关**：把已存在的 `SetFpsMonitorEnabled` 通过 `BuildPrototype()` 暴露为 `win.setFrameTimingsEnabled(enabled, sampleIntervalMs?)`。

改动跨两个仓库：

| 仓库 | 作用 |
|---|---|
| `lynx/`（子仓库，引擎层） | clay 帧数据 → embedder 客户端的桥接 |
| `lynxtron-C`（壳层 + 包 + 测试 app） | JS 开关、TS 类型、测试代码 |

---

## 一、完整数据链路

```
clay Rasterizer::DoDraw 光栅化成功
  │
  ▼
InstrumentationService::OnFrameRasterized(timing)        // 引擎既有
  │  rasterizer.cc:279-282
  ▼
FrameTimingListenerImpl::OnFrameTiming(startNs, finishNs) // ★本次新增：OHOS 注册
  │  frame_timing_listener_impl.cc:12-17
  ▼
LynxViewClients::OnFrameTiming(startNs, finishNs)
  │  lynx_view_clients.cc:182-190
  ▼
CAPI on_frame_timing → lynx::pub::LynxViewClient::OnFrameTiming
  │  lynx_view_client.h:110-118
  ▼
LynxViewImpl::OnFrameTiming                             // 壳既有
  │  lynx_view_impl.cc:449-461（post 到 UI 线程）
  ▼
LynxWindow::OnFrameTiming                                // 壳既有
  │  api_lynx_window.cc:830-837（仅 enable_fps_monitor_ 时缓存）
  ▼
StartFpsMonitorTask → EmitFpsEvent                       // 壳既有
  │  api_lynx_window.cc:494-520
  ▼
emit('frame-timings', [ [startNs, finishNs], ... ])     // 壳既有
  │  api_lynx_window.cc:519
  ▼
JS: win.on('frame-timings', (event, timings) => ...)
  │
  ▼
统计 fps / avg / max → sendGlobalEvent('fps-stats', stats)
  │
  ▼
UI GlobalEventEmitter → 实时 FPS 面板
```

关键前置条件：clay 光栅化在 OHOS windowless（headless）模式下也会产出帧数据（`Rasterizer` 是同一套实现），只是没有监听者去接。

---

## 二、改动清单

### A. 引擎层 `lynx/` 子仓库（OHOS 帧数据桥，核心）

#### `platform/embedder/windowless/lynx_ui_renderer_windowless.h`

- 引入 `#include "platform/embedder/frame_timing_listener_impl.h"`
- 新增声明 `void AddClient(LynxViewClients* client) override;`
- 新增成员 `std::shared_ptr<FrameTimingListenerImpl> frame_timing_listener_;`

#### `platform/embedder/windowless/lynx_ui_renderer_windowless.cc`

1. 新增 include：`clay/common/service/service_manager.h`、`clay/shell/common/services/instrumentation_service.h`
2. 构造函数初始化列表追加 `frame_timing_listener_(std::make_shared<FrameTimingListenerImpl>())`
3. 构造函数内，拿到 `headless_engine_->GetServiceManager()` 后注册监听者：

```cpp
auto service_manager = headless_engine_->GetServiceManager();
if (service_manager) {
  clay::Puppet<clay::Owner::kPlatform, clay::InstrumentationService>
      instrumentation_service =
          service_manager->GetService<clay::InstrumentationService>();
  instrumentation_service.Act(
      [frame_timing_listener = frame_timing_listener_](auto& impl) {
        impl.AddFrameTimingListener(frame_timing_listener);
      });
}
```

4. 实现 `AddClient`，把 embedder 客户端接进监听者：

```cpp
void LynxUIRendererWindowless::AddClient(LynxViewClients* client) {
  frame_timing_listener_->AddClient(client);
}
```

5. 析构函数开头 `frame_timing_listener_->RemoveAllClients();`

作用：完全复刻 Win/Mac renderer（`lynx_ui_renderer_win.cc` / `LynxUIRenderer.mm`）的「订阅帧时序 + 转发给 `LynxViewClients`」桥接。

### B. 壳层 `lynxtron-C`（暴露 JS 开关 + 默认值）

#### `src/shell/api/api_lynx_window.h`

```cpp
void SetFpsMonitorEnabled(bool enabled,
                          std::optional<uint32_t> sample_interval_millis);
```

#### `src/shell/api/api_lynx_window.cc`

1. 实现改为默认 1000ms：

```cpp
void LynxWindow::SetFpsMonitorEnabled(
    bool enabled, std::optional<uint32_t> sample_interval_millis) {
  bool state_changed = enable_fps_monitor_ != enabled;
  enable_fps_monitor_ = enabled;
  sample_interval_millis_ = sample_interval_millis.value_or(1000);
  if (state_changed) {
    StartFpsMonitorTask();
  }
}
```

2. `BuildPrototype()` 暴露方法：

```cpp
.SetMethod("setFrameTimingsEnabled", &LynxWindow::SetFpsMonitorEnabled)
```

### C. TS 类型

#### `src/packages/lynxtron/apis/api/lynx-window.d.ts`

- 新增方法 `setFrameTimingsEnabled(enabled: boolean, sampleIntervalMs?: number): void;`
- 新增 `frame-timings` 事件的 `on/off/once/addListener/removeListener` 重载：

```ts
on(
  event: 'frame-timings',
  listener: (event: Event, timings: Array<[number, number]>) => void
): this;
```

### D. 测试 app

#### `src/packages/default_app/default_app.ts`

```ts
mainWindow.setFrameTimingsEnabled(true, 1000);
mainWindow.on('frame-timings', (_event: any, timings: Array<[number, number]>) => {
  if (!timings || timings.length === 0) return;
  const costsMs = timings.map(([start, finish]) => (finish - start) / 1e6);
  const stats = {
    fps: timings.length,                       // 采样周期 1s，帧数即 FPS
    avgFrameMs: Number((costsMs.reduce((a, b) => a + b, 0) / costsMs.length).toFixed(2)),
    maxFrameMs: Number(Math.max(...costsMs).toFixed(2)),
  };
  mainWindow!.sendGlobalEvent('fps-stats', stats);
});
```

#### `src/packages/default_app/app/index.tsx`

- 新增 `FpsStats` 接口、`fpsStats` 状态
- `useEffect` 监听 `GlobalEventEmitter` 的 `fps-stats`
- 顶部新增「实时 FPS」面板（FPS / 平均帧耗时 / 最大帧耗时）

#### `src/packages/default_app/app/index.css`

- 新增 `.fps-panel` / `.fps-metrics` / `.fps-metric` 等样式

---

## 三、关键点与注意事项

| 项 | 说明 |
|---|---|
| 改动主体在壳层 | `OnFrameTiming` / `EmitFpsEvent` / `emit('frame-timings')` 壳层逻辑原本就有，只差 JS 开关和 OHOS 桥接 |
| OHOS 专用缺口 | `AddFrameTimingListener` 原本只在 Win/Mac renderer 注册，OHOS 的 windowless renderer 没接，所以之前收不到帧数据 |
| 默认值坑 | 第二参从 `uint32_t` 改为 `std::optional<uint32_t>`，否则 `setFrameTimingsEnabled(true)` 少传参会直接抛 TypeError 而非回落 1000 |
| 事件签名 | `Emit("frame-timings", arg)` 会自动把 Event 对象作为第一个参数传给监听器（`event_emitter.h:32-44`），故监听器写 `(event, timings)` |
| 构建 | 无 BUILD.gn 改动：`frame_timing_listener_impl` 已在 `embedder` source_set，`windowless` 是其 dep，符号可链接；无需重跑 `gn gen`，直接 ninja 重编 |

---

## 四、验证方式

1. 编译壳层 + 引擎（harmony 目标）。
2. 运行 default_app，UI 顶部应出现「实时 FPS」面板，并每 1s 刷新一次 FPS / 平均帧耗时 / 最大帧耗时。
3. 主进程控制台会输出 `[FPS] fps=... avg=...ms max=...ms`。
4. 若面板一直显示 `--`，说明引擎层桥接未生效，优先排查 windowless renderer 的 `AddFrameTimingListener` 是否成功注册（`InstrumentationService` 是否拿到、`Act` 是否执行）。
