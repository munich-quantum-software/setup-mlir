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

# Usage: setup-mlir.ps1 -llvm_version <LLVM version> -install_prefix <installation directory> [-token <GitHub token>] [-use_debug]

param(
    [Parameter(Mandatory=$true)]
    [string]$llvm_version,
    [Parameter(Mandatory=$true)]
    [string]$install_prefix,
    [string]$token,
    [switch]$use_debug
)

$ErrorActionPreference = "Stop"

# Check if tar is installed
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Error "tar not found. Please install tar (e.g., via Chocolatey: choco install tar)."
    exit 1
}

# Check for unzip on Windows (needed for extracting zstd binary)
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Error "tar is required but not found. Please install tar."
    exit 1
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

# Helper function to download asset from GitHub releases
function Download-Asset {
    param(
        [string]$Pattern,
        [string]$OutputFile,
        [object[]]$Assets
    )

    $asset = $Assets | Where-Object { $_.name -match $Pattern } | Select-Object -First 1

    if (-not $asset) {
        return $false
    }

    Write-Host "Downloading from $($asset.browser_download_url) ..."
    try {
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $OutputFile
        return $true
    } catch {
        Write-Error "Download failed: $_"
        exit 1
    }
}

# Setup headers for GitHub API
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
$assets = $newest_release.assets

# Determine asset patterns based on architecture and debug flag
$debugSuffix = if ($use_debug) { "_debug" } else { "" }

switch ($arch) {
    x64 {
        $llvmPattern = "llvm-mlir_.*_windows_X64_X86${debugSuffix}\.tar\.zst$"
        $zstdPattern = "^zstd-.*_windows_X64_X86\.zip$"
    }
    arm64 {
        $llvmPattern = "llvm-mlir_.*_windows_Arm64_AArch64${debugSuffix}\.tar\.zst$"
        $zstdPattern = "^zstd-.*_windows_Arm64_AArch64\.zip$"
    }
    default {
        Write-Error "Unsupported architecture: $arch"
        exit 1
    }
}

# Download zstd binary
Write-Host "Downloading zstd binary..."
if (-not (Download-Asset -Pattern $zstdPattern -OutputFile "zstd.zip" -Assets $assets)) {
    # If zstd is not found in the LLVM version release, try the latest release
    Write-Host "zstd not found in LLVM version release, trying latest release..."
    $latest_url = "https://api.github.com/repos/munich-quantum-software/portable-mlir-toolchain/releases/latest"
    $latest_release = Invoke-RestMethod -Uri $latest_url -Headers $headers

    if (-not (Download-Asset -Pattern $zstdPattern -OutputFile "zstd.zip" -Assets $latest_release.assets)) {
        Write-Error "No zstd binary found for Windows/${arch}."
        exit 1
    }
}

# Extract zstd binary
Write-Host "Extracting zstd binary..."
Expand-Archive -Path "zstd.zip" -DestinationPath "zstd_temp" -Force
Remove-Item "zstd.zip" -Force

# Find the zstd executable
$zstdBin = Get-ChildItem -Path "zstd_temp" -Filter "zstd.exe" -Recurse | Select-Object -First 1
if (-not $zstdBin) {
    Write-Error "zstd.exe not found in extracted archive."
    exit 1
}

# Download LLVM distribution
Write-Host "Downloading LLVM distribution..."
if (-not (Download-Asset -Pattern $llvmPattern -OutputFile "llvm.tar.zst" -Assets $assets)) {
    Write-Error "No release with LLVM $llvm_version found for Windows/${arch}$(if ($use_debug) { ' (debug)' } else { '' })."
    exit 1
}

# Decompress and extract LLVM distribution
Write-Host "Extracting LLVM distribution..."
& $zstdBin.FullName -d "llvm.tar.zst" --long=30 -o "llvm.tar"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to decompress LLVM distribution."
    exit 1
}

& tar -xf "llvm.tar"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to extract LLVM distribution."
    exit 1
}

# Cleanup
Remove-Item "llvm.tar" -Force
Remove-Item "llvm.tar.zst" -Force
Remove-Item "zstd_temp" -Recurse -Force

# Return to original directory
popd > $null

# Output instructions
Write-Host "MLIR toolchain has been installed."
Write-Host "Run the following commands to set up your environment:"
Write-Host "  `$env:LLVM_DIR = '$install_prefix\lib\cmake\llvm'"
Write-Host "  `$env:MLIR_DIR = '$install_prefix\lib\cmake\mlir'"
Write-Host "  `$env:Path = '$install_prefix\bin;`$env:Path'"
