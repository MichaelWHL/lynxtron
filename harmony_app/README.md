# Lynxtron HarmonyOS HAP wrapper

Standard OHOS NAPI HAP project skeleton that loads `liblynxtron.so`
(produced by the chromium-style GN build at the repo root) via a UIAbility
ts entry. Tracked under WI-036.

## Status

- WI-036 wave A: napi_init / napi_module_register scaffolding landed in
  `src/shell/app/main_harmony.cc` (still produces a PIE executable; flip
  to shared_library blocked on -fPIC global cflag rollout).
- WI-036 wave C (this directory): HAP project skeleton in standard OHOS
  shape so that once wave B produces `liblynxtron.so`, this directory
  can be opened in DevEco Studio (or built with `hvigorw assembleHap`)
  and produce a signed `.hap`.

## Layout

```
harmony_app/
├── AppScope/              # workspace-level app metadata
│   ├── app.json5          # bundleName=com.haitaichina.lynxtron
│   └── resources/
├── build-profile.json5    # workspace build settings
├── hvigorfile.ts          # workspace tasks
├── oh-package.json5       # workspace deps (hvigor / hvigor-ohos-plugin)
└── entry/                 # main HAP module
    ├── build-profile.json5
    ├── hvigorfile.ts
    ├── oh-package.json5
    └── src/main/
        ├── module.json5             # module + EntryAbility metadata
        ├── ets/
        │   ├── entryability/
        │   │   └── EntryAbility.ets # UIAbility lifecycle
        │   └── pages/
        │       └── Index.ets        # main UI; calls lynxtron.start()
        ├── cpp/
        │   ├── CMakeLists.txt       # imports prebuilt liblynxtron.so
        │   └── types/libentry/
        │       ├── Index.d.ts       # ts type decl for `import lynxtron`
        │       └── oh-package.json5
        ├── resources/
        │   └── base/
        │       ├── element/string.json
        │       ├── element/color.json
        │       └── profile/main_pages.json
        └── rawfile/                 # placeholder (icons / assets)
```

## Building (when wave B is done)

```sh
# 1. Build liblynxtron.so via the GN build:
cd /opt/sda2/liuwh/lynxtron/lynxtron
./lynxtron_tools/gn/gn.py --target-os=harmony --harmony-cpu=arm64
ninja -C out/harmony_arm64_Release lynxtron_app
# -> out/harmony_arm64_Release/liblynxtron.so

# 2. Build the HAP via hvigor (CMakeLists picks up the prebuilt .so):
cd /opt/sda2/liuwh/lynxtron/lynxtron/harmony_app
hvigorw assembleHap

# 3. Result:
# entry/build/default/outputs/default/entry-default-unsigned.hap
```

To produce a signed HAP, configure `app.signingConfigs[]` in
`build-profile.json5` with your developer cert + profile, then run
`hvigorw assembleHap` again.

## Running on device

```sh
hdc install entry/build/default/outputs/default/entry-default-signed.hap
hdc shell aa start -a EntryAbility -b com.haitaichina.lynxtron
hdc hilog -t Lynxtron       # filter our logs
```

## Known wave-by-wave gaps

- liblynxtron.so does not yet exist (wave B blocked on -fPIC global
  cflag). The CMakeLists.txt prints a WARNING message during build if
  the prebuilt is missing.
- Application icon is a placeholder reference (`$media:icon` /
  `$media:app_icon`). Drop a real `icon.png` into
  `entry/src/main/resources/base/media/` and
  `AppScope/resources/base/media/` for actual install.
- LynxtronMain currently runs synchronously on the UIAbility main
  thread, which will stall the Index page. Future wiring should spawn
  a worker thread (napi_create_async_work or std::thread).
