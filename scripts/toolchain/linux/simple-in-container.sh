#!/bin/bash
# Copyright (c) 2025 Lukas Burgholzer
# All rights reserved.
#
# SPDX-License-Identifier: MIT
#
# Licensed under the MIT License

# Usage: ./scripts/toolchain/linux/simple-build.sh -t 21.1.0 [-p /path/to/llvm-install]

set -euo pipefail

: "${REF:?REF (commit) not set}"
: "${PREFIX:?PREFIX not set}"

cd /work

# Main LLVM setup function
build_llvm() {
  local ref=$1
  local prefix=$2

  local llvm_dir="$prefix/lib/cmake/llvm"
  local mlir_dir="$prefix/lib/cmake/mlir"

  # Check if LLVM is already installed
  if [ -d "$llvm_dir" ] && [ -d "$mlir_dir" ]; then
    echo "Found existing LLVM/MLIR install at $prefix. Skipping build."
    append_dirs_to_env "$prefix"
    return
  fi

  echo "Building LLVM/MLIR $ref into $prefix..."

  # Install dependencies if needed (for Ubuntu/Debian)
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y cmake ninja-build build-essential zlib1g-dev
  fi

  # Clone LLVM project
  git clone --depth 1 https://github.com/llvm/llvm-project.git --branch "$ref" "$prefix/llvm-project"

  pushd "$prefix/llvm-project" > /dev/null

  # Build LLVM
  build_dir="build_llvm"
  cmake -S llvm -B "$build_dir" \
    -DLLVM_ENABLE_PROJECTS=mlir \
    -DLLVM_BUILD_EXAMPLES=OFF \
    -DLLVM_TARGETS_TO_BUILD=Native \
    -DCMAKE_BUILD_TYPE=Release \
    -DLLVM_BUILD_TESTS=OFF \
    -DLLVM_INCLUDE_TESTS=OFF \
    -DLLVM_INCLUDE_EXAMPLES=OFF \
    -DLLVM_ENABLE_ASSERTIONS=ON \
    -DLLVM_INSTALL_UTILS=ON \
    -DLLVM_ENABLE_RTTI=ON \
    -DCMAKE_INSTALL_PREFIX="$prefix"

  # Build tablegen first to avoid header generation issues
  cmake --build "$build_dir" --target mlir-tblgen --config Release
  # Then build everything else
  cmake --build "$build_dir" --target install --config Release

  popd > /dev/null
}

# Build LLVM
build_llvm "$REF" "$PREFIX"

# Variables
WORKDIR=$(pwd)
UNAME_ARCH=$(uname -m)

# Map architecture to LLVM target
UNAME_ARCH=$(uname -m)
if [[ "$UNAME_ARCH" == "x86_64" ]]; then
  HOST_TARGET="X86"
elif [[ "$UNAME_ARCH" == "aarch64" || "$UNAME_ARCH" == "arm64" ]]; then
  HOST_TARGET="AArch64"
else
  echo "Unsupported architecture on Linux: ${UNAME_ARCH}. Only x86_64 and aarch64 are supported." >&2
  exit 1
fi

# Prune non-essential tools
if [[ -d "$PREFIX/bin" ]]; then
  rm -f "$PREFIX/bin"/clang* "$PREFIX/bin"/clang-?* "$PREFIX/bin"/clang++* \
        "$PREFIX/bin"/clangd "$PREFIX/bin"/clang-format* "$PREFIX/bin"/clang-tidy* \
        "$PREFIX/bin"/lld* "$PREFIX/bin"/llvm-bolt "$PREFIX/bin"/perf2bolt 2>/dev/null || true
fi
rm -rf "$PREFIX/lib/clang" 2>/dev/null || true

# Strip binaries (use appropriate flags for Linux)
if command -v strip >/dev/null 2>&1; then
  find "$PREFIX/bin" -type f -executable -exec strip --strip-debug {} + 2>/dev/null || true
  find "$PREFIX/lib" -name "*.a" -exec strip --strip-debug {} + 2>/dev/null || true
fi

# Emit compressed archive (.tar.zst)
ART_DIR="$WORKDIR"
SAFE_TARGETS=${HOST_TARGET//;/_}
ARCHIVE_NAME="llvm-mlir_${REF}_linux_${UNAME_ARCH}_${SAFE_TARGETS}_opt.tar.zst"

if command -v zstd >/dev/null 2>&1; then
  ( cd "${PREFIX}" && tar -cf - . | zstd -T0 -19 -o "${ART_DIR}/${ARCHIVE_NAME}" ) || {
    echo "Error: Failed to create archive" >&2
    exit 1
  }
else
  ( cd "${PREFIX}" && tar --zstd -cf "${ART_DIR}/${ARCHIVE_NAME}" . ) || {
    echo "Error: Failed to create archive" >&2
    exit 1
  }
fi
