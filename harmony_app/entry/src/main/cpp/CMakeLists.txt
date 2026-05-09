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

if(NOT EXISTS "${LYNXTRON_PREBUILT}")
  message(WARNING
    "liblynxtron.so not found at ${LYNXTRON_PREBUILT}. "
    "Run `ninja -C out/harmony_arm64_Release lynxtron_app` from the "
    "repo root after WI-036 wave-pic flips the GN target to "
    "shared_library. The HAP build will fail to find the symbol "
    "until then.")
endif()

add_library(lynxtron SHARED IMPORTED)
set_target_properties(lynxtron
  PROPERTIES IMPORTED_LOCATION "${LYNXTRON_PREBUILT}")

# Re-export liblynxtron.so into the HAP libs/arm64-v8a/ directory so the
# OHOS app loader picks it up. CMake does the copy via a custom target
# that depends on the prebuilt path.
add_custom_target(copy_lynxtron_so ALL
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${LYNXTRON_PREBUILT}"
    "${CMAKE_LIBRARY_OUTPUT_DIRECTORY}/liblynxtron.so"
  DEPENDS "${LYNXTRON_PREBUILT}")
