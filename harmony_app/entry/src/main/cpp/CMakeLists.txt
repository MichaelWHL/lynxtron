# CMakeLists for the Lynxtron HAP entry module's native lib.
#
# Lynxtron's main library is produced by the chromium-style GN build
# tree at the repo root (out/harmony_arm64_Release/liblynxtron.so).
# Once WI-036 wave-pic produces a position-independent shared object,
# the script below links it as a prebuilt and the HAP packages it under
# entry/libs/arm64-v8a/liblynxtron.so so the OHOS HAP loader can dlopen
# it from `import lynxtron from 'liblynxtron.so'` in ets code.
#
# Path layout:
#   ../../../../../../out/harmony_arm64_Release/liblynxtron.so
#   = /opt/sda2/liuwh/lynxtron/lynxtron/out/harmony_arm64_Release/liblynxtron.so
# Adjust LYNXTRON_GN_OUT_DIR if your gn out dir differs.

cmake_minimum_required(VERSION 3.5.0)
project(lynxtron_hap)

set(LYNXTRON_GN_OUT_DIR
  "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../../out/harmony_arm64_Release"
  CACHE PATH "Path to the lynxtron GN out directory")

set(LYNXTRON_PREBUILT
  "${LYNXTRON_GN_OUT_DIR}/liblynxtron.so")

if(EXISTS "${LYNXTRON_PREBUILT}")
  add_library(lynxtron SHARED IMPORTED)
  set_target_properties(lynxtron
    PROPERTIES IMPORTED_LOCATION "${LYNXTRON_PREBUILT}")

  # Re-export liblynxtron.so into the HAP libs/arm64-v8a/ directory so
  # the OHOS app loader picks it up. CMake does the copy via a custom
  # target that depends on the prebuilt path.
  add_custom_target(copy_lynxtron_so ALL
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      "${LYNXTRON_PREBUILT}"
      "${CMAKE_LIBRARY_OUTPUT_DIRECTORY}/liblynxtron.so"
    DEPENDS "${LYNXTRON_PREBUILT}")
  message(STATUS "lynxtron native lib staged from ${LYNXTRON_PREBUILT}")
else()
  # Missing prebuilt is the WI-036 wave-pic blocker: liblynxtron.so will
  # only exist once src/BUILD.gn flips lynxtron_app from `executable` to
  # `shared_library` (which in turn requires a -fPIC global cflag rollout).
  # For wave C/D's "shell HAP" smoke test we still want hvigorw assembleHap
  # to succeed end-to-end, so just print a STATUS line and skip target
  # creation. The resulting .hap will load without lynxtron - the ts side
  # `import lynxtron from 'liblynxtron.so'` will throw at runtime, but the
  # build pipeline itself is verified.
  message(STATUS
    "liblynxtron.so not staged (${LYNXTRON_PREBUILT} missing). "
    "Building shell HAP without native lib. Run `ninja -C "
    "out/harmony_arm64_Release lynxtron_app` after WI-036 wave-pic to "
    "produce the prebuilt and re-run hvigorw assembleHap.")
endif()
