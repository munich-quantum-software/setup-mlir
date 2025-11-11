#!/bin/bash
# Copyright (c) 2025 Lukas Burgholzer
# All rights reserved.
#
# SPDX-License-Identifier: MIT
#
# Licensed under the MIT License

#!/bin/bash
set -e

# Usage: ./scripts/toolchain/windows/simple-build.sh -r llvmorg-21.1.0 -a AMD64 [-p /path/to/llvm-install]

# Default values
INSTALL_PREFIX="${GITHUB_WORKSPACE}/llvm-install"

# Parse arguments
while getopts "r:a:p:*" opt; do
  case $opt in
    r) REF="$OPTARG"
    ;;
    a) ARCH="$OPTARG"
    ;;
    p) INSTALL_PREFIX="$OPTARG"
    ;;
    *) echo "Invalid option -$OPTARG" >&2
    exit 1
    ;;
  esac
done

# Check for required ref argument
if [ -z "$REF" ]; then
  echo "Error: Ref (-r) is required"
  echo "Usage: $0 -r <ref> [-p /path/to/llvm-install]"
  exit 1
fi

# Check for required architecture argument
if [ -z "$ARCH" ]; then
  echo "Error: Architecture (-a) is required"
  echo "Usage: $0 -r <ref> -a <architecture> [-p /path/to/llvm-install]"
  exit 1
fi

# Determine target
case "$ARCH" in
  AMD64)
    HOST_TARGET="X86"
    ;;
  ARM64)
    HOST_TARGET="AArch64"
    ;;
  *)
    echo "Unsupported architecture on Windows: ${ARCH}. Only AMD64 and ARM64 are supported." >&2
    exit 1
    ;;
esac

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
    -DCMAKE_INSTALL_PREFIX="$prefix"

  cmake --build "$build_dir" --target install --config Release

  popd > /dev/null
}

# Build LLVM
build_llvm "$REF" "$INSTALL_PREFIX"

# Prune non-essential tools - use Windows extensions
if [[ -d "$INSTALL_PREFIX/bin" ]]; then
  rm -f "$INSTALL_PREFIX/bin"/clang*.exe "$INSTALL_PREFIX/bin"/clang-?*.exe "$INSTALL_PREFIX/bin"/clang++*.exe \
        "$INSTALL_PREFIX/bin"/clangd.exe "$INSTALL_PREFIX/bin"/clang-format*.exe "$INSTALL_PREFIX/bin"/clang-tidy*.exe \
        "$INSTALL_PREFIX/bin"/lld*.exe "$INSTALL_PREFIX/bin"/llvm-bolt.exe "$INSTALL_PREFIX/bin"/perf2bolt.exe 2>/dev/null || true
fi
rm -rf "$INSTALL_PREFIX/lib/clang" 2>/dev/null || true

# Emit compressed archive (.tar.zst)
ART_DIR=$(pwd)
SAFE_TARGETS=${HOST_TARGET//;/_}
ARCHIVE_NAME="llvm-mlir_${REF}_windows_${ARCH}_${SAFE_TARGETS}.tar.zst"
if command -v zstd >/dev/null 2>&1; then
  ( cd "${INSTALL_PREFIX}" && tar -cf - . | zstd -T0 -19 -o "${ART_DIR}/${ARCHIVE_NAME}" ) || {
    echo "Error: Failed to create archive" >&2
    exit 1
  }
else
  ( cd "${INSTALL_PREFIX}" && tar --zstd -cf "${ART_DIR}/${ARCHIVE_NAME}" . ) || {
    echo "Error: Failed to create archive" >&2
    exit 1
  }
fi
