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

# Usage: ./setup-mlir.sh -v <LLVM version> -p <installation directory> [-t <GitHub token>]

set -euo pipefail

# Parse arguments
while getopts ":v:p:t:" opt; do
  case $opt in
    v) LLVM_VERSION="$OPTARG" ;;
    p) INSTALL_PREFIX="$OPTARG" ;;
    t) GITHUB_TOKEN="$OPTARG" ;;
    \?) echo "Error: Invalid option -$OPTARG" >&2; exit 1 ;;
  esac
done

# Check arguments
if [ -z "${LLVM_VERSION:-}" ]; then
  echo "Error: LLVM version (-v) is required" >&2
  echo "Usage: $0 -v <LLVM version> -p <installation directory> [-t <GitHub token>]" >&2
  exit 1
fi
if [ -z "${INSTALL_PREFIX:-}" ]; then
  echo "Error: Installation directory (-p) is required" >&2
  echo "Usage: $0 -v <LLVM version> -p <installation directory> [-t <GitHub token>]" >&2
  exit 1
fi

# Check if tar is installed
if ! command -v tar >/dev/null 2>&1; then
  echo "Error: tar not found. Please install tar." >&2
  exit 1
fi

# Check if we can extract zstd archives
# Prefer tar with native zstd support, fallback to separate zstd command
USE_TAR_ZSTD=false
if tar --help 2>&1 | grep -q -- '--zstd'; then
  USE_TAR_ZSTD=true
elif ! command -v zstd >/dev/null 2>&1; then
  echo "Error: tar does not support --zstd and zstd command not found." >&2
  echo "Please install zstd or upgrade tar to a version with zstd support." >&2
  exit 1
fi

# Create installation directory if it does not exist
mkdir -p "$INSTALL_PREFIX"

# Change to installation directory
pushd "$INSTALL_PREFIX" > /dev/null

# Detect platform and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  linux) PLATFORM="linux" ;;
  darwin) PLATFORM="macos" ;;
  *) echo "Error: Unsupported OS: $OS" >&2; exit 1 ;;
esac
case "$ARCH" in
  x86_64) ARCH_SUFFIX="x86_64" ;;
  arm64|aarch64) ARCH_SUFFIX="arm64" ;;
  *) echo "Error: Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

# Determine whether version is version or commit SHA
if [[ "$LLVM_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  MATCH_PATTERN="llvm-mlir_llvmorg-${LLVM_VERSION}_"
elif [[ "$LLVM_VERSION" =~ ^[0-9a-f]{7,40}$ ]]; then
  MATCH_PATTERN="llvm-mlir_${LLVM_VERSION}"
else
  echo "Error: Invalid LLVM version format: $LLVM_VERSION. Must be a version (e.g., 21.1.8) or a commit SHA." >&2
  exit 1
fi

# Determine download URL
RELEASES_URL="https://api.github.com/repos/munich-quantum-software/portable-mlir-toolchain/releases?per_page=100"
RELEASES_JSON=$(curl -fsSL \
                     -H "Accept: application/vnd.github+json" \
                     ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
                     -H "X-GitHub-Api-Version: 2022-11-28" \
                     "$RELEASES_URL")

if [[ "$PLATFORM" == "linux" && "$ARCH_SUFFIX" == "x86_64" ]]; then
  ASSET_SUFFIX="_linux_.*_X86.tar.zst"
elif [[ "$PLATFORM" == "linux" && "$ARCH_SUFFIX" == "arm64" ]]; then
  ASSET_SUFFIX="_linux_.*_AArch64.tar.zst"
elif [[ "$PLATFORM" == "macos" && "$ARCH_SUFFIX" == "x86_64" ]]; then
  ASSET_SUFFIX="_macos_.*_X86.tar.zst"
elif [[ "$PLATFORM" == "macos" && "$ARCH_SUFFIX" == "arm64" ]]; then
  ASSET_SUFFIX="_macos_.*_AArch64.tar.zst"
else
  echo "Unsupported platform/architecture combination: ${PLATFORM}/${ARCH_SUFFIX}" >&2
  exit 1
fi

DOWNLOAD_URL=$(echo "$RELEASES_JSON" | \
  grep -o '"browser_download_url": "[^"]*"' | \
  grep -F "$MATCH_PATTERN" | \
  grep "$ASSET_SUFFIX" | \
  head -n 1 | \
  sed 's/"browser_download_url": "//;s/"$//')

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Error: No release with LLVM $LLVM_VERSION found for ${PLATFORM}/${ARCH_SUFFIX}." >&2
  exit 1
fi

# Download asset
echo "Downloading asset from $DOWNLOAD_URL..."
if ! curl -fL -o "asset.tar.zst" "$DOWNLOAD_URL"; then
  echo "Error: Download failed." >&2
  exit 1
fi

# Unpack archive
echo "Extracting archive..."
if [ "$USE_TAR_ZSTD" = true ]; then
  if ! tar --zstd -xf "asset.tar.zst"; then
    echo "Error: Failed to extract archive." >&2
    exit 1
  fi
  rm -f "asset.tar.zst"
else
  if ! zstd -d "asset.tar.zst" --output-dir-flat .; then
    echo "Error: Failed to decompress archive." >&2
    exit 1
  fi
  if ! tar -xf "asset.tar"; then
    echo "Error: Failed to extract archive." >&2
    exit 1
  fi
  rm -f "asset.tar.zst"
  rm -f "asset.tar"
fi

# Return to original directory
popd > /dev/null

# Output instructions
echo "MLIR toolchain has been installed"
echo "Run the following commands to set up your environment:"
echo "  export LLVM_DIR=$INSTALL_PREFIX/lib/cmake/llvm"
echo "  export MLIR_DIR=$INSTALL_PREFIX/lib/cmake/mlir"
echo "  export PATH=$INSTALL_PREFIX/bin:\$PATH"
