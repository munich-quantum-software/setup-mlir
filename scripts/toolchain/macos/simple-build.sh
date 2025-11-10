#!/bin/bash
set -e

# Usage: ./scripts/toolchain/macos/simple-build.sh -t 21.1.0 [-p /path/to/llvm-install]

# Default values
INSTALL_PREFIX="${GITHUB_WORKSPACE}/llvm-install"

# Parse arguments
while getopts "t:p:" opt; do
  case $opt in
    t) TAG="$OPTARG"
    ;;
    p) INSTALL_PREFIX="$OPTARG"
    ;;
    \?) echo "Invalid option -$OPTARG" >&2
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

  local build_dir="$prefix/llvm-project/build-llvm"

  local llvm_dir="$build_dir/lib/cmake/llvm"
  local mlir_dir="$build_dir/lib/cmake/mlir"

  # Check if LLVM is already installed
  if [ -d "$llvm_dir" ] && [ -d "$mlir_dir" ]; then
    echo "Found existing LLVM/MLIR install at $prefix. Skipping build."
    return
  fi

  echo "Building LLVM/MLIR $tag into $prefix..."

  # Clone LLVM project
  rm -rf "$prefix"
  mkdir -p "$prefix"
  git clone --depth 1 https://github.com/llvm/llvm-project.git --branch "llvmorg-$tag" "$prefix/llvm-project"

  pushd "$prefix/llvm-project" > /dev/null

  # Build LLVM
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

  cmake --build "$build_dir" --target install --config Release

  popd > /dev/null
}

# Build LLVM
build_llvm "$TAG" "$INSTALL_PREFIX"

# Variables
BUILD_DIR="$INSTALL_PREFIX/llvm-project/build-llvm"
REF="$TAG"
UNAME_ARCH=$(uname -m)
WORK_DIR=$(pwd)

if [[ "$UNAME_ARCH" == "arm64" || "$UNAME_ARCH" == "aarch64" ]]; then
  HOST_TARGET="AArch64"
elif [[ "$UNAME_ARCH" == "x86_64" ]]; then
  HOST_TARGET="X86"
else
  echo "Unsupported architecture on macOS: ${UNAME_ARCH}. Only x86_64 and arm64 are supported." >&2
  exit 1
fi

# Prune non-essential tools
if [[ -d "$BUILD_DIR/bin" ]]; then
  rm -f "$BUILD_DIR/bin"/clang* "$BUILD_DIR/bin"/clang-?* "$BUILD_DIR/bin"/clang++* \
        "$BUILD_DIR/bin"/clangd "$BUILD_DIR/bin"/clang-format* "$BUILD_DIR/bin"/clang-tidy* \
        "$BUILD_DIR/bin"/lld* "$BUILD_DIR/bin"/llvm-bolt "$BUILD_DIR/bin"/perf2bolt 2>/dev/null || true
fi
rm -rf "$BUILD_DIR/lib/clang" 2>/dev/null || true

# Strip binaries
if command -v strip >/dev/null 2>&1; then
  find "$BUILD_DIR/bin" -type f -perm -111 -exec strip -S {} + 2>/dev/null || true
  find "$BUILD_DIR/lib" -name "*.a" -exec strip -S {} + 2>/dev/null || true
fi

# Emit compressed archive (.tar.zst)
if command -v gtar >/dev/null 2>&1; then TAR=gtar; else TAR=tar; fi
ART_DIR="$WORK_DIR"
SAFE_TARGETS=${HOST_TARGET//;/_}
ARCHIVE_NAME="llvm-mlir_${REF}_macos_${UNAME_ARCH}_${SAFE_TARGETS}_opt.tar.zst"
if command -v zstd >/dev/null 2>&1; then
  ( cd "${INSTALL_PREFIX}" && $TAR -cf - . | zstd -T0 -19 -o "${ART_DIR}/${ARCHIVE_NAME}" ) || true
else
  ( cd "${INSTALL_PREFIX}" && $TAR --zstd -cf "${ART_DIR}/${ARCHIVE_NAME}" . ) || true
fi
