# app.getPath() / app.setPath() OHOS 鸿蒙化适配

## 一、API 说明与使用场景

`app.getPath(name)` 获取系统/应用预定义的特殊目录路径。`app.setPath(name, path)` 覆盖这些默认路径。

**鸿蒙可用**的 name 参数：

| name | 说明 | 鸿蒙路径 |
|------|------|---------|
| `'appData'` | 应用数据根目录 | ETS context.filesDir 或 probing 兜底 |
| `'userData'` | 用户数据目录 | `{appData}/{appName}` |
| `'logs'` | 日志目录 | `{userData}/logs` |
| `'userCache'` | 用户缓存目录 | `{appData}/{appName}` |
| `'home'` | 用户主目录 | `base::DIR_HOME` |
| `'temp'` | 临时文件目录 | `base::DIR_TEMP` |
| `'exe'` | 可执行文件路径 | `base::FILE_EXE` |
| `'module'` | 共享库路径 | `base::FILE_MODULE` |
| `'desktop'` | 桌面目录 | `base::DIR_USER_DESKTOP` |
| `'cache'` | 系统缓存目录 | `base::DIR_CACHE` |

**鸿蒙不可用**（平台专属，调了 throw Error）：

| name | 可用平台 |
|------|---------|
| `'documents'` | Win only |
| `'downloads'` | Win / Android |
| `'music'` | Win only |
| `'pictures'` | Win only |
| `'videos'` | Win only |
| `'recent'` | Win only |
| `'crashDumps'` | 全平台不可用（crashpad 未接入） |

**典型使用场景**：

```js
const { app } = require('@lynx-js/lynxtron')
const fs = require('fs')

// 存用户配置
const cfgPath = app.getPath('userData') + '/config.json'
fs.writeFileSync(cfgPath, JSON.stringify({ theme: 'dark' }))

// 写日志
const logPath = app.getPath('logs') + '/app.log'

// 缓存文件
const cachePath = app.getPath('userCache') + '/temp.bin'
```

---

## 二、调用链路（5 层）

```
JS: app.getPath(name)
 ↓  NODE_LINKED_BINDING_CONTEXT_AWARE("lynxtron_binding_app") → Gin ObjectTemplate
 ↓
(1) Native binding: App::GetPath
    → src/shell/api/api_app.cc:660-670
      register: src/shell/api/api_app.cc:1131 (.SetMethod("getPath", &App::GetPath))
 ↓
(2) GetPathConstant(name)  字符串 → 路径枚举
    → src/shell/api/api_app.cc:331-377
 ↓
(3) base::PathService::Get(key, &path)
    → 注册入口: src/shell/app/main_parts.cc:161    (主进程)
               src/shell/app/node_main.cc:77-78   (Node进程)
 ↓
(4) lynxtron::PathProvider()  枚举 → 实际文件路径
    → src/shell/common/path_provider.cc:105-270
      ├── DIR_APP_DATA:  OHOS env var优先 → probing兜底  (line 154-178) ← 本次新增
      ├── DIR_USER_DATA: DIR_APP_DATA/{appName}          (line 109-116)
      ├── DIR_USER_CACHE: DIR_APP_DATA/{appName}         (line 131-153)  ← 本次新增
      ├── DIR_APP_LOGS:  DIR_USER_DATA/logs              (line 186-202)
      └── DIR_APP_DICTIONARIES: DIR_USER_DATA/Dictionaries (line 123-130)
```

---

## 三、OHOS 适配方案

### 3.1 核心问题

OHOS 上 `OS_LINUX` 为 true（`build_config.h:98` 将 `__OHOS__` 视为 `OS_LINUX` 的 sibling），原 `path_provider.cc` 在 `#if defined(OS_LINUX)` 分支中走 `base::nix::GetXDGDirectory`，解析到 `~/.config`，这在 OHOS 沙箱内不正确。

### 3.2 解决方案：双保险

```
优先路径: ETS context.filesDir ──→ setenv → getenv → 直接用
兜底路径: (env var 为空时) probing el2/base/files / el1/base/files
```

**为什么只需要改 `DIR_APP_DATA`**：

`DIR_USER_DATA` / `DIR_APP_LOGS` / `DIR_APP_DICTIONARIES` 均从 `DIR_APP_DATA` 派生，只需改这一个 key，其余自动正确：

```
DIR_APP_DATA        → /data/storage/el2/base/files
DIR_USER_DATA       → {DIR_APP_DATA}/{appName}           ← 自动派生
DIR_APP_LOGS        → {DIR_USER_DATA}/logs                ← 自动派生
DIR_APP_DICTIONARIES → {DIR_USER_DATA}/Dictionaries       ← 自动派生
DIR_USER_CACHE      → {DIR_APP_DATA}/{appName}            ← 本次单独适配（原走 XDG）
```

### 3.3 数据流（ETS → C++）

```
EntryAbility.ets                          lynxtron_napi_bridge.cc            path_provider.cc
──────────────────                        ───────────────────────            ─────────────────
onCreate()
  .setAbilityContext(this.context)
    → context.filesDir                    SetAbilityContext()
    (e.g. "el2/base/files")    ────────→   napi_get_named_property
                                            → "filesDir" → 字符串
                                            → setenv("LYNXTRON_FILES_DIR")    PathProvider()
                                                                               → getenv("LYNXTRON_FILES_DIR")
                                                                               → 有? 直接用
                                                                               → 无? probing 兜底
```

### 3.4 跨 App 兼容性说明

lynxtron 作为框架被不同 App 集成时：ETS 层 `context.filesDir` 返回的是**当前 App 的**沙箱路径（OS 级隔离），setenv 后 native 层自动获取正确目录，无需硬编码 bundle name。

---

## 四、改动文件

| 文件 | 行号 | 改动内容 | 意图 |
|------|------|---------|------|
| `path_provider.cc` | 16-18 | 新增 `#include <stdlib.h>` (IS_HARMONY) | 提供 getenv |
| `path_provider.cc` | 132-133 | `DIR_USER_CACHE` 新增 `IS_HARMONY` 分支，parent key → `DIR_APP_DATA` | OHOS 上 `base::DIR_CACHE` 走 XDG 会失败 |
| `path_provider.cc` | 154-178 | `DIR_APP_DATA` 新增 `IS_HARMONY` 分支（优先级高于 `OS_LINUX`） | env var 优先 → probing 兜底，劫持 XDG 路径 |
| `lynxtron_napi_bridge.cc` | 647-658 | `SetAbilityContext` 中提取 `filesDir` → `setenv("LYNXTRON_FILES_DIR")` | ETS → C++ 路径透传 |

### 4.1 path_provider.cc 核心改动代码

```cpp
// 行 154-178: DIR_APP_DATA OHOS 适配
#if BUILDFLAG(IS_HARMONY)
    case DIR_APP_DATA: {
      const char* env = getenv("LYNXTRON_FILES_DIR");    // 优先: ETS 传参
      if (env && env[0] != '\0') {
        cur = base::FilePath(env);
      } else {
        const char* kCandidateFilesDirs[] = {              // 兜底: probing
            "/data/storage/el2/base/files",
            "/data/storage/el1/base/files",
        };
        bool found = false;
        for (const char* p : kCandidateFilesDirs) {
          cur = base::FilePath(FILE_PATH_LITERAL(p));
          if (base::DirectoryExists(cur)) { found = true; break; }
        }
        if (!found) {
          cur = base::FilePath(FILE_PATH_LITERAL("/data/storage/el2/base/files"));
        }
      }
      break;
    }
#elif defined(OS_LINUX)    // 原 XDG 逻辑，OHOS 不再进入
```

### 4.2 lynxtron_napi_bridge.cc 核心改动代码

```cpp
// 行 647-658: SetAbilityContext 中新增 filesDir 提取
napi_value files_dir = nullptr;
if (napi_get_named_property(env, argv[0], "filesDir", &files_dir) == napi_ok &&
    files_dir != nullptr) {
  size_t len = 0;
  napi_get_value_string_utf8(env, files_dir, nullptr, 0, &len);
  std::string path(len, '\0');
  napi_get_value_string_utf8(env, files_dir, &path[0], len + 1, &len);
  setenv("LYNXTRON_FILES_DIR", path.c_str(), 1);
}
```

---

## 五、测试用例与预期结果

测试代码位于 `src/packages/default_app/default_app.ts`：

```
=====================================================
-------------- App.getPath() OHOS测试--------------
| [API-TEST] [获取来源] ETS context.filesDir -> /data/storage/el2/base/files
| [API-TEST] [GET PATH] appData         -> /data/storage/el2/base/files
| [API-TEST] [GET PATH] userData        -> /data/storage/el2/base/files/醒图PC-LYNXTRON-API-测试
| [API-TEST] [GET PATH] logs            -> .../醒图PC-LYNXTRON-API-测试/logs
| [API-TEST] [GET PATH] userCache       -> .../醒图PC-LYNXTRON-API-测试
| [API-TEST] [GET PATH] crashDumps      -> ERROR: Failed to get 'crashDumps' path
-------------- 派生关系验证--------------
| [API-TEST] [DERIVED] userData = appData + appName  ?  ✅ YES
| [API-TEST] [DERIVED] logs = userData + "logs"     ?  ✅ YES
-------------- 平台专属路径 (预期ERROR) --------------
| [API-TEST] [GET PATH] documents       -> ERROR (预期)
| [API-TEST] [GET PATH] downloads       -> ERROR (预期)
| [API-TEST] [GET PATH] music           -> ERROR (预期)
| [API-TEST] [GET PATH] pictures        -> ERROR (预期)
| [API-TEST] [GET PATH] videos          -> ERROR (预期)
| [API-TEST] [GET PATH] recent          -> ERROR (预期)
-----------------完-----------------
=====================================================
```

第一行 `[获取来源]` 可区分是 ETS context 传参还是 probing 兜底。

### 5.1 异常场景验证（兜底触发）

当 ETS 层未设置 env var（如独立 C++ 测试），日志显示：

```
| [API-TEST] [获取来源] 探测兜底 (probing)
| [API-TEST] [GET PATH] appData         -> /data/storage/el2/base/files
```

probing 机制会探测 `el2/base/files` 和 `el1/base/files`，第一个存在的目录即为结果。

---

## 六、与 Electron OHOS 适配对比

| 维度 | Electron OHOS | Lynxtron-C OHOS |
|------|--------------|-----------------|
| `DIR_APP_DATA` 路径来源 | `ContextPathAdapter::GetFilesDir()`（外部适配器库） | ETS context.filesDir → setenv → getenv（内联） |
| 外部依赖 | `//ohos/adapter:adapter` | 零 |
| 其他路径适配 | 从 `DIR_APP_DATA` 自动派生，一致 | 从 `DIR_APP_DATA` 自动派生，一致 |
| 兜底机制 | 无（依赖外部 SDK 返回正确值） | probing 双候选 + 最终硬编码 |

---

## 七、关键文件索引

| 文件 | 行号 | 作用 |
|------|------|------|
| `src/shell/api/api_app.cc` | 1131 | 暴露 `getPath` 到 JS |
| `src/shell/api/api_app.cc` | 660-670 | `App::GetPath()` 实现 |
| `src/shell/api/api_app.cc` | 672-686 | `App::SetPath()` 实现 |
| `src/shell/api/api_app.cc` | 331-377 | `GetPathConstant()` 字符串→枚举映射 |
| `src/shell/common/lynxtron_paths.h` | 26-72 | 路径枚举定义 |
| `src/shell/common/path_provider.cc` | 105-270 | `PathProvider()` 枚举→真实路径 |
| `src/shell/common/path_provider.cc` | 154-178 | **OHOS 核心适配**：env var → probing |
| `src/shell/common/path_provider.cc` | 132-133 | **OHOS 适配**：`DIR_USER_CACHE` parent 改为 `DIR_APP_DATA` |
| `src/shell/app/main_parts.cc` | 161 | 注册 PathProvider |
| `src/shell/app/lynxtron_napi_bridge.cc` | 647-658 | **OHOS 适配**：`SetAbilityContext` 中提取 `filesDir` → setenv |
| `harmony_app/.../EntryAbility.ets` | 44-45 | ETS 侧传入 AbilityContext |
| `src/packages/default_app/default_app.ts` | 56-94 | 测试用例 |
