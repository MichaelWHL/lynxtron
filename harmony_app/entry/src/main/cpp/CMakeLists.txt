# The main library is produced by the GN build at the repository root. Adjust
# LYNXTRON_GN_OUT_DIR when using a non-default output directory.

cmake_minimum_required(VERSION 3.5.0)
project(lynxtron_hap)

set(LYNXTRON_GN_OUT_DIR
  "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../out/harmony_arm64_Release"
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
  message(FATAL_ERROR
    "liblynxtron.so is missing at ${LYNXTRON_PREBUILT}. Run `ninja -C "
    "out/harmony_arm64_Release lynxtron_app` before building the HAP.")
endif()
