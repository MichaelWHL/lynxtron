#!/usr/bin/env python3
# Copyright 2026 The Lynxtron Authors. All rights reserved.
# Licensed under the Apache License Version 2.0 that can be found in the
# LICENSE file in the root directory of this source tree.

import argparse
import subprocess
import sys
import os
import json
import platform

CURRENT_PATH = os.path.dirname(__file__)
ROOT_PATH = os.path.dirname(os.path.dirname(CURRENT_PATH))

def get_current_os():
  system = platform.system()
  if system == 'Darwin':
    return 'mac'
  elif system == 'Windows':
    return 'win'
  else:
    return system.lower()

def get_default_gn_args(is_debug, enable_enlarge_stack, target_os):
  gn_args = ''
  if is_debug:
    gn_args += 'import("//src/build/args/debug.gn") '
  else:
    gn_args += 'import("//src/build/args/release.gn") '
  gn_args += 'desktop_enable_embedder_layer=true '
  gn_args += 'enable_clay_standalone=true '
  gn_args += 'disable_visibility_hidden=true '
  gn_args += 'use_ndk_static_cxx=false '
  gn_args += 'enable_linker_map=false '
  gn_args += 'enable_clay=true '
  gn_args += 'clay_enable_skshaper=true '
  gn_args += 'is_headless=true '
  gn_args += 'skia_enable_flutter_defines=true '
  gn_args += 'skia_use_dng_sdk=false '
  gn_args += 'skia_use_sfntly=false '
  gn_args += 'skia_enable_pdf=false '
  gn_args += 'skia_enable_svg=true '
  gn_args += 'enable_svg=true '
  gn_args += 'skia_enable_skottie=true '
  gn_args += 'skia_use_x11=false '
  gn_args += 'skia_use_wuffs=true '
  gn_args += 'skia_use_expat=true '
  gn_args += 'skia_use_fontconfig=false '
  gn_args += 'skia_use_icu=true '
  gn_args += 'allow_deprecated_api_calls=true '
  gn_args += 'stripped_symbols=true '
  gn_args += 'enable_lto=false '
  gn_args += 'enable_lepusng_worklet=true '
  gn_args += 'enable_napi_binding=true '
  gn_args += 'enable_inspector=true '
  gn_args += 'jsengine_type="v8" '
  gn_args += 'use_primjs_napi=true '
  if enable_enlarge_stack:
    gn_args += 'enable_enlarge_stack=true '

  if target_os == 'mac':
    gn_args += 'skia_gl_standard=""'
    gn_args += 'skia_use_metal=true '
    gn_args += 'shell_enable_metal=true '
    gn_args += 'use_clang_static_analyzer=false '
    gn_args += 'use_flutter_cxx=false '
  elif target_os == 'win':
    gn_args += 'is_clang=true '
  elif target_os == 'harmony':
    gn_args += 'is_clang=true '
    gn_args += 'use_musl=true '
    gn_args += 'is_component_build=false '
    # Do not build the lepus template compiler on device. Like mobile
    # (android/ios) and win, HarmonyOS runs precompiled lepus bytecode. The
    # compiler subtree (lepus/ir/*, bytecode_*) relies on C++ exceptions,
    # which are disabled here (-fno-exceptions), so it cannot compile.
    gn_args += 'build_lepus_compile=false '
    gn_args += 'use_custom_libcxx=false '
    gn_args += 'use_sysroot=false '
    gn_args += 'enable_rust=false '
    # PA-E for partition_alloc page allocation + chromium114 V8 config.
    gn_args += 'use_partition_alloc=true '
    gn_args += 'use_partition_alloc_as_malloc=true '
    gn_args += 'use_allocator_shim=true '
    gn_args += 'enable_backup_ref_ptr_support=false '
    gn_args += 'enable_pointer_compression_support=false '
    gn_args += 'v8_enable_sandbox=false '
    gn_args += 'v8_use_external_startup_data=true '
    # HarmonyOS kernel W^X policy rejects mprotect(RWX) with EINVAL.
    # WasmCodeManager::Commit needs 256MB RWX at isolate init — disable
    # WebAssembly entirely on HarmonyOS (cjs-module-lexer falls back to JS).
    gn_args += 'v8_enable_webassembly=false '
    # chromium114 build.sh: ARM64 PAC/BTI. Without this V8's stack unwinder
    # does not strip PAC bits from return addresses, so
    # GcSafeFindCodeForInnerPointer fails to match embedded builtin PCs.
    # (v8_control_flow_integrity auto-derives from this on arm64 toolchains
    # only — setting it explicitly breaks the host x64 toolchain assert.)
    gn_args += 'arm_control_flow_integrity="standard" '
    # Lynx skia patch ships skia_harmony fontmgr in a truncated form (the patch
    # itself is incomplete, multiple .cpp/.h files miss tail). Disable the
    # HarmonyOS font manager target; Skia will fall back to the
    # default fontmgr. Revisit by either (a) restoring lynx skia patch from
    # upstream or (b) writing a proper SkFontMgr_New_Harmony implementation.
    gn_args += 'skia_enable_fontmgr_harmony=false '
    # Instead, use skia's custom-directory font manager to load the OHOS system
    # fonts under /system/fonts/ (FZHeiT / DejaVu / etc.). Without any fontmgr,
    # SkFontMgr::RefDefault() is the empty manager and all Lynx <text> renders
    # blank. platform_harmony.cc points SkFontMgr_New_Custom_Directory at
    # /system/fonts/. freetype is already on for harmony.
    gn_args += 'skia_enable_fontmgr_custom_directory=true '
    # ohos clang 19 doesn't ship chromium-specific clang plugins (blink-gc-plugin,
    # find-bad-constructs, raw-ptr-plugin). Disable them on harmony.
    gn_args += 'clang_use_chrome_plugins=false '
    # V8 Temporal API is implemented by rust temporal_rs crate; with
    # enable_rust=false the cxx-bridge headers are still emitted but the rust
    # symbols never get compiled, so mksnapshot link fails. Disable temporal
    # support for this configuration.
    gn_args += 'v8_enable_temporal_support=false '
    gn_args += 'skia_gl_standard="gles" '
    gn_args += 'skia_use_gl=true '

  return gn_args

def run_gn_script(gn_args, out_path):
  gn_script_dir = os.path.join(ROOT_PATH, 'buildtools', 'gn')
  gn_script_path = os.path.join(gn_script_dir, 'gn')
  if get_current_os() == 'win':
    gn_script_path = os.path.join(gn_script_dir, 'gn.exe')
  cmd = [gn_script_path, 'gen', out_path, f'--args={gn_args}']
  print(' '.join(cmd))
  subprocess.run(cmd, check=True)

def parse_args(args):
  args = args[1:]
  parser = argparse.ArgumentParser(description='A script run` gn gen`.')

  parser.add_argument('--gn-args', type=str, dest='gn_args')
  parser.add_argument('--is-debug', dest='is_debug', action='store_true', default=False)
  parser.add_argument('--mac-cpu', type=str, choices=['x64', 'arm64'], default='arm64')
  parser.add_argument('--windows-cpu', type=str, choices=['x64', 'arm64', 'x86'], default = 'x86')
  parser.add_argument('--target-os', type=str,
                      choices=['mac', 'win', 'linux', 'harmony'],
                      default=None,
                      help='Target OS for cross compile. Defaults to host OS.')
  parser.add_argument('--harmony-cpu', type=str,
                      choices=['arm64', 'arm', 'x64'], default='arm64')
  parser.add_argument('--enable-enlarge-stack', dest='enable_enlarge_stack', action='store_true', default=False)

  return parser.parse_args(args)

def main(argv):
  args = parse_args(argv)
  target_os = args.target_os or get_current_os()
  gn_args = ''
  gn_args += get_default_gn_args(args.is_debug, args.enable_enlarge_stack, target_os)
  if args.gn_args:
    gn_args += args.gn_args

  if target_os == 'mac':
    gn_args += f' target_cpu="{args.mac_cpu}"'
  elif target_os == 'win':
    gn_args += f' target_cpu="{args.windows_cpu}"'
  elif target_os == 'harmony':
    gn_args += ' target_os="harmony"'
    gn_args += f' target_cpu="{args.harmony_cpu}"'

  escaped_gn_args = gn_args.replace('"', '\\"')

  if target_os == 'harmony':
    sub = 'Debug' if args.is_debug else 'Release'
    out_path = os.path.join(ROOT_PATH, 'out', f'harmony_{args.harmony_cpu}_{sub}')
  else:
    out_path = os.path.join(ROOT_PATH, 'out', 'Release')
    if args.is_debug:
      out_path = os.path.join(ROOT_PATH, 'out', 'Debug')
  return run_gn_script(gn_args, out_path)

if __name__ == '__main__':
  sys.exit(main(sys.argv))
