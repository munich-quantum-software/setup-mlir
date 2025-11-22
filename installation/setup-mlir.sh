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

# Usage: ./setup-mlir.sh -t <setup-mlir tag> -p <installation directory> [-a <GitHub token>]

set -euo pipefail

# Parse arguments
while getopts ":t:p:a:" opt; do
  case $opt in
    t) SETUP_MLIR_TAG="$OPTARG"
    ;;
    p) INSTALL_PREFIX="$OPTARG"
    ;;
    a) GITHUB_TOKEN="$OPTARG"
    ;;
    \?) echo "Error: Invalid option -$OPTARG" >&2; exit 1
    ;;
  esac
done

# Check arguments
if [ -z "${SETUP_MLIR_TAG:-}" ]; then
  echo "Error: setup-mlir tag (-t) is required" >&2
  echo "Usage: $0 -t <setup-mlir tag> -p <installation directory>" >&2
  exit 1
fi
if [ -z "${INSTALL_PREFIX:-}" ]; then
  echo "Error: Installation directory (-p) is required" >&2
  echo "Usage: $0 -t <setup-mlir tag> -p <installation directory>" >&2
  exit 1
fi

# Check if installation directory exists
if [ ! -d "$INSTALL_PREFIX" ]; then
  echo "Error: Installation directory $INSTALL_PREFIX does not exist." >&2
  exit 1
fi

# Check if zstd is installed
if ! command -v zstd >/dev/null 2>&1; then
  echo "Error: zstd not found. Please install zstd." >&2
  exit 1
fi

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

# Determine download URL
RELEASE_URL="https://api.github.com/repos/munich-quantum-software/setup-mlir/releases/tags/${SETUP_MLIR_TAG}"
RELEASE_JSON=$(curl -fL \
                    -H "Accept: application/vnd.github+json" \
                    ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
                    -H "X-GitHub-Api-Version: 2022-11-28" \
                    "$RELEASE_URL")

ASSETS_URL=$(echo "$RELEASE_JSON" | jq -r '.assets_url')
ASSETS_JSON=$(curl -fL \
                   -H "Accept: application/vnd.github+json" \
                   ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
                   -H "X-GitHub-Api-Version: 2022-11-28" \
                   "$ASSETS_URL")

DOWNLOAD_URLS=$(echo "$ASSETS_JSON" | jq -r '.[].browser_download_url')

if [[ "$PLATFORM" == "linux" && "$ARCH_SUFFIX" == "x86_64" ]]; then
  DOWNLOAD_URL=$(echo "$DOWNLOAD_URLS" | grep '.*_linux_.*_X86.tar.zst')
elif [[ "$PLATFORM" == "linux" && "$ARCH_SUFFIX" == "arm64" ]]; then
  DOWNLOAD_URL=$(echo "$DOWNLOAD_URLS" | grep '.*_linux_.*_AArch64.tar.zst')
elif [[ "$PLATFORM" == "macos" && "$ARCH_SUFFIX" == "x86_64" ]]; then
  DOWNLOAD_URL=$(echo "$DOWNLOAD_URLS" | grep '.*_macos_.*_X86.tar.zst')
elif [[ "$PLATFORM" == "macos" && "$ARCH_SUFFIX" == "arm64" ]]; then
  DOWNLOAD_URL=$(echo "$DOWNLOAD_URLS" | grep '.*_macos_.*_AArch64.tar.zst')
else
  echo "Unsupported platform/architecture combination: ${PLATFORM}/${ARCH_SUFFIX}" >&2
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
zstd -d "asset.tar.zst" --output-dir-flat .
tar -xf "asset.tar"

# Clean up
rm -f "asset.tar.zst"
rm -f "asset.tar"

# Return to original directory
popd > /dev/null

# Output instructions
echo "MLIR toolchain has been installed"
echo "Run the following commands to set up your environment:"
echo "  export LLVM_DIR=$INSTALL_PREFIX/lib/cmake/llvm"
echo "  export MLIR_DIR=$INSTALL_PREFIX/lib/cmake/mlir"
echo "  export PATH=$INSTALL_PREFIX/bin:\$PATH"
