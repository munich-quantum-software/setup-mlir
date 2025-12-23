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

# Usage: setup-mlir.ps1 -llvm_version <LLVM version> -install_prefix <installation directory> [-token <GitHub token>]

param(
    [Parameter(Mandatory=$true)]
    [string]$llvm_version,
    [Parameter(Mandatory=$true)]
    [string]$install_prefix,
    [string]$token
)

$ErrorActionPreference = "Stop"

# Check if tar is installed
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Error "tar not found. Please install tar (e.g., via Chocolatey: choco install tar)."
    exit 1
}

# Check if we can extract zstd archives
# Try to determine if tar supports --zstd by checking help output
$tarHelp = & tar --help 2>&1 | Out-String
$useTarZstd = $tarHelp -match '--zstd'

if (-not $useTarZstd) {
    # Check if zstd is installed as fallback
    if (-not (Get-Command zstd -ErrorAction SilentlyContinue)) {
        Write-Error "tar does not support --zstd and zstd command not found. Please install zstd or upgrade tar to a version with zstd support."
        exit 1
    }
}

# Create installation directory if it does not exist
New-Item -ItemType Directory -Path $install_prefix -Force | Out-Null

# Change to installation directory
pushd $install_prefix > $null

# Detect architecture
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture

# Determine whether version is version or commit SHA
if ($llvm_version -match '^\d+\.\d+\.\d+$') {
    $match_pattern = "llvm-mlir_llvmorg-${llvm_version}_"
} elseif ($llvm_version -match '^[0-9a-f]{7,40}$') {
    $match_pattern = "llvm-mlir_${llvm_version}"
} else {
    Write-Error "Invalid LLVM version format: $llvm_version. Must be a version (e.g., 21.1.8) or a commit SHA."
    exit 1
}

# Determine download URL
$headers = @{
    "Accept" = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}
if ($token) {
    $headers["Authorization"] = "Bearer $token"
}

$releases_url = "https://api.github.com/repos/munich-quantum-software/portable-mlir-toolchain/releases?per_page=100"
$releases_json = Invoke-RestMethod -Uri $releases_url -Headers $headers

$matching_releases = $releases_json | Where-Object {
    $_.assets -and ($_.assets | Where-Object { $_.name -and $_.name -like "*${match_pattern}*" })
}
if (-not $matching_releases) {
    Write-Error "No release with LLVM $llvm_version found."
    exit 1
}
$newest_release = $matching_releases | Sort-Object -Property published_at -Descending | Select-Object -First 1
$assets_json = $newest_release.assets

$download_urls = $assets_json | ForEach-Object { $_.browser_download_url }

switch ($arch) {
    x64 {
        $download_url = $download_urls | Where-Object { $_ -match '.*_windows_.*_X86\.tar\.zst' }
    }
    arm64 {
        $download_url = $download_urls | Where-Object { $_ -match '.*_windows_.*_AArch64\.tar\.zst' }
    }
    default {
        Write-Error "Unsupported architecture: $arch"; exit 1
    }
}

# Download asset
Write-Host "Downloading asset from $download_url ..."
Invoke-WebRequest -Uri $download_url -OutFile "asset.tar.zst"

# Unpack archive
Write-Host "Extracting archive..."

if ($useTarZstd) {
    & tar --zstd -xf "asset.tar.zst"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to extract archive."
        exit 1
    }
    Remove-Item "asset.tar.zst" -Force
} else {
    & zstd -d "asset.tar.zst" --output-dir-flat .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to decompress archive."
        exit 1
    }

    & tar -xf "asset.tar"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to extract archive."
        exit 1
    }

    Remove-Item "asset.tar.zst" -Force
    Remove-Item "asset.tar" -Force
}

# Return to original directory
popd > $null

# Output instructions
Write-Host "MLIR toolchain has been installed."
Write-Host "Run the following commands to set up your environment:"
Write-Host "  `$env:LLVM_DIR = '$install_prefix\lib\cmake\llvm'"
Write-Host "  `$env:MLIR_DIR = '$install_prefix\lib\cmake\mlir'"
Write-Host "  `$env:Path = '$install_prefix\bin;`$env:Path'"
