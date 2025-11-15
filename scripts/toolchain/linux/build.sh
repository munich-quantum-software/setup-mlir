#!/bin/bash
# Copyright (c) 2025 Lukas Burgholzer
# All rights reserved.
#
# SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception

# Linux wrapper: build and run manylinux_2_28 container to produce the MLIR toolchain
#
# Description:
#   Builds a manylinux_2_28 container image (arch-aware), mounts the repo and output directories,
#   then runs the in-container build script to produce the MLIR toolchain.
#
# Usage:
#   scripts/toolchain/linux/build.sh -r <ref> -p <install_prefix>
#     ref            Git ref or commit SHA (e.g., llvmorg-20.1.8 or 179d30f...)
#     install_prefix Absolute path on the host for the final install (also where archive is written)
#
# Outputs:
#   - Installs into <install_prefix>
#   - Creates <install_prefix>/llvm-mlir_<ref>_linux_<arch>_<host_target>.tar.zst

set -euo pipefail

# Parse arguments
while getopts "r:p:*" opt; do
  case $opt in
    r) REF="$OPTARG"
    ;;
    p) INSTALL_PREFIX="$OPTARG"
    ;;
    *) echo "Invalid option -$OPTARG" >&2
    exit 1
    ;;
  esac
done

# Check arguments
if [ -z "$REF" ]; then
  echo "Error: Ref (-r) is required"
  echo "Usage: $0 -r <ref> -p <installation directory>"
  exit 1
fi
if [ -z "${INSTALL_PREFIX:-}" ]; then
  echo "Error: Installation directory (-p) is required"
  echo "Usage: $0 -r <ref> -p <installation directory>"
  exit 1
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/../../.." && pwd)

ARCH=$(uname -m)
BASE_IMAGE="quay.io/pypa/manylinux_2_28_x86_64"
if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
  BASE_IMAGE="quay.io/pypa/manylinux_2_28_aarch64"
fi

IMG_TAG="llvm-mlir-manylinux-2_28:${ARCH}"
DOCKERFILE="$SCRIPT_DIR/Dockerfile"

# Build container image
sudo docker build --build-arg BASE_IMAGE="$BASE_IMAGE" -f "$DOCKERFILE" -t "$IMG_TAG" "$SCRIPT_DIR"

# Ensure output dir exists
mkdir -p "$INSTALL_PREFIX"

# Determine path to in-container script once mounted at /work
# If ROOT_DIR is mounted at /work, then SCRIPT_DIR becomes /work${REL_DIR}
REL_DIR="${SCRIPT_DIR#${ROOT_DIR}}"
IN_CONTAINER_SCRIPT="/work${REL_DIR}/in-container.sh"

# Build environment vars (only pass optional ones if provided)
ENV_ARGS=(-e HOME=/work -e REF="$REF" -e INSTALL_PREFIX="/out" \
  -e CMAKE_BUILD_PARALLEL_LEVEL="${CMAKE_BUILD_PARALLEL_LEVEL:-4}" )

# Run build inside container (privileged for perf)
sudo docker run --rm --privileged \
  -u $(id -u):$(id -g) \
  -v "$ROOT_DIR":/work:rw \
  -v "$INSTALL_PREFIX":/out:rw \
  "${ENV_ARGS[@]}" \
  "$IMG_TAG" \
  bash -euo pipefail "$IN_CONTAINER_SCRIPT"

echo "Linux build completed at $INSTALL_PREFIX"
