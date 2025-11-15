# manylinux_2_28 builder image for optimized LLVM/MLIR (PGO + LTO)
#
# Purpose:
#   Minimal image to build LLVM/MLIR inside a manylinux_2_28 environment. Used by
#   scripts/toolchain/linux/build.sh to produce portable Linux binaries with PGO and LTO.
#
# Inputs:
#   ARG BASE_IMAGE  Base manylinux_2_28 image (arch-specific), provided by wrapper.
#
# Notes:
#   - The container runs without an entrypoint; the wrapper script binds /work and /out,
#     sets env, and invokes scripts/toolchain/linux/in-container.sh.

ARG BASE_IMAGE=quay.io/pypa/manylinux_2_28_x86_64
FROM ${BASE_IMAGE}

# Install build dependencies
RUN yum -y update && \
    yum -y install clang git llvm zstd && \
    yum clean all && rm -rf /var/cache/yum

ENV PATH=/usr/bin:$PATH

WORKDIR /work

# Expect to mount /work with scripts and output paths
# This image intentionally has no entrypoint; scripts will run with `docker run`.
