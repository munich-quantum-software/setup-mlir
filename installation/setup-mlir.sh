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

# Helper function to fetch GitHub releases JSON
fetch_releases_json() {
  local url=$1
  curl -fsSL \
    -H "Accept: application/vnd.github+json" \
    ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$url"
}

# Helper function to find asset URL in releases JSON
find_asset_url() {
  local releases_json=$1
  local pattern=$2
  local version_pattern=$3

  if [ -n "$version_pattern" ]; then
    # Filter by version pattern first (for LLVM assets)
    echo "$releases_json" | \
      grep -o '"browser_download_url": "[^"]*"' | \
      sed 's/"browser_download_url": "//;s/"$//' | \
      grep -F "$version_pattern" | \
      grep -E "$pattern" | \
      head -n 1
  else
    # No version filtering (for zstd assets)
    echo "$releases_json" | \
      grep -o '"browser_download_url": "[^"]*"' | \
      sed 's/"browser_download_url": "//;s/"$//' | \
      grep -E "$pattern" | \
      head -n 1
  fi
}

# Helper function to download file from URL
download_file() {
  local url=$1
  local output_file=$2

  echo "Downloading from $url..."
  if ! curl -fL -o "$output_file" "$url"; then
    echo "Error: Download failed." >&2
    exit 1
  fi
}

# Fetch releases JSON once
RELEASES_URL="https://api.github.com/repos/munich-quantum-software/portable-mlir-toolchain/releases?per_page=100"
RELEASES_JSON=$(fetch_releases_json "$RELEASES_URL")

# Determine asset patterns based on platform/architecture
if [[ "$PLATFORM" == "linux" && "$ARCH_SUFFIX" == "x86_64" ]]; then
  LLVM_PATTERN="_linux_x86_64_X86\.tar\.zst"
  ZSTD_PATTERN="zstd-[^/]*_linux_x86_64_X86\.tar\.gz$"
elif [[ "$PLATFORM" == "linux" && "$ARCH_SUFFIX" == "arm64" ]]; then
  LLVM_PATTERN="_linux_aarch64_AArch64\.tar\.zst"
  ZSTD_PATTERN="zstd-[^/]*_linux_aarch64_AArch64\.tar\.gz$"
elif [[ "$PLATFORM" == "macos" && "$ARCH_SUFFIX" == "x86_64" ]]; then
  LLVM_PATTERN="_macos_x86_64_X86\.tar\.zst"
  ZSTD_PATTERN="zstd-[^/]*_macos_x86_64_X86\.tar\.gz$"
elif [[ "$PLATFORM" == "macos" && "$ARCH_SUFFIX" == "arm64" ]]; then
  LLVM_PATTERN="_macos_arm64_AArch64\.tar\.zst"
  ZSTD_PATTERN="zstd-[^/]*_macos_arm64_AArch64\.tar\.gz$"
else
  echo "Unsupported platform/architecture combination: ${PLATFORM}/${ARCH_SUFFIX}" >&2
  exit 1
fi

# Download zstd binary
echo "Downloading zstd binary..."
ZSTD_URL=$(find_asset_url "$RELEASES_JSON" "$ZSTD_PATTERN" "")

# If not found, try the latest release
if [ -z "$ZSTD_URL" ]; then
  echo "zstd not found in LLVM version release, trying latest release..."
  LATEST_JSON=$(fetch_releases_json "https://api.github.com/repos/munich-quantum-software/portable-mlir-toolchain/releases/latest")

  ZSTD_URL=$(find_asset_url "$LATEST_JSON" "$ZSTD_PATTERN" "")

  if [ -z "$ZSTD_URL" ]; then
    echo "Error: No zstd binary found for ${PLATFORM}/${ARCH_SUFFIX}." >&2
    exit 1
  fi
fi

download_file "$ZSTD_URL" "zstd.tar.gz"

# Extract zstd binary
echo "Extracting zstd binary..."
if ! tar -xzf "zstd.tar.gz"; then
  echo "Error: Failed to extract zstd binary." >&2
  exit 1
fi
rm -f "zstd.tar.gz"

# zstd archive contains a single executable file
ZSTD_BIN="./zstd"
if [ ! -f "$ZSTD_BIN" ]; then
  echo "Error: zstd executable not found in extracted archive." >&2
  exit 1
fi

# Get the top-level extraction directory (relative to current dir)
# The zstd archive extracts to something like ./zstd-1.5.7/bin/zstd
# We want to store the top-level dir (zstd-1.5.7) for cleanup
ZSTD_EXTRACT_DIR=$(echo "$ZSTD_BIN" | sed 's|^\./||' | cut -d/ -f1)

# Convert to absolute path after storing the relative extract dir
ZSTD_BIN=$(realpath "$ZSTD_BIN")

# Ensure zstd is executable
chmod +x "$ZSTD_BIN"

# Download LLVM distribution
echo "Downloading LLVM distribution..."
LLVM_URL=$(find_asset_url "$RELEASES_JSON" "$LLVM_PATTERN" "$MATCH_PATTERN")

if [ -z "$LLVM_URL" ]; then
  echo "Error: No release with LLVM $LLVM_VERSION found for ${PLATFORM}/${ARCH_SUFFIX}." >&2
  exit 1
fi

download_file "$LLVM_URL" "llvm.tar.zst"

# Decompress and extract LLVM distribution
echo "Extracting LLVM distribution..."
if ! "$ZSTD_BIN" -d "llvm.tar.zst" --long=30 --stdout | tar -x; then
  echo "Error: Failed to extract LLVM distribution." >&2
  exit 1
fi

# Cleanup
rm -f "llvm.tar.zst"
# Remove zstd extraction directory (should be something like "zstd-1.5.7")
if [ -n "$ZSTD_EXTRACT_DIR" ] && [ "$ZSTD_EXTRACT_DIR" != "/" ] && [ "$ZSTD_EXTRACT_DIR" != "." ] && [ "$ZSTD_EXTRACT_DIR" != ".." ]; then
  rm -rf "$ZSTD_EXTRACT_DIR"
fi

# Return to original directory
popd > /dev/null

# Output instructions
echo "MLIR toolchain has been installed"
echo "Run the following commands to set up your environment:"
echo "  export LLVM_DIR=$INSTALL_PREFIX/lib/cmake/llvm"
echo "  export MLIR_DIR=$INSTALL_PREFIX/lib/cmake/mlir"
echo "  export PATH=$INSTALL_PREFIX/bin:\$PATH"
