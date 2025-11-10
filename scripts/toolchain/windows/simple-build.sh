#!/bin/bash
set -e

# Usage: ./scripts/toolchain/windows/simple-build.sh -t 21.1.0 [-p /path/to/llvm-install]

# Default values
INSTALL_PREFIX="${GITHUB_WORKSPACE}/llvm-install"

# Parse arguments
while getopts "t:p:*" opt; do
  case $opt in
    t) TAG="$OPTARG"
    ;;
    p) INSTALL_PREFIX="$OPTARG"
    ;;
    *) echo "Invalid option -$OPTARG" >&2
    exit 1
    ;;
  esac
done

# Check for required tag argument
if [ -z "$TAG" ]; then
  echo "Error: Tag (-t) is required"
  echo "Usage: $0 -t <tag> [-p /path/to/llvm-install]"
  exit 1
fi

# Main LLVM setup function
build_llvm() {
  local tag=$1
  local prefix=$2

  local llvm_dir="$prefix/lib/cmake/llvm"
  local mlir_dir="$prefix/lib/cmake/mlir"

  # Check if LLVM is already installed
  if [ -d "$llvm_dir" ] && [ -d "$mlir_dir" ]; then
    echo "Found existing LLVM/MLIR install at $prefix. Skipping build."
    append_dirs_to_env "$prefix"
    return
  fi

  echo "Building LLVM/MLIR $tag into $prefix..."

  # Clone LLVM project
  rm -rf "$prefix"
  mkdir -p "$prefix"
  git clone --depth 1 https://github.com/llvm/llvm-project.git --branch "llvmorg-$tag" "$prefix/llvm-project"

  pushd "$prefix/llvm-project" > /dev/null

  # Build LLVM
  build_dir="build_llvm"

  # Use Visual Studio generator and set Windows-specific options
  cmake -S llvm -B "$build_dir" -G "Visual Studio 17 2022" \
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
    -DLLVM_ENABLE_ZLIB=OFF \
    -DLLVM_ENABLE_TERMINFO=OFF \
    -DCMAKE_INSTALL_PREFIX="$prefix"

  # Build tablegen first to avoid header generation issues
  cmake --build "$build_dir" --target mlir-tblgen --config Release
  # Then build everything else
  cmake --build "$build_dir" --target install --config Release

  popd > /dev/null
}

# Build LLVM
build_llvm "$TAG" "$INSTALL_PREFIX"

# Variables
WORKDIR=$(pwd)
REF="$TAG"
PROCESSOR_ARCHITECTURE=${PROCESSOR_ARCHITECTURE:-AMD64}  # Windows env var

# Map Windows architecture to LLVM target
case "$PROCESSOR_ARCHITECTURE" in
  AMD64)
    HOST_TARGET="X86"
    ARCH="x86_64"
    ;;
  ARM64)
    HOST_TARGET="AArch64"
    ARCH="arm64"
    ;;
  *)
    echo "Unsupported architecture on Windows: ${PROCESSOR_ARCHITECTURE}. Only AMD64 and ARM64 are supported." >&2
    exit 1
    ;;
esac

# Prune non-essential tools - use Windows extensions
if [[ -d "$INSTALL_PREFIX/bin" ]]; then
  rm -f "$INSTALL_PREFIX/bin"/clang*.exe "$INSTALL_PREFIX/bin"/clang-?*.exe "$INSTALL_PREFIX/bin"/clang++*.exe \
        "$INSTALL_PREFIX/bin"/clangd.exe "$INSTALL_PREFIX/bin"/clang-format*.exe "$INSTALL_PREFIX/bin"/clang-tidy*.exe \
        "$INSTALL_PREFIX/bin"/lld*.exe "$INSTALL_PREFIX/bin"/llvm-bolt.exe "$INSTALL_PREFIX/bin"/perf2bolt.exe 2>/dev/null || true
fi
rm -rf "$INSTALL_PREFIX/lib/clang" 2>/dev/null || true

# Emit compressed archive (.tar.zst)
ART_DIR="$WORKDIR"
SAFE_TARGETS=${HOST_TARGET//;/_}
ARCHIVE_NAME="llvm-mlir_${REF}_windows_${ARCH}_${SAFE_TARGETS}_opt.tar.zst"

# Check for tar and zstd - both should be available in Git Bash
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
