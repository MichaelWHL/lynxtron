#!/bin/bash
#
# Lynxtron HarmonyOS HAP build script.
# Modeled after chromium132 (Huawei) hap_build_htbrowser.sh; uses the same
# /opt/compilers/ohos_tools/ toolchain layout.
#
# Usage:
#   ./build_hap.sh           # build unsigned hap (default)
#   ./build_hap.sh --signed  # also run b_sign_hap_release.sh
#
# Requires:
#   /opt/compilers/ohos_tools/commandline-tools-linux-x64-6.0.2.640/
#     command-line-tools/{hvigor/bin,ohpm/bin,bin,tool/node/bin}/
#   /opt/compilers/ohos_tools/jdk-17.0.6/
#   /opt/compilers/ohos_tools/tools/haps_signed/  (only for --signed)

set -e

OHOS_TOOLS=${OHOS_TOOLS:-/opt/compilers/ohos_tools}
OHOS_SDK_VERSION=${OHOS_SDK_VERSION:-commandline-tools-linux-x64-6.0.2.640}
HAP_SIGNED_DIR=${OHOS_TOOLS}/tools/haps_signed

# Java JDK
export JAVA_HOME=${OHOS_TOOLS}/jdk-17.0.6
export PATH=${JAVA_HOME}/bin:${PATH}
export CLASSPATH=.:${JAVA_HOME}/lib/dt.jar:${JAVA_HOME}/lib/tools.jar

# OHOS command-line tools
export DEVECO_SDK_HOME=${OHOS_TOOLS}/${OHOS_SDK_VERSION}/command-line-tools/sdk
export PATH=${DEVECO_SDK_HOME}:${PATH}
export PATH=${OHOS_TOOLS}/${OHOS_SDK_VERSION}/command-line-tools/bin:${PATH}
export PATH=${OHOS_TOOLS}/${OHOS_SDK_VERSION}/command-line-tools/ohpm/bin:${PATH}
export PATH=${OHOS_TOOLS}/${OHOS_SDK_VERSION}/command-line-tools/tool/node/bin:${PATH}
export PATH=${OHOS_TOOLS}/${OHOS_SDK_VERSION}/command-line-tools/hvigor/bin:${PATH}

# Repo paths
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LYNXTRON_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
GN_OUT_DIR=${LYNXTRON_ROOT}/out/harmony_arm64_Release
LIBS_DIR=${SCRIPT_DIR}/entry/libs/arm64-v8a

cd "${SCRIPT_DIR}"

# Stage prebuilt liblynxtron.so into entry/libs/arm64-v8a/ if it exists.
# (Once WI-036 wave-pic produces it; otherwise the hap will be assembled
#  without the native lib and lynxtron.start() will be unresolved at
#  runtime.)
mkdir -p "${LIBS_DIR}"
if [ -f "${GN_OUT_DIR}/liblynxtron.so" ]; then
  cp "${GN_OUT_DIR}/liblynxtron.so" "${LIBS_DIR}/"
  echo "[build_hap] staged liblynxtron.so ($(stat -c%s "${LIBS_DIR}/liblynxtron.so") bytes)"
else
  echo "[build_hap] WARNING: ${GN_OUT_DIR}/liblynxtron.so not found." \
       "HAP will be a shell without native code (wave-pic blocker)."
fi

# Configure registries (use Huawei mirrors so ohpm install can pull
# @ohos packages from inside CN; same as chromium132 hap_build flow).
npm config set registry=https://repo.huaweicloud.com/repository/npm/
npm config set @ohos:registry=https://repo.harmonyos.com/npm/
ohpm config set registry https://repo.harmonyos.com/ohpm/
ohpm config set strict_ssl false

# Refresh hvigor cache to avoid stale plugin state.
rm -rf ~/.hvigor

# Pull workspace + module deps.
ohpm install --all

# Build.
hvigorw clean --daemon
hvigorw --mode module -p product=default -p buildMode=release \
        assembleHap --analyze=normal --parallel --incremental --daemon

# Locate the unsigned hap.
HAP_OUT_DIR=${SCRIPT_DIR}/entry/build/default/outputs/default
UNSIGNED_HAP=${HAP_OUT_DIR}/entry-default-unsigned.hap
echo ""
echo "[build_hap] unsigned hap: ${UNSIGNED_HAP}"
ls -la "${UNSIGNED_HAP}" 2>/dev/null || echo "[build_hap] (not produced)"

# Optional signing (mirrors chromium132 flow).
if [ "$1" = "--signed" ]; then
  if [ ! -d "${HAP_SIGNED_DIR}" ]; then
    echo "[build_hap] ${HAP_SIGNED_DIR} not found, skipping signing."
    exit 0
  fi
  rm -f "${HAP_SIGNED_DIR}"/entry-default-*.hap
  cp "${UNSIGNED_HAP}" "${HAP_SIGNED_DIR}/entry-default-unsigned.hap"
  ( cd "${HAP_SIGNED_DIR}" && \
    ./a_generate_p7b_release.sh && \
    ./b_sign_hap_release.sh )
  cp "${HAP_SIGNED_DIR}/entry-default-signed.hap" \
     "${HAP_OUT_DIR}/lynxtron-default-signed.hap"
  echo ""
  echo "[build_hap] signed hap: ${HAP_OUT_DIR}/lynxtron-default-signed.hap"
fi
