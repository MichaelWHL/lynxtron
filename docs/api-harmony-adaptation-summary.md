# Lynxtron API OHOS 鸿蒙化适配总结

## 一、适配背景与场景

已适配的 API 及适用场景：


| API                              | 场景                              | 鸿蒙现状                                               |
| -------------------------------- | --------------------------------- | ------------------------------------------------------ |
| `app.setName/getName`            | 设置/获取应用名称                 | ✅ 已适配                                              |
| `app.getPath/setPath`            | 获取/覆盖应用数据、日志、缓存路径 | ✅ 适配中                                              |
| `app.quit`                       | 关闭应用                          | ✅ 已适配                                              |
| `app.on("open-url")`             | 接收外部 URL 启动请求             | ✅ 已适配                                              |
| `app.on("open-file")`            | 接收外部文件打开请求              | ✅ 已适配                                              |
| `app.whenReady`                  | app在Ready后加载mainWindow       | 无需适配                                               |
| `app.setAsDefaultProtocoiClient` | 注册自定义协议 retouchpro://      | 鸿蒙的Deep Link 需要根据规则设置 scheme 。暂不支持适配 |
| `app.requestSingleInstanceLock`  | 确保单例运行                      | electron鸿蒙中该api不支持                              |

---

## 二、测试用例

测试代码写在 `src/packages/default_app/default_app.ts` (`loadFile` 函数)，按以下分区执行：

```
=====================================================
-------------- app.whenReady 运行测试--------------
-------------- app.getName--------------
-------------- App.getPath() OHOS测试--------------
  获取来源: ETS context.filesDir 或 探测兜底
  appData/userData/logs/userCache/crashDumps → 路径/ERROR
-------------- 派生关系验证--------------
  userData = appData + appName  ?  ✅/❌
  logs = userData + "logs"     ?  ✅/❌
-------------- 平台专属路径 (预期ERROR) --------------
  documents/downloads/music/pictures/videos/recent → ERROR (预期)
-----------------完-----------------
=====================================================
-------------- open-file/open-url 事件监听-------------- (触发式,日志在运行时)
-------------- before-quit/window-all-closed 事件---------------
```

覆盖的测试维度：

- ✅ 路径获取正确性（含来源追溯）
- ✅ 路径派生关系验证（appData → userData → logs）
- ✅ 不可用路径的正确报错
- ✅ 事件监听链路（open-url/open-file/quit）
- ✅ 运行时方法调用（getName）

---

## 三、鸿蒙平台测试结果

### 3.1 app.getPath() — 路径解析


| name                                               | 鸿蒙结果                       | 来源                                            |
| -------------------------------------------------- | ------------------------------ | ----------------------------------------------- |
| `appData`                                          | `/data/storage/el2/base/files` | ETS context.filesDir 传参（优先）/ probing 兜底 |
| `userData`                                         | `{appData}/{appName}`          | 从 appData 自动派生 ✅                          |
| `logs`                                             | `{userData}/logs`              | 从 userData 自动派生 ✅                         |
| `userCache`                                        | `{appData}/{appName}`          | 从 appData 派生（本次适配）                     |
| `home`                                             | 系统 HOME 目录                 | base::DIR_HOME                                  |
| `temp`                                             | 系统临时目录                   | base::DIR_TEMP                                  |
| `documents/downloads/music/pictures/videos/recent` | ERROR                          | 平台专属，预期 fail                             |
| `crashDumps`                                       | ERROR                          | crashpad 未接入，代码已注释                     |

派生关系验证：✅ userData = appData + appName，✅ logs = userData + "logs"

### 3.2 app.setName/getName — 应用名称


| 场景                                   | 鸿蒙结果                            |
| -------------------------------------- | ----------------------------------- |
| `app.setName("XXX")` + `app.getName()` | 返回 "XXX" ✅                       |
| 未调 setName，`app.getName()`          | fallback → "Lynxtron" ✅           |
| 窗口标题（mission label）              | 通过 SyncIme 50ms 轮询同步到系统 ✅ |

### 3.3 app.quit() — 退出


| 事件                | 鸿蒙结果                                     |
| ------------------- | -------------------------------------------- |
| `before-quit`       | ✅ 触发，支持 preventDefault                 |
| `window-all-closed` | ✅ 触发                                      |
| 进程退出            | ✅`LynxtronMain` 返回后经 threadsafe function 投递退出码，ArkUI 主线程 `terminateSelf()`（`exit()` 被 appspawn 拦截，禁止） |

### 3.4 open-url / open-file — 外部调用


| 场景                             | 鸿蒙结果                               |
| -------------------------------- | -------------------------------------- |
| 冷启动（onCreate 携带 Want URI） | ✅ 暂存 pending 队列，主循环就绪后刷入 |
| 热启动（onNewWant 接收新 Want）  | ✅ PostTask 到 UI 线程直接分发         |
| JS 监听`open-url`                | ✅ 正常触发                            |
| JS 监听`open-file`               | ✅ 正常触发，支持 preventDefault       |

---

## 四、鸿蒙化适配思路

### 4.1 总体设计原则

1. **最小侵入**：全平台共享的逻辑不动（`application.cc` / `api_app.cc`），鸿蒙差异用 `#if BUILDFLAG(IS_HARMONY)` 在平台胶水层解决
2. **派生关系复用**：只需改 `DIR_APP_DATA` 的鸿蒙行为，`userData/logs/dictionaries` 自动正确
3. **外部信息最小化**：从 ETS 侧传入必要平台上下文（filesDir / AbilityContext），不引入外部适配器库
4. **兜底不崩**：每个关键路径都有 fallback（env var 缺失 → probing；API 不可用 → throw Error）

### 4.2 各 API 适配思路与修改说明

#### (1) app.getPath — 路径解析

**核心思路**：`DIR_APP_DATA` 是根，其余全派生。鸿蒙只需改这一个 key。

**修改文件与意图**：


| 文件                              | 改动                                                                    | 意图                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `path_provider.cc:16-18`          | 新增`#include <stdlib.h>` (IS_HARMONY)                                  | 提供`getenv`                                                                                        |
| `path_provider.cc:132-133`        | `DIR_USER_CACHE` 新增 `IS_HARMONY` 分支，父 key 改为 `DIR_APP_DATA`     | OHOS 上`base::DIR_CACHE` 走 XDG 会失败，改为从 appData 派生                                         |
| `path_provider.cc:154-178`        | `DIR_APP_DATA` 新增 `IS_HARMONY` 分支（优先级高于 `OS_LINUX`）          | OHOS 上`OS_LINUX` 为 true，`#elif` 会走 XDG。用 `#if IS_HARMONY` 劫持，env var 优先 → probing 兜底 |
| `lynxtron_napi_bridge.cc:647-658` | `SetAbilityContext` 中提取 `filesDir` → `setenv("LYNXTRON_FILES_DIR")` | 从 ETS 层传沙箱路径到 native 层，确保在不同 App 中路径正确                                          |

**数据流**：

```
EntryAbility.ets                    NAPI bridge                       path_provider.cc
─────────────────                   ────────────                      ─────────────────
this.context.filesDir  ──────────→  SetAbilityContext()                getenv("LYNXTRON_FILES_DIR")
  "el2/base/files"                   setenv("LYNXTRON_FILES_DIR")       → DIR_APP_DATA
                                                                       → NULL? probing 兜底
```

#### (2) app.setName — 应用名称同步

**核心思路**：`Application::SetName()` 写入全局变量 → `SyncWindowTitle()` 通过 dlsym + napi_ref 调用 OHOS `setMissionLabel`

**修改文件与意图**：


| 文件                                                | 改动                                                                                    | 意图                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `application_harmony.cc:82-84`                      | `GetExecutableFileProductName()` → 调用 `GetApplicationName()` 而非返回空字符串        | 修复`GetName()` 的 fallback 链路                  |
| `native_window_harmony.cc:17-19, 144-147, 227-230`  | 全局`g_harmony_window_title` + `SetTitle()` 同步 + 导出 `LynxtronGetWindowTitle()`      | C++ 标题写入全局，供 bridge dlsym 读取            |
| `lynxtron_napi_bridge.cc:144-149, 371-372, 636-697` | `GetTitleFn` + `g_ability_context_ref` + `SyncWindowTitle()` dlsym → `setMissionLabel` | 跨 .so 读取标题并调 OHOS 原生 API                 |
| `EntryAbility.ets:43-44`                            | 存储`abilityContext` → `lynxtron.setAbilityContext(this.context)`                      | 传递 Context 到 NAPI 层，供`setMissionLabel` 使用 |

#### (3) app.quit — 优雅退出

**核心思路**：全平台逻辑复用（`Application::Quit()` → 事件链 → shutdown）。`app.quit()` 只是退出消息循环并让 `LynxtronMain` 正常返回，**不是杀进程**。鸿蒙特殊点：`LynxtronMain` 在 detach 线程运行，返回后 ArkUI 进程仍在，故由 bridge 通过 `napi_threadsafe_function` 投递退出码到 ArkUI 主线程、调用 `terminateSelf()` 优雅终止（事件驱动，无轮询）。

> **为什么不能 `exit()`**：OpenHarmony 的 `appspawn_server` 会拦截 app 进程的 `exit()` 并报 `SIGABRT`（"Unexpected call: exit(0)"）。electron_ohos 是 native 应用（`main()` 是进程入口，返回即退出）；lynxtron-C 是 ArkTS 应用（入口是 ArkTS 运行时），必须用框架的 `terminateSelf()`。

**修改说明**：

- `lynxtron_napi_bridge.cc`：`LynxtronMain` 返回后 `napi_call_threadsafe_function(g_exit_tsfn, &rc, napi_tsfn_blocking)`（**不调用 `exit()`/`_exit()`**）；`ExitCallJS` 回调在 ArkUI 主线程调 `terminateSelf()`；`SetAbilityContext` 里 `EnsureExitThreadsafeFunction()` 创建 tsfn
- 系统侧退出（参照 electron_ohos 的 `kAppQuit` 命令）：`lynx_windowless_renderer_harmony.cc` 导出 `LynxtronQuit()` → `Application::Quit()`；bridge 新增 `quit()` NAPI；`EntryAbility.onDestroy` → `AppAdapter.quit()` 走同一优雅路径，无 ForceStop/kill
- 鸿蒙窗口关闭：`native_window_harmony.cc` 的 `Close()` 调用 `NotifyWindowCloseButtonClicked()` 模拟
- 信号处理：POSIX 路径（SIGTERM/SIGINT/SIGHUP → `Application::Quit()`）鸿蒙自动继承

#### (4) open-url / open-file — 外部调用

**核心思路**：ETS `onCreate`/`onNewWant` → NAPI bridge 跨 .so 调用 → native 层的 `LynxtronHandleOpenURL/OpenPath` → pending 队列（冷启动）/ PostTask（热启动） → `Application::OpenURL/OpenFile` → Emit 到 JS

**修改文件与意图**：


| 文件                                          | 改动                                                                               | 意图                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| `EntryAbility.ets:27-48`                      | `onCreate`/`onNewWant` 中 `handleWantUri(want)` 统一入口                           | 冷/热启动统一处理 Want URI              |
| `EntryAbility.ets:51-62`                      | `handleWantUri` 按 URI 前缀分发 `openURL` / `openNewWindow`                        | file:/// → open-file，其他 → open-url |
| `AppAdapter.ets:24-32`                        | `openURL()` / `openNewWindow()` 调用 NAPI bridge                                   | ETS 适配器统一管理调用                  |
| `lynxtron_napi_bridge.cc:652-711`             | `OpenUrl` / `OpenPath` NAPI 函数，`EnsureLynxtronLoaded()` + dlsym 跨 .so 调用     | 冷启动时主动 dlopen liblynxtron.so      |
| `lynx_windowless_renderer_harmony.cc:138-178` | `LynxtronHandleOpenURL`/`OpenPath` + pending 队列 + `LynxtronFlushPendingOpenURLs` | 线程跳转 + 冷启动延迟投递               |
| `main_parts.cc:244-252`                       | `PreMainMessageLoopRun` 后 `LynxtronFlushPendingOpenURLs()`                        | 主循环就绪后刷入 pending 队列           |
| `api_app.cc:743-752`                          | `HasSingleInstanceLock` / `RequestSingleInstanceLock` 鸿蒙直接 return true         | OHOS launchType singleton 已管理单实例  |

### 4.3 app.getPath 适配细节（本次新增）

**问题**：OHOS 上 `OS_LINUX` 为 true，`path_provider.cc` 误走 `base::nix::GetXDGDirectory`（`~/.config`），导致 `DIR_APP_DATA` 解析到错误路径。

**解决方案**：

1. `path_provider.cc` 中在 `#if defined(OS_LINUX)` 前插入 `#if BUILDFLAG(IS_HARMONY)` 劫持
2. ETS 层通过 `context.filesDir` 传入精确路径 → `lynxtron_napi_bridge.cc` setenv → `path_provider.cc` getenv 优先读取
3. env var 未设置时 probing `el2/base/files` / `el1/base/files` 兜底
4. `DIR_USER_DATA/DIR_APP_LOGS/DIR_APP_DICTIONARIES` 从 `DIR_APP_DATA` 自动派生，无需逐个适配

**跨 App 兼容性**：不管哪个 App 集成 lynxtron，ETS 层 `context.filesDir` 返回对应 App 的沙箱路径，setenv 后 native 层自动获取正确目录。

---

## 五、关键文件索引

### 5.1 修改的文件（本次适配全量）


| 文件                                                | 涉及 API                       | 修改量                                    |
| --------------------------------------------------- | ------------------------------ | ----------------------------------------- |
| `src/shell/common/path_provider.cc`                 | getPath                        | +25 行（IS_HARMONY 分支）                 |
| `src/shell/app/lynxtron_napi_bridge.cc`             | setName / getPath / open-url   | +20 行（filesDir 提取 + SyncWindowTitle） |
| `src/shell/app/application_harmony.cc`              | setName（fallback）            | +3 行                                     |
| `src/shell/app/native_window_harmony.cc`            | setName                        | +10 行（标题导出）                        |
| `src/shell/app/lynx_windowless_renderer_harmony.cc` | open-url/open-file             | +40 行（pending 队列 + 导出）             |
| `src/shell/app/main_parts.cc`                       | open-url/open-file             | +2 行（flush pending）                    |
| `harmony_app/entry/.../EntryAbility.ets`            | setName / open-url / open-file | +15 行（context 传递 + handleWantUri）    |
| `harmony_app/entry/.../adapter/AppAdapter.ets`      | open-url / open-file           | +15 行（NAPI 调用管理）                   |
| `src/packages/default_app/default_app.ts`           | 全部（测试）                   | +30 行（测试用例）                        |

### 5.2 关键文件（全平台共享）


| 文件                            | 行号    | 作用                                      |
| ------------------------------- | ------- | ----------------------------------------- |
| `shell/api/api_app.cc`          | 660-670 | `App::GetPath()` 实现                     |
| `shell/api/api_app.cc`          | 331-377 | `GetPathConstant()` 字符串→枚举映射      |
| `shell/common/lynxtron_paths.h` | 26-72   | 路径枚举定义                              |
| `shell/app/application.cc`      | 113-128 | `Application::Quit()` 核心逻辑            |
| `shell/app/application.cc`      | 194-196 | `Application::SetName()`                  |
| `shell/app/application.cc`      | 213-222 | `OpenURL/OpenFile` → observer 通知       |
| `shell/api/api_app.cc`          | 511-519 | `App::OnOpenURL/OnOpenFile` → Emit 到 JS |

---

## 六、对比 Electron OHOS 适配


| 维度             | Electron OHOS                                                                                            | Lynxtron-C OHOS                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **外部依赖**     | 依赖`//ohos/adapter:adapter` (ContextPathAdapter, BrowserAdapter, FileAdapter, PermissionManagerAdapter) | 零外部依赖                                           |
| **沙箱路径获取** | `ContextPathAdapter::GetFilesDir()` (外部适配器)                                                         | ETS context.filesDir → setenv → C++ getenv（内联） |
| **启动方式**     | Chromium 进程直接加载 libelectron.so                                                                     | NAPI bridge dlopen liblynxtron.so                    |
| **冷启动 URI**   | `PreMainMessageLoopRun` 中 `GetStartUri()`                                                               | pending 队列 +`LynxtronFlushPendingOpenURLs`         |
| **标题同步**     | 原生窗口 API                                                                                             | dlsym + SyncIme 50ms 轮询 →`setMissionLabel`        |
| **单实例**       | `HasSingleInstanceLock()` → return true                                                                 | 相同                                                 |
