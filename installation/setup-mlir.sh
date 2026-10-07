#!/bin/bash
# Copyright (c) 2025 - 2026 Munich Quantum Software Company GmbH
# Copyright (c) 2025 - 2026 Chair for Design Automation, TUM
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

# Usage: ./setup-mlir.sh -v <LLVM version> -p <installation directory> [-a ON|OFF]

set -euo pipefail

ASSERTIONS=ON
while getopts ":v:p:a:" opt; do
  case $opt in
    v) LLVM_VERSION="$OPTARG" ;;
    p) INSTALL_PREFIX="$OPTARG" ;;
    a) ASSERTIONS="$OPTARG" ;;
    :) echo "Error: Option -$OPTARG requires an argument" >&2; exit 1 ;;
    \?) echo "Error: Invalid option -$OPTARG" >&2; exit 1 ;;
  esac
done

if [[ -z "${LLVM_VERSION:-}" || -z "${INSTALL_PREFIX:-}" ]]; then
  echo "Usage: $0 -v <LLVM version> -p <installation directory> [-a ON|OFF]" >&2
  exit 1
fi
if [[ "$ASSERTIONS" != ON && "$ASSERTIONS" != OFF ]]; then
  echo "Error: Assertions (-a) must be ON or OFF." >&2
  exit 1
fi
LLVM_VERSION=$(printf '%s' "$LLVM_VERSION" | tr '[:upper:]' '[:lower:]')
if [[ "$LLVM_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  VERSION_PATTERN="$LLVM_VERSION\""
elif [[ "$LLVM_VERSION" =~ ^[0-9a-f]{7,40}$ ]]; then
  VERSION_PATTERN="$LLVM_VERSION"
else
  echo "Error: Invalid LLVM version: $LLVM_VERSION. Expected X.Y.Z or a commit hash (minimum 7 characters)." >&2
  exit 1
fi

OS=$(uname -s)
ARCH=$(uname -m)
case "$OS" in
  Linux) PLATFORM=linux ;;
  Darwin) PLATFORM=macos ;;
  *) echo "Error: Unsupported OS: $OS" >&2; exit 1 ;;
esac
case "$ARCH" in
  x86_64) ARCHITECTURE=x86 ;;
  arm64|aarch64) ARCHITECTURE=aarch64 ;;
  *) echo "Error: Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac
if [[ "$PLATFORM" == macos && "$ARCHITECTURE" != aarch64 ]]; then
  echo "Error: macOS requires AArch64 architecture." >&2
  exit 1
fi

# Checkout and source-archive installers use the adjacent manifest; standalone scripts use main.
MANIFEST_FILE="$(dirname "${BASH_SOURCE[0]:-}")/../version-manifest.json"
if [[ -n "${BASH_SOURCE[0]:-}" && -f "$MANIFEST_FILE" ]]; then
  MANIFEST_JSON=$(cat "$MANIFEST_FILE")
else
  MANIFEST_JSON=$(curl -fsSL https://raw.githubusercontent.com/munich-quantum-software/setup-mlir/main/version-manifest.json)
fi

# The generated manifest has flat objects with one field per line.
if ! ENTRY=$(awk -v RS='}' -v platform="$PLATFORM" -v architecture="$ARCHITECTURE" -v version="$VERSION_PATTERN" '
  index($0, "\"platform\": \"" platform "\"") &&
  index($0, "\"architecture\": \"" architecture "\"") &&
  index($0, "\"version\": \"" version) { print; matches++ }
  END { exit matches != 1 }
' <<< "$MANIFEST_JSON"); then
  echo "Error: Expected one release with LLVM $LLVM_VERSION for $PLATFORM/$ARCHITECTURE." >&2
  exit 1
fi
LLVM_FIELD=download_url
if [[ "$ASSERTIONS" == OFF ]]; then
  LLVM_FIELD=noassert_download_url
fi
LLVM_URL=$(sed -n "s/^[[:space:]]*\"$LLVM_FIELD\": \"\([^\"]*\)\".*/\1/p" <<< "$ENTRY")
ZSTD_URL=$(sed -n 's/^[[:space:]]*"zstd_download_url": "\([^"]*\)".*/\1/p' <<< "$ENTRY")
if [[ -z "$LLVM_URL" || -z "$ZSTD_URL" ]]; then
  echo "Error: LLVM $LLVM_VERSION for $PLATFORM/$ARCHITECTURE with assertions=$ASSERTIONS is unavailable." >&2
  exit 1
fi

command -v tar >/dev/null
mkdir -p "$INSTALL_PREFIX"
INSTALL_PREFIX="$(cd "$INSTALL_PREFIX" && pwd -P)"
pushd "$INSTALL_PREFIX" > /dev/null

curl -fL -o zstd.tar.gz "$ZSTD_URL"
tar -xzf zstd.tar.gz
chmod +x zstd
curl -fL -o llvm.tar.zst "$LLVM_URL"
./zstd -d --long=31 llvm.tar.zst --stdout | tar -x
rm -f zstd.tar.gz llvm.tar.zst zstd
popd > /dev/null

echo "MLIR toolchain has been installed."
echo "Run the following commands to set up your environment:"
echo "  export LLVM_DIR=$INSTALL_PREFIX/lib/cmake/llvm"
echo "  export MLIR_DIR=$INSTALL_PREFIX/lib/cmake/mlir"
echo "  export PATH=$INSTALL_PREFIX/bin:\$PATH"
