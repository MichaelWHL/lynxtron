### part4 Window 测试
执行步骤：
  - 滑动窗口左上方list，找到Part4 -> Window 测试
  - 点击Window 测试
  - 点击窗口右上方的运行window测试
  - 等待测试自动执行结束
  - 查看窗口下方日志窗格输出，应看到一条日志，格式：Ran N tests, A Passed, B Failed, Pass Percentage : C%
  - 其中，N为用例总数，A为通过用例数，B为失败用例数，C%为通过率（保留两位小数）

### part1 App Module API 测试

#### 页面入口
  - 滑动窗口左上方 list，找到 part1 -> APP MODULE API
  - 点击 APP MODULE API 进入测试页
  - 页面从上到下包含：帧率看板、主动调用按钮区、事件/回调按钮区、一键测试按钮区
  - 所有接口结果均在窗口下方日志窗格（LogPanel）以 `[APP][xxx]` 格式输出

#### 一、主动触发类（点击按钮单次调用）

| 按钮 | 对应 API | 功能 | 预期日志 |
| ---- | -------- | ---- | -------- |
| app.setName | `app.setName('醒图接口测试_runtime_1')` | 设置应用名称 | `[APP][setName] setName success`、`[APP][getName] 醒图接口测试_runtime_1` |
| app.getName() | `app.getName()` | 读取当前应用名称 | `[APP][getName] <应用名>` |
| app.getPath() | `app.getPath(name)` | 枚举全部路径（home/appData/assets/userData/temp/exe/module/desktop/documents/downloads/music/pictures/videos/recent/logs/crashDumps），并校验派生关系（userData=appData+appName、logs=userData/logs） | 每项 `[APP][getPath] <name> -> <路径/ERROR>`，派生校验输出 `[APP][getPath] [DERIVED] ... ✅ YES/❌ NO` |
| 无边框窗口 | `win.setWindowButtonVisibility(false)` | 隐藏 OHOS 原生边框/装饰 | `[APP][frameless] 已隐藏 OHOS 原生装饰(主窗口)` |
| app.quit() | `app.quit()` | 退出应用（慎点，不会加入一键测试） | `[APP][quit] app.quit() called`，随后应用退出 |

#### 二、事件/回调类（点击按钮注册监听）

| 按钮 | 对应 API | 功能 | 预期日志 | 事件真实触发方式 |
| ---- | -------- | ---- | -------- | ---------------- |
| app.whenReady() | `app.whenReady()` | 应用就绪后执行回调 | `[APP][whenReady] ready, app name: <名称>` | 就绪后自动触发 |
| app.on(open-url) | `app.on('open-url', cb)` | 注册深链打开监听，接收外部 URL 启动请求 | 注册时 `[APP][open-url] 已注册 open-url 监听`（重复点击提示“监听已存在”） | 外部以 `lynxtron://xxx` 深链唤起应用，触发时 `[APP][open-url] open-url event fired, url: "..."` |
| app.on(before-quit) | `app.on('before-quit', cb)` | 注册退出前监听（支持 preventDefault） | 注册时 `[APP][before-quit] 已注册 before-quit 监听`（重复点击提示“监听已存在”） | 调用 `app.quit()` 退出应用时，触发时 `[APP][before-quit] before-quit event fired` |
| app.on(window-all-closed) | `app.on('window-all-closed', cb)` | 注册全部窗口关闭监听，关闭后自动 `app.quit()` | 注册时 `[APP][window-all-closed] 已注册 window-all-closed 监听(全部关闭时 app.quit())`（重复点击提示“监听已存在”） | 关闭全部窗口时触发，自动退出 |
| win.on(frame-timings) | `win.on('frame-timings', cb)` + `win.setFrameTimingsEnabled()` | 帧率监控开关，主进程实时推送 `fps-stats` 到页面帧率看板 | 开启 `[APP][frame-timings] 已开启帧率监控(win.on("frame-timings"))`，停止 `[APP][frame-timings] 已停止帧率监控` | 开启后看板实时刷新 FPS/avg ms/max ms/frames |

#### 三、自动触发部分（启动/页面加载时自动执行，无需手动操作）

  - 应用启动时（`createWindow`）自动执行：
    - `app.setName("醒图接口测试_dev")` → 日志 `[APP][setName] setName success`、`[APP][getName]`
    - `app.whenReady()` → 日志 `[APP][whenReady] ready, app name:`
    - `app.getPath()` 全量路径枚举 → 日志 `[APP][getPath] ...`
    - 自动注册 `open-url` / `before-quit` / `window-all-closed` 三个事件监听（之后手动点击对应按钮会提示“监听已存在”）
  - 进入本页面时自动开启帧率监控（`testFrameTimings { enabled: true }`），上方帧率看板实时显示
  - 窗口就绪 2 秒后自动注册窗口事件监听（blur/focus/show/hide/resize/move 等），日志 `[WIN][events] ...`

#### 四、一键启动测试

  - 页面底部「App module · 一键测试」区块，点击「一键启动测试」按钮
  - 依次运行除 `app.quit()` 外的全部 9 个接口（setName/getName/getPath/frameless/whenReady/open-url/before-quit/window-all-closed/frame-timings），逐个采集主进程日志
  - 判据：主进程是否打印了该接口的日志标记 `[APP][xxx]`，3 秒内未打印判定为未通过
  - 页面统计显示「总个数 9 · 通过 N · P%」，日志窗格逐条输出 `[PASS] ✓` / `[FAIL] ✗` 与汇总「一键测试完成: 通过 N/9」
  - 注意：`app.quit()` 会直接退出应用，已从一键测试中排除
