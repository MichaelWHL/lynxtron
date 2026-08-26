
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



### part2 测试
本部分包含3个模块的内容：
- update相关3个接口，点击每个按钮可以测试相应接口的调用情况，测试结果会反馈在按钮下方和模块名称处。
- 窗口监听事件相关7个接口，操作窗口（缩放，显隐，关闭等）时该部分可以监听到窗口的操作过程，事件触发次数和总的成功比例会反馈在对应标签下方和模块名称末尾。
- 3个全局事件接口，测试主线程和UI线程之间的交互接口，点击每个按钮可测试对应接口的调用情况，测试结果反馈在按钮下方和模块名称末尾。
- 多窗口测试，点击该按钮会新生成一个和当窗口内容一样的新窗口以测试上述接口在多窗口下的实现情况。



### part3 测试

#### 页面入口
  - 滑动窗口左上方 list，找到 part3 下的模块项：shell / dialog / nativeImage / powerMonitor / screen / clipboard / lynx
  - 点击任一模块进入对应测试页（路由 /zf/:moduleId，进入时统计重置）
  - 页面从上到下包含：统计条（本模块总接口数量/通过/失败/通过率）、"▶ 自动执行本模块非交互用例"按钮、用例卡片区（交互项含橙色分步操作提示）
  - 所有接口结果均在窗口下方日志窗格（LogPanel）以 [PASS]/[FAIL] 格式输出，并计入模块统计
  - 统计口径：总接口数量 = 本模块累计 [PASS]+[FAIL] 标记数；通过 = [PASS] 数；失败 = [FAIL] 数；通过率 = 通过/总接口（保留一位小数）
  - 自动执行 + 手动触发都会产生 [PASS]/[FAIL]，统一纳入统计

#### 一、自动执行类（非交互用例，点页头"▶ 自动执行本模块非交互用例"批量串行跑，也可逐卡点击）

| 模块 | 按钮 | 对应 API | 功能 | 预期日志 |
| ---- | ---- | -------- | ---- | -------- |
| shell | OpenExternal | `shell.openExternal(url)` | 多协议打开外部链接，共 10 个用例（HTTP/HTTPS 3 个、mailto 3 个、tel 1 个、sms 带正文 1 个、file 本地沙箱文件 1 个、ftp 1 个） | 每协议 `[PASS]/[FAIL]`，末尾 `[shell.openExternal] [PASS] 完成: X 通过, Y 失败` |
| shell | OpenPath | `shell.openPath(path)` | 打开鸿蒙应用沙箱/存储路径，共 8 个用例（el1/el2 沙箱 4 个、外部存储与 Download 2 个、不存在路径与空字符串 2 个） | 每路径 `[PASS]/[FAIL]`，末尾 `[shell.openPath] [PASS] 完成: X 通过, Y 失败` |
| screen | GetPrimaryDisplay | `screen.getPrimaryDisplay()` | 获取主屏幕信息 | `[screen] [PASS] getPrimaryDisplay 返回有效` |
| clipboard | ClipboardWriteText | `clipboard.writeText(text)` | 剪贴板写入（readText 需申请权限，尚未适配，仅验证写入） | `[clipboard] [PASS] 写入成功` |
| lynx | JSModule | `lynx.getJSModule/registerModule` | 渲染层 4 个用例 | `[JM] [PASS]/[FAIL] 用例1..4`，末尾 `[JM] [PASS] 测试通过 (4/4)` |
| lynx | ModuleLoader | `getModuleLoader().load()` | 加载 lynxtron_hello 6 个用例 | `[ML] [PASS]/[FAIL] ...` |
| lynx | SelectorQuery | `lynx.createSelectorQuery` | 6 个用例，目标 #lxp-target 与 .lxp-item | `[SQ] [PASS]/[FAIL] 用例1..6` |
| lynx | requireModule | `lynx.requireModule(url)` | 远程 npm 模块加载 | `[RM] [PASS]/[FAIL] 加载成功/异常` |

#### 二、交互类（需按卡片提示手动操作，结果同样计入统计；自动执行会跳过）

##### dialog · ShowOpenDialog（连续弹出 6 次选择器）

操作：点击按钮后，真机将**依次弹出 6 次系统文件选择器**。每次操作完自动进入下一次，无需再点按钮。

| 次序 | 弹窗类型 | 具体操作 | 判为通过的日志 |
| ---- | -------- | -------- | -------------- |
| ① | 单选文件（默认） | 选择任意一个文件 → 点"确定" | `[PASS] [单选文件(默认)] filePaths=[...]` |
| ② | 多选文件 | 长按/勾选多个文件 → 点"确定" | `[PASS] [多选文件] filePaths=[...]`（含多个路径） |
| ③ | 选择目录 | 进入任意一个目录 → 点"确定" | `[PASS] [选择目录] filePaths=[目录]` |
| ④ | 带 filters(*.js/*.ts) | 选一个 .js 或 .ts 文件 → 点"确定" | `[PASS] [带 filters(*.js/*.ts)] filePaths=[...]` |
| ⑤ | 带 defaultPath | 在默认路径下选任意一个文件 → 点"确定" | `[PASS] [带 defaultPath(...)] filePaths=[...]` |
| ⑥ | 用户取消 | 直接点"取消"（不选任何文件） | `[PASS] [用户取消] canceled=true (用户取消)` |

- 若某步点"确定"但未选中任何文件（filePaths 为空且 canceled=false）→ 该步判 `[FAIL]`（日志：`canceled=false 但 filePaths 为空`）。
- 若某步弹出时抛异常 → 该步判 `[FAIL]`（日志：`抛异常 → ...`）。
- 6 步全部结束后打印汇总：`[dialog.showOpenDialog] [PASS] 完成: X 通过, 0 失败` 或 `[FAIL] 完成: X 通过, Y 失败`。

##### dialog · ShowSaveDialog（连续弹出 4 次保存框）

操作：点击按钮后，真机将**依次弹出 4 次系统保存对话框**。

| 次序 | 弹窗类型 | 具体操作 | 判为通过的日志 |
| ---- | -------- | -------- | -------------- |
| ① | 默认保存 | 直接点"保存"（或用默认文件名） | `[PASS] [默认保存] filePath=[...]` |
| ② | 带 defaultPath（Desktop/新文件.txt） | 在默认路径下直接点"保存" | `[PASS] [带 defaultPath(...)] filePath=[...]` |
| ③ | 带 filters(*.txt/*.md) | 输入一个 .txt 或 .md 文件名 → 点"保存" | `[PASS] [带 filters(*.txt/*.md)] filePath=[...]` |
| ④ | 用户取消 | 直接点"取消" | `[PASS] [用户取消] canceled=true (用户取消)` |

- 注意：②③ 步会额外打印一行 `[diag] defaultPath ...`（中文路径的码元/UTF-8 hex 诊断），属正常输出，不是失败。
- 若某步保存后 filePath 为空且未取消 → 该步判 `[FAIL]`。
- 全部结束后打印汇总：`[dialog.showSaveDialog] [PASS]/[FAIL] 完成: ...`。

##### nativeImage · CreateFromPath（弹 1 次选择器）

操作：点击按钮后真机弹出**一次**文件选择器。
1. 选择一张 `png / jpg / jpeg / webp` 图片 → 点"确定"。
2. 日志先打印 `选择图片: <路径>`，随后 `isEmpty: false (false 表示成功加载)`、`size: {...}`。
3. 判通过：`[nativeImage.createFromPath] [PASS] 加载成功, size={...}`（即 isEmpty=false 且宽高>0）。
4. 判失败：点了取消 / 未选图片 → `[FAIL] 用户取消或未选择图片`；加载后空或尺寸无效 → `[FAIL] 加载失败: isEmpty=... size=...`。

##### nativeImage · CreateFromBitmap（弹 1 次选择器）

操作：点击按钮后真机弹出**一次**文件选择器。
1. 选择一张 `png / jpg / jpeg` 图片 → 点"确定"。
2. 内部流程：先 `createFromPath` 加载 → `toBitmap` 构造新图并校验尺寸一致 → `toPNG` 编码 → `createFromBuffer` 重解析。
3. 判通过：`[nativeImage.createFromBitmap] [PASS] 位图往返 + PNG 编码均正常`（bmpOk && pngOk 都为真）。
4. 判失败：取消/未选图 → `[FAIL] 用户取消或未选择图片`；任一环节失败 → `[FAIL] bmpOk=... pngOk=...`。

##### powerMonitor · PowerMonitor（5 秒内锁屏→解锁）

操作：点击按钮后注册 lock-screen / unlock-screen 监听，**仅持续 5 秒**，超时自动取消注册。
1. 点击按钮后，立刻看到日志 `[powerMonitor] listeners registered`。
2. 在 5 秒内按电源键**锁屏一次** → 期望日志 `[powerMonitor] PASS: lock-screen #1`。
3. 紧接着**解锁一次** → 期望日志 `[powerMonitor] PASS: unlock-screen #1`。
4. 5 秒后自动取消注册并打印 `[powerMonitor] listeners removed: lock=1, unlock=1` 与
   `[powerMonitor] [PASS] 监听器注册/注销流程完成 ...`。

判定要点（易错）：
- **顺序必须是"先 lock 后 unlock"**。若未先 lock 就 unlock → 日志 `[powerMonitor] FAIL: unexpected unlock-screen, lastEvent=...`。
- **重复 lock**（锁了两次没解锁）→ 日志 `[powerMonitor] FAIL: duplicate lock-screen`。
- 若 5 秒内什么都没做 → 无 lock/unlock 事件，但注册/注销流程本身仍会打印 `[PASS] 监听器注册/注销流程完成`（仅验证注册/注销，事件需真机配合）。

##### lynx · AddFont（自填 FONT_SRC 后运行）

操作：这是唯一需要"填内容"的用例，字体名固定为 sq-font。
1. 在卡片下方输入框填入 **FONT_SRC**（字体地址）：
   - 填字体 URL 或 data URI，例如 `url('http://192.168.19.183:8787/fonts/Bungee-Regular.ttf')`（注意 url 括号内要带引号）。
   - 若留空，会使用内置默认字体地址。
2. 点卡片上的"运行"按钮。
3. 日志依次打印：`[FT] 用例1 缺 font-family 抛异常`（PASS）、`[FT] 用例2 缺 src 抛异常`（PASS）、`[FT] 用例3 提交 addFont…`，随后轮询测量 `测量[n]: 自定义=... 默认=... 差=...`。
4. 判通过：`[FT] 结论: addFont 字体已生效`（自定义字体宽度与默认有差异，diff>0.5），且下方 **`#ft-custom` 文字从灰变亮**。
5. 判失败：`[FT] 结论: 轮询 20 次后宽度仍无差异 → 字体未生效`，或 `[FT] 用例3 回调带错误: ...` / `[FT] 用例3 抛异常: ...`。

#### 三、统计与日志

  - 页头统计条实时刷新：`本模块总接口数量:X 通过:Y 失败:Z 通过率:R%`
  - 自动执行结束 / 每次手动触发后，底部日志打印一行：
    `[STATS] 模块 <id> 本模块总接口数量:X，通过:Y，失败:Z，通过率:R%`，可直接复制上报
  - 每张卡片显示该用例"通过 N · 失败 M"；交互项另显示橙色分步操作提示
  - 说明：交互类（manual）用例自动执行时跳过，需手动触发，但结果同样计入统计



### part4 Window 测试



执行步骤：



  - 滑动窗口左上方list，找到Part4 -> Window 测试



  - 点击Window 测试



  - 点击窗口右上方的运行window测试



  - 等待测试自动执行结束



  - 查看窗口下方日志窗格输出，应看到一条日志，格式：Ran N tests, A Passed, B Failed, Pass Percentage : C%



  - 其中，N为用例总数，A为通过用例数，B为失败用例数，C%为通过率（保留两位小数）



