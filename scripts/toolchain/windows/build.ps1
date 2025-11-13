# Copyright (c) 2025 Lukas Burgholzer
# All rights reserved.
#
# SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception

# Usage: pwsh scripts/toolchain/windows/build.ps1 -ref <ref> -install_prefix <installation directory>

param(
    [Parameter(Mandatory=$true)]
    [string]$ref,
    [Parameter(Mandatory=$true)]
    [string]$install_prefix
)

$ErrorActionPreference = "Stop"

# Detect architecture
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture

# Determine target
switch ($arch) {
    x64 {
        $host_target = "X86"
    }
    arm64 {
        $host_target = "AArch64"
    }
    default {
        Write-Error "Unsupported architecture on Windows: $arch. Only x64 and arm64 are supported."; exit 1
    }
}

Write-Host "Building LLVM/MLIR $ref into $install_prefix..."

# Clone LLVM project
$repo_dir = Join-Path $PWD "llvm-project"
if (Test-Path $repo_dir) { Remove-Item -Recurse -Force $repo_dir }
git clone --depth 1 https://github.com/llvm/llvm-project.git --branch $ref $repo_dir

# Change to repo directory
pushd $repo_dir > $null

# Build LLVM
try {
    $build_dir = 'build_llvm'
    $cmake_args = @(
        '-S', 'llvm',
        '-B', $build_dir,
        '-G', 'Visual Studio 17 2022',
        '-DCMAKE_BUILD_TYPE=Release',
        "-DCMAKE_INSTALL_PREFIX=$install_prefix",
        '-DLLVM_BUILD_EXAMPLES=OFF',
        '-DLLVM_BUILD_TESTS=OFF',
        '-DLLVM_ENABLE_ASSERTIONS=ON',
        '-DLLVM_ENABLE_PROJECTS=mlir',
        '-DLLVM_ENABLE_RTTI=ON',
        '-DLLVM_INCLUDE_EXAMPLES=OFF',
        '-DLLVM_INCLUDE_TESTS=OFF',
        '-DLLVM_INSTALL_UTILS=ON',
        "-DLLVM_TARGETS_TO_BUILD=$host_target"
    )
    cmake @cmake_args

    cmake --build $build_dir --target install --config Release
} finally {
    # Return to original directory
    popd > $null
}

# Remove non-essential binaries from bin directory
$install_bin = Join-Path $install_prefix "bin"
if (Test-Path $install_bin) {
    $patterns = @(
        'clang*.exe',
        'clang-?*.exe',
        'clang++*.exe',
        'clangd.exe',
        'clang-format*.exe',
        'clang-tidy*.exe',
        'lld*.exe',
        'llvm-bolt.exe',
        'perf2bolt.exe'
    )
    Get-ChildItem -Path $install_bin -Include $patterns -File | Remove-Item -ErrorAction SilentlyContinue
}

# Remove lib/clang directory
$install_lib_clang = Join-Path $install_prefix "lib\clang"
if (Test-Path $install_lib_clang) {
    Remove-Item -Path $install_lib_clang -Recurse -Force -ErrorAction SilentlyContinue
}

# Check for zstd availability
$zstd_available = $false
try {
    & zstd --version | Out-Null
    $zstd_available = $true
} catch {
    $zstd_available = $false
}

# Define archive variables
$archive_name = "llvm-mlir_$($ref)_windows_$($arch)_$($host_target).tar.zst"
$archive_path = Join-Path $PWD $archive_name

# Change to installation directory
pushd $install_prefix > $null

# Emit compressed archive (.tar.zst)
try {
    if ($zstd_available) {
        & tar -cf - . | & zstd -T0 -19 -o $archive_path
    } else {
        & tar --zstd -cf $archive_path .
    }
} catch {
    Write-Error "Error: Failed to create archive: $($_.Exception.Message)"
    exit 1
} finally {
    # Return to original directory
    popd > $null
}
