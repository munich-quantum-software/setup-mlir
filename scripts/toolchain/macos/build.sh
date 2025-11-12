#!/bin/bash
#
# Usage: ./scripts/toolchain/macos/build.sh -r <ref> -p <installation directory>

set -euo pipefail

# Parse arguments
while getopts "r:p:*" opt; do
  case $opt in
    r) REF="$OPTARG"
    ;;
    p) INSTALL_PREFIX="$OPTARG"
    ;;
    *) echo "Invalid option -$OPTARG" >&2
    exit 1
    ;;
  esac
done

# Check arguments
if [ -z "$REF" ]; then
  echo "Error: Ref (-r) is required"
  echo "Usage: $0 -r <ref> -p <installation directory>"
  exit 1
fi
if [ -z "${INSTALL_PREFIX:-}" ]; then
  echo "Error: Installation directory (-p) is required"
  echo "Usage: $0 -r <ref> -p <installation directory>"
  exit 1
fi

# Determine architecture
UNAME_ARCH=$(uname -m)

# Determine target
if [[ "$UNAME_ARCH" == "arm64" || "$UNAME_ARCH" == "aarch64" ]]; then
  HOST_TARGET="AArch64"
elif [[ "$UNAME_ARCH" == "x86_64" ]]; then
  HOST_TARGET="X86"
else
  echo "Unsupported architecture on macOS: ${UNAME_ARCH}. Only x86_64 and arm64 are supported." >&2
  exit 1
fi

# Main LLVM setup function
build_llvm() {
  local ref=$1
  local prefix=$2

  echo "Building LLVM/MLIR $ref into $prefix..."

  # Clone LLVM project
  rm -rf "$prefix"
  mkdir -p "$prefix"
  git clone --depth 1 https://github.com/llvm/llvm-project.git --branch "$ref" "$prefix/llvm-project"

  pushd "$prefix/llvm-project" > /dev/null

  # Build LLVM
  build_dir="build_llvm"
  cmake -S llvm -B "$build_dir" \
    -DLLVM_ENABLE_PROJECTS=mlir \
    -DLLVM_BUILD_EXAMPLES=OFF \
    -DLLVM_TARGETS_TO_BUILD="$HOST_TARGET" \
    -DCMAKE_BUILD_TYPE=Release \
    -DLLVM_BUILD_TESTS=OFF \
    -DLLVM_INCLUDE_TESTS=OFF \
    -DLLVM_INCLUDE_EXAMPLES=OFF \
    -DLLVM_ENABLE_ASSERTIONS=ON \
    -DLLVM_INSTALL_UTILS=ON \
    -DLLVM_ENABLE_RTTI=ON \
    -DCMAKE_INSTALL_PREFIX="$prefix" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=${MACOSX_DEPLOYMENT_TARGET:-11.0}

  cmake --build "$build_dir" --target install --config Release

  popd > /dev/null
}

build_llvm "$REF" "$INSTALL_PREFIX"

# Prune non-essential tools
if [[ -d "$INSTALL_PREFIX/bin" ]]; then
  rm -f "$INSTALL_PREFIX/bin"/clang* "$INSTALL_PREFIX/bin"/clang-?* "$INSTALL_PREFIX/bin"/clang++* \
        "$INSTALL_PREFIX/bin"/clangd "$INSTALL_PREFIX/bin"/clang-format* "$INSTALL_PREFIX/bin"/clang-tidy* \
        "$INSTALL_PREFIX/bin"/lld* "$INSTALL_PREFIX/bin"/llvm-bolt "$INSTALL_PREFIX/bin"/perf2bolt 2>/dev/null || true
fi
rm -rf "$INSTALL_PREFIX/lib/clang" 2>/dev/null || true

# Strip binaries
if command -v strip >/dev/null 2>&1; then
  find "$INSTALL_PREFIX/bin" -type f -perm -111 -exec strip -S {} + 2>/dev/null || true
  find "$INSTALL_PREFIX/lib" -name "*.a" -exec strip -S {} + 2>/dev/null || true
fi

# Emit compressed archive (.tar.zst)
ART_DIR=$(pwd)
ARCHIVE_NAME="llvm-mlir_${REF}_macos_${UNAME_ARCH}_${HOST_TARGET}.tar.zst"
if command -v gtar >/dev/null 2>&1; then TAR=gtar; else TAR=tar; fi
if command -v zstd >/dev/null 2>&1; then
  ( cd "${INSTALL_PREFIX}" && $TAR -cf - . | zstd -T0 -19 -o "${ART_DIR}/${ARCHIVE_NAME}" )  || {
    echo "Error: Failed to create archive" >&2
    exit 1
  }
else
  ( cd "${INSTALL_PREFIX}" && $TAR --zstd -cf "${ART_DIR}/${ARCHIVE_NAME}" . ) || {
    echo "Error: Failed to create archive" >&2
    exit 1
  }
fi
