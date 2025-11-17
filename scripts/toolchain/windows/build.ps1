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

# Fetch LLVM project source archive
$repo_dir = Join-Path $PWD "llvm-project"
if (Test-Path $repo_dir) { Remove-Item -Recurse -Force $repo_dir }
New-Item -ItemType Directory -Path $repo_dir -Force | Out-Null
$archive_url = "https://github.com/llvm/llvm-project/archive/$ref.tar.gz"

# Download archive to a temporary file
$temp_archive = Join-Path ([IO.Path]::GetTempPath()) ("llvm-project-$($ref).tar.gz")
Write-Host "Downloading $archive_url to $temp_archive..."
Invoke-WebRequest -Uri $archive_url -OutFile $temp_archive

# Extract archive
Write-Host "Extracting archive into $repo_dir..."
tar -xzf $temp_archive --strip-components=1 -C $repo_dir

# Change to repo directory
pushd $repo_dir > $null

# Build LLD
$install_prefix_lld = Join-Path $install_prefix "lld"
try {
    $build_dir_lld = 'build_lld'
    $cmake_args_lld = @(
        '-S', 'llvm',
        '-B', $build_dir_lld,
        '-G', 'Visual Studio 17 2022',
        '-DCMAKE_BUILD_TYPE=Release',
        "-DCMAKE_INSTALL_PREFIX=$install_prefix_lld",
        '-DLLVM_BUILD_EXAMPLES=OFF',
        '-DLLVM_BUILD_TESTS=OFF',
        '-DLLVM_ENABLE_PROJECTS=lld',
        '-DLLVM_INCLUDE_EXAMPLES=OFF',
        '-DLLVM_INCLUDE_TESTS=OFF',
        "-DLLVM_TARGETS_TO_BUILD=$host_target"
    )
    cmake @cmake_args_lld

    cmake --build $build_dir_lld --target install --config Release
} catch {
    # Return to original directory
    popd > $null
}

$lld_path = Join-Path $install_prefix_lld "bin\lld-link.exe"

# Build LLVM
try {
    $build_dir = 'build_llvm'
    $cmake_args = @(
        '-S', 'llvm',
        '-B', $build_dir,
        '-G', 'Visual Studio 17 2022',
        '-DCMAKE_BUILD_TYPE=Release',
        "-DCMAKE_INSTALL_PREFIX=$install_prefix",
        "-DCMAKE_LINKER=$lld_path",
        '-DLLVM_BUILD_EXAMPLES=OFF',
        '-DLLVM_BUILD_TESTS=OFF',
        '-DLLVM_ENABLE_ASSERTIONS=ON',
        '-DLLVM_ENABLE_LTO=THIN',
        '-DLLVM_ENABLE_PROJECTS=mlir',
        '-DLLVM_ENABLE_RTTI=ON',
        '-DLLVM_INCLUDE_BENCHMARKS=OFF',
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

# Define archive variables
$archive_name = "llvm-mlir_$($ref)_windows_$($arch)_$($host_target).tar.zst"
$archive_path = Join-Path $PWD $archive_name

# Change to installation directory
pushd $install_prefix > $null

# Emit compressed archive (.tar.zst)
try {
   $env:ZSTD_CLEVEL = 19
   tar --zstd -cf $archive_path .
} catch {
    Write-Error "Error: Failed to create archive: $($_.Exception.Message)"
    exit 1
} finally {
    # Return to original directory
    popd > $null
}
