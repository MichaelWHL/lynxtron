# app.setName HarmonyOS 适配方案记录

## 背景

Lynxtron 的 `app.setName` 在 macOS/Windows 上通过原生窗口标题栏显示名称。

## 核心改动（已实施，保留）

### 1. application_harmony.cc — 修复 fallback 链路

文件: `src/shell/app/application_harmony.cc`

将三个返回空字符串的桩实现改为调用 `application_info_harmony.cc` 中的函数：

| 方法 | 改前 | 改后 |
|---|---|---|
| `GetExecutableFileProductName()` | `return std::string()` | `return GetApplicationName()` |
| `GetExecutableFileVersion()` | `return std::string()` | `return GetApplicationVersion()` |
| `GetApplicationNameForProtocol()` | `return std::u16string()` | `return base::ASCIIToUTF16(GetApplicationName())` |

新增头文件: `base/strings/utf_string_conversions.h`, `shell/common/application_info.h`

### 2. application_info_harmony.cc — 名字 fallback

文件: `src/shell/common/application_info_harmony.cc`

已存在的实现，无需修改。链路为:

```
GetApplicationName()
  → OverriddenApplicationName()  (app.setName 设置的值)
  → "Lynxtron"                    (硬编码 fallback)
```

## 方案 B（已撤回）— C++ 标题同步到 OHOS 系统窗口

### 目标

将 C++ 侧设置的窗口标题（`SetTitle`）同步到 OHOS 系统窗口标题栏，让用户可见。

### 原理

- 主库 `liblynxtron.so` 导出 `LynxtronGetWindowTitle()` 返回当前标题
- NAPI bridge `liblynxtron_napi.so` 通过 dlsym 读取标题并调用 OHOS `mainWindow.setWindowTitle()`
- ETS 侧用 `setInterval` 轮询标题变化

### 文件变更（已撤回）

**native_window_harmony.cc**:
- 添加全局变量 `g_last_window_title`、`g_title_change_cb`
- 导出 `extern "C" LYNXTRON_EXPORT const char* LynxtronGetWindowTitle()`
- 导出 `extern "C" LYNXTRON_EXPORT void LynxtronRegisterTitleChangeCallback()`
- `SetTitle` 更新 `g_last_window_title` 并触发回调

**lynxtron_napi_bridge.cc**:
- 添加 `g_main_window_ref`、`g_main_window_env`、`g_last_synced_title`
- 添加 `PushTitleToOHOSWindow()` 辅助函数
- 添加 `SetMainWindow()` NAPI 函数（存窗口引用）
- 添加 `SyncWindowTitle()` NAPI 函数（推初始标题）
- 添加 `GetWindowTitle()` NAPI 函数（读取 C++ 标题）
- SyncIme 轮询中合并标题同步代码

**EntryAbility.ets**:
- loadContent 回调中调 `lynxtron.setMainWindow(mainWindow)` 保存窗口引用
- 使用 `setInterval` 轮询 `lynxtron.getWindowTitle()` 并设置到 `mainWindow.setWindowTitle()`

**Index.ets**:
- start() 后 setTimeout 调 `lynxtron.syncWindowTitle()`

### 遇到的关键问题

1. **符号可见性**: Chromium 默认 `-fvisibility=hidden`，`extern "C"` 导出的函数必须加 `__attribute__((visibility("default")))` 才能被 dlsym 找到。

2. **NAPI 跨函数调用**: 通过 `napi_create_reference` 保存窗口引用后，在另一个 NAPI 函数（SyncIme）中通过 `napi_get_reference_value` 调用 `setWindowTitle`，调用看似成功（napi_ok）但标题未更新。根因未最终定位，可能是 napi_env 失效或窗口对象状态问题。

3. **方案撤回到轮询**: 改为 ETS 侧直接轮询 `getWindowTitle()`，避免 napi_ref 跨函数使用。

### 替代方案（未实施，供参考）

如需要动态同步标题，可将 `mainWindow` 对象直接保存在 ETS 侧（Module/global 变量），轮询时直接调用 `setWindowTitle`，完全绕过 napi_ref。

## 编译命令

```bash
# 同步 gn（仅改文件内容不需要）
python3 lynxtron_tools/gn/gn.py --target-os=harmony --harmony-cpu=arm64

# 编译主库
buildtools/ninja/ninja -C out/harmony_arm64_Release/ lynxtron_app

# 编译 NAPI bridge
buildtools/ninja/ninja -C out/harmony_arm64_Release/ lynxtron_napi_bridge

# 编译 default_app
buildtools/ninja/ninja -C out/harmony_arm64_Release/ default_app_asar

# 部署
/home/zhuliangliang/src/lynxtron-C/harmony_app/stage_resources.sh none
```
