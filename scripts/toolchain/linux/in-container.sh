#!/bin/bash
# Copyright (c) 2025 Munich Quantum Software Company GmbH
# Copyright (c) 2025 Chair for Design Automation, TUM
# All rights reserved.
#
# Licensed under the Apache License v2.0 with LLVM Exceptions (the "License"); you
# may not use this file except in compliance with the License. You may obtain a
# copy of the License at https://llvm.org/LICENSE.txt
#
# Unless required by applicable law or agreed to in writing, software distributed
# under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
# CONDITIONS OF ANY KIND, either express or implied. See the License for the
# specific language governing permissions and limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception

# Usage: ./scripts/toolchain/linux/build.sh -r llvmorg-21.1.0 [-p /path/to/llvm-install]

set -euo pipefail

: "${REF:?REF (commit) not set}"
: "${INSTALL_PREFIX:?INSTALL_PREFIX not set}"

cd /work

# Determine architecture
UNAME_ARCH=$(uname -m)

# Determine target
if [[ "$UNAME_ARCH" == "x86_64" ]]; then
  HOST_TARGET="X86"
elif [[ "$UNAME_ARCH" == "aarch64" || "$UNAME_ARCH" == "arm64" ]]; then
  HOST_TARGET="AArch64"
else
  echo "Unsupported architecture on Linux: ${UNAME_ARCH}. Only x86_64 and aarch64 are supported." >&2
  exit 1
fi

# Main LLVM setup function
build_llvm() {
  local ref=$1
  local INSTALL_PREFIX=$2

  echo "Building LLVM/MLIR $ref into $INSTALL_PREFIX..."

  # Fetch LLVM project source archive
  repo_dir="$PWD/llvm-project"
  rm -rf "$repo_dir"
  mkdir -p "$repo_dir"
  curl -fL --retry 5 --retry-delay 5 \
    "https://github.com/llvm/llvm-project/archive/${ref}.tar.gz" \
    | tar -xz --strip-components=1 -C "$repo_dir"

  # Change to repo directory
  pushd "$repo_dir" > /dev/null

  # Build LLVM
  build_dir="build_llvm"
  cmake -S llvm -B "$build_dir" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_COMPILER=$(which clang) \
    -DCMAKE_CXX_COMPILER=$(which clang++) \
    -DCMAKE_AR=$(which llvm-ar) \
    -DCMAKE_RANLIB=$(which llvm-ranlib) \
    -DCMAKE_INSTALL_PREFIX="$INSTALL_PREFIX" \
    -DLLVM_BUILD_EXAMPLES=OFF \
    -DLLVM_BUILD_TESTS=OFF \
    -DLLVM_ENABLE_ASSERTIONS=ON \
    -DLLVM_ENABLE_LTO=THIN \
    -DLLVM_ENABLE_PROJECTS=mlir \
    -DLLVM_ENABLE_RTTI=ON \
    -DLLVM_INCLUDE_EXAMPLES=OFF \
    -DLLVM_INCLUDE_TESTS=OFF \
    -DLLVM_INSTALL_UTILS=ON \
    -DLLVM_TARGETS_TO_BUILD="$HOST_TARGET"
  cmake --build "$build_dir" --target install --config Release

  # Return to original directory
  popd > /dev/null
}

build_llvm "$REF" "$INSTALL_PREFIX"

# Prune non-essential tools
if [[ -d "$INSTALL_PREFIX/bin" ]]; then
  rm -f "$INSTALL_PREFIX/bin/clang*" \
        "$INSTALL_PREFIX/bin/clang-?*" \
        "$INSTALL_PREFIX/bin/clang++*" \
        "$INSTALL_PREFIX/bin/clangd" \
        "$INSTALL_PREFIX/bin/clang-format*" \
        "$INSTALL_PREFIX/bin/clang-tidy*" \
        "$INSTALL_PREFIX/bin/lld*" \
        "$INSTALL_PREFIX/bin/llvm-bolt" \
        "$INSTALL_PREFIX/bin/perf2bolt" \
        2>/dev/null || true
fi
rm -rf "$INSTALL_PREFIX/lib/clang" 2>/dev/null || true

# Strip binaries
if command -v strip >/dev/null 2>&1; then
  find "$INSTALL_PREFIX/bin" -type f -executable -exec strip --strip-debug {} + 2>/dev/null || true
  find "$INSTALL_PREFIX/lib" -name "*.a" -exec strip --strip-debug {} + 2>/dev/null || true
fi

# Define archive variables
ARCHIVE_NAME="llvm-mlir_${REF}_linux_${UNAME_ARCH}_${HOST_TARGET}.tar.zst"
ARCHIVE_PATH="$(pwd)/${ARCHIVE_NAME}"

# Change to installation directory
pushd $INSTALL_PREFIX > /dev/null

# Emit compressed archive (.tar.zst)
if command -v zstd >/dev/null 2>&1; then
  ( tar -cf - . | zstd -T0 -19 -o "${ARCHIVE_PATH}" ) || {
    echo "Error: Failed to create archive" >&2
    exit 1
  }
else
  ( tar --zstd -cf "${ARCHIVE_PATH}" . ) || {
    echo "Error: Failed to create archive" >&2
    exit 1
  }
fi

# Return to original directory
popd > /dev/null
