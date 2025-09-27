#!/usr/bin/env bash
# Copyright (c) 2025 Lukas Burgholzer
# All rights reserved.
#
# SPDX-License-Identifier: MIT
#
# Licensed under the MIT License

#
# Linux (manylinux_2_28) LLVM/MLIR optimized toolchain builder (PGO + LTO)
#
# Description:
#   Runs inside a manylinux_2_28 container to build a two-stage optimized LLVM/MLIR toolchain:
#   - Stage1: instrumented build + tests to gather profiles
#   - Stage2: PGO + LTO final toolchain
#   Uses ccache, installs FileCheck (LLVM_INSTALL_UTILS), and emits a .tar.zst archive in /out.
#
# Usage (inside container; invoked by scripts/toolchain/linux/build.sh):
#   scripts/toolchain/linux/in-container.sh
#   Required env: REF, PREFIX
#     REF      Git ref/SHA (e.g., llvmorg-19.1.7 or 179d30f...)
#     PREFIX   Absolute path where the final toolchain will be installed
#
# Environment:
#   TARGETS                    LLVM_TARGETS_TO_BUILD (default: "X86;AArch64")
#   TOOLCHAIN_CLEAN=1          Wipe prior builds before building (default: 0)
#   TOOLCHAIN_STAGE_FROM/TO    Limit stages (e.g., 2 and 2 for Stage2 only)
#   TOOLCHAIN_HOST_TRIPLE      Override computed host triple
#   TOOLCHAIN_CPU_FLAGS        Extra CPU tuning (e.g., -march=haswell)
#   CCACHE_DIR                 Cache directory mounted from host (default: /work/.ccache)
#   CCACHE_*                   ccache knobs (COMPRESS, MAXSIZE, etc.)
#
# Outputs:
#   - Installs into $PREFIX
#   - Creates archive: /out/llvm-mlir_<ref>_linux_<arch>_<targets>_opt.tar.zst
#
# Examples (host invokes wrapper):
#   scripts/toolchain/linux/build.sh llvmorg-20.1.8 $PWD/llvm-install X86
#   TOOLCHAIN_STAGE_FROM=2 TOOLCHAIN_STAGE_TO=2 scripts/toolchain/linux/build.sh <sha> $PWD/llvm-install AArch64
#
set -euo pipefail

: "${REF:?REF (commit) not set}"
: "${PREFIX:?PREFIX not set}"
TARGETS_ENV=${TARGETS:-}
# Normalize 'auto' to empty so we compute from host
if [[ "${TARGETS_ENV:-}" == "auto" ]]; then TARGETS_ENV=""; fi

export DEBIAN_FRONTEND=noninteractive

# Enable modern GCC from gcc-toolset-14 if available (manylinux provides it)
if [[ -f /opt/rh/gcc-toolset-14/enable ]]; then
  source /opt/rh/gcc-toolset-14/enable
elif [[ -d /opt/rh/gcc-toolset-14/root/usr/bin ]]; then
  export PATH="/opt/rh/gcc-toolset-14/root/usr/bin:$PATH"
fi

cd /work
CLEAN=${TOOLCHAIN_CLEAN:-0}
STAGE_FROM=${TOOLCHAIN_STAGE_FROM:-1}
STAGE_TO=${TOOLCHAIN_STAGE_TO:-2}
if [[ "$CLEAN" == "1" ]]; then
  rm -rf llvm-project build_stage0 build_stage1 build_stage2 /tmp/pgoprof stage0-install stage1-install
fi
mkdir -p /work/pgoprof /work/pgoprof/raw

# Clone/update llvm-project at specific commit
if [[ -d llvm-project/.git ]]; then
  pushd llvm-project >/dev/null
  git remote set-url origin https://github.com/llvm/llvm-project.git || true
  if ! git checkout -f "$REF"; then
    git fetch --depth 1 origin "$REF" || git fetch --tags origin
    git checkout -f "$REF" || git checkout -f "FETCH_HEAD"
  fi
  popd >/dev/null
else
  git clone https://github.com/llvm/llvm-project.git
  pushd llvm-project >/dev/null
  if ! git checkout -f "$REF"; then
    git fetch --depth 1 origin "$REF" || git fetch --tags origin
    git checkout -f "$REF" || git checkout -f "FETCH_HEAD"
  fi
  popd >/dev/null
fi

# Install uv and lit (no venv)
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
uv tool install lit
LIT_BIN=$(which lit)

# Optional ccache
if command -v ccache >/dev/null 2>&1; then
  export CCACHE_DIR=${CCACHE_DIR:-/work/.ccache}
  mkdir -p "$CCACHE_DIR" || true
  export CCACHE_COMPRESS=1
  export CCACHE_COMPRESSLEVEL=${CCACHE_COMPRESSLEVEL:-19}
  export CCACHE_MAXSIZE=${CCACHE_MAXSIZE:-10G}
  CCACHE_ON=1
else
  CCACHE_ON=0
fi

# Host triple, CPU tuning, default TARGETS from host
UNAME_ARCH=$(uname -m)
if [[ "$UNAME_ARCH" == "x86_64" ]]; then
  CPU_FLAGS=${TOOLCHAIN_CPU_FLAGS:-"-march=x86-64-v2 -mtune=haswell"}
  HOST_TRIPLE_COMPUTED="x86_64-unknown-linux-gnu"
  HOST_TARGET="X86"
elif [[ "$UNAME_ARCH" == "aarch64" || "$UNAME_ARCH" == "arm64" ]]; then
  CPU_FLAGS=${TOOLCHAIN_CPU_FLAGS:-""}
  HOST_TRIPLE_COMPUTED="aarch64-unknown-linux-gnu"
  HOST_TARGET="AArch64"
else
  echo "Unsupported architecture on Linux: ${UNAME_ARCH}. Only x86_64 and aarch64 are supported." >&2
  exit 1
fi
HOST_TRIPLE=${TOOLCHAIN_HOST_TRIPLE:-$HOST_TRIPLE_COMPUTED}
if [[ -n "$TARGETS_ENV" ]]; then
  TARGETS="$TARGETS_ENV"
else
  TARGETS="$HOST_TARGET"
fi

# Common CMake args
COMMON_LLVM_ARGS=(
  -G Ninja
  -DCMAKE_BUILD_TYPE=Release
  -DLLVM_INCLUDE_TESTS=OFF -DLLVM_BUILD_TESTS=OFF
  -DLLVM_INCLUDE_EXAMPLES=OFF
  -DLLVM_ENABLE_ASSERTIONS=OFF
  -DLLVM_TARGETS_TO_BUILD="${TARGETS}"
  -DLLVM_ENABLE_ZSTD=ON
  -DLLVM_INSTALL_UTILS=ON
  -DLLVM_ENABLE_BINDINGS=OFF
  -DLLVM_HOST_TRIPLE=${HOST_TRIPLE}
)

# Use system GCC (prefer gcc-toolset-14 if enabled above)
export CC=${CC:-gcc}
export CXX=${CXX:-g++}

# Stage1: instrumented build with tests, collect .profraw via check-mlir
PGO_DIR=/work/pgoprof
RAW_DIR=$PGO_DIR/raw
mkdir -p "$RAW_DIR"
if (( STAGE_FROM <= 1 && 1 <= STAGE_TO )); then
  INSTR_FLAGS="-fprofile-generate -fprofile-dir=$RAW_DIR ${CPU_FLAGS}"

  cmake -S llvm-project/llvm -B build_stage1 \
    "${COMMON_LLVM_ARGS[@]}" \
    -DLLVM_INCLUDE_TESTS=ON -DLLVM_BUILD_TESTS=ON \
    -DLLVM_ENABLE_PROJECTS="mlir" \
    -DLLVM_ENABLE_LTO=OFF \
    -DCMAKE_C_COMPILER=${CC} -DCMAKE_CXX_COMPILER=${CXX} -DCMAKE_ASM_COMPILER=${CC} \
    -DCMAKE_C_FLAGS="$INSTR_FLAGS" -DCMAKE_CXX_FLAGS="$INSTR_FLAGS" \
    -DLLVM_EXTERNAL_LIT="$LIT_BIN" \
    -DLLVM_PARALLEL_LINK_JOBS=1 \
    -DCMAKE_INSTALL_PREFIX=/work/stage1-install

  cmake --build build_stage1 --config Release --target install
  # Run MLIR tests to generate .gcda
  cmake --build build_stage1 --config Release --target check-mlir || true
fi

# Free disk space before stage2
rm -rf build_stage1 2>/dev/null || true
rm -rf /work/stage1-install 2>/dev/null || true


# Stage2: final GCC PGO + LTO build
if (( STAGE_FROM <= 2 && 2 <= STAGE_TO )); then
  USE_FLAGS="-fprofile-use -fprofile-dir=$RAW_DIR -fprofile-correction ${CPU_FLAGS} -flto"
  cmake -S llvm-project/llvm -B build_stage2 \
    "${COMMON_LLVM_ARGS[@]}" \
    -DLLVM_INCLUDE_TESTS=OFF -DLLVM_BUILD_TESTS=OFF \
    -DLLVM_ENABLE_PROJECTS="mlir" \
    -DLLVM_ENABLE_LTO=ON \
    -DCMAKE_C_COMPILER=${CC} -DCMAKE_CXX_COMPILER=${CXX} -DCMAKE_ASM_COMPILER=${CC} \
    -DCMAKE_AR=gcc-ar -DCMAKE_RANLIB=gcc-ranlib -DCMAKE_NM=gcc-nm \
    -DCMAKE_C_FLAGS="$USE_FLAGS" -DCMAKE_CXX_FLAGS="$USE_FLAGS" \
    -DLLVM_EXTERNAL_LIT="$LIT_BIN" \
    -DLLVM_PARALLEL_LINK_JOBS=1 \
    -DCMAKE_INSTALL_PREFIX="${PREFIX}"

  cmake --build build_stage2 --config Release --target install
fi

# Prune any non-essential tools that may have slipped into the install (keep MLIR/LLVM libs & tools only)
if [[ -d "$PREFIX/bin" ]]; then
  rm -f "$PREFIX/bin"/clang* "$PREFIX/bin"/clang-?* "$PREFIX/bin"/clang++* \
        "$PREFIX/bin"/clangd "$PREFIX/bin"/clang-format* "$PREFIX/bin"/clang-tidy* \
        "$PREFIX/bin"/lld* "$PREFIX/bin"/llvm-bolt "$PREFIX/bin"/perf2bolt 2>/dev/null || true
fi
rm -rf "$PREFIX/lib/clang" 2>/dev/null || true

# Strip binaries and libs
if command -v strip >/dev/null 2>&1; then
  find "$PREFIX/bin" -type f -perm -111 -exec strip -s {} + 2>/dev/null || true
  find "$PREFIX/lib" \( -name "*.a" -o -name "*.so*" \) -exec strip -g {} + 2>/dev/null || true
fi

# Emit compressed archive (.tar.zst) into /out (max compression)
SAFE_TARGETS=${TARGETS//;/_}
ARCHIVE_NAME="llvm-mlir_${REF}_linux_${UNAME_ARCH}_${SAFE_TARGETS}_opt.tar.zst"
( cd "${PREFIX}" && tar -I 'zstd -T0 -19' -cf "/out/${ARCHIVE_NAME}" . ) || true

echo "Install completed at ${PREFIX} (incremental, GCC PGO, $( [[ $CCACHE_ON -eq 1 ]] && echo cache=ccache || echo no-cache ), Zstd, HOST_TRIPLE=${HOST_TRIPLE}, TARGETS=${TARGETS})"
echo "Archive: /out/${ARCHIVE_NAME}"
