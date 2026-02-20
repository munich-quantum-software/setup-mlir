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

# Usage: setup-mlir.ps1 -llvm_version <LLVM version> -install_prefix <installation directory> [-token <GitHub token>] [-use_debug]

param(
    [Parameter(Mandatory=$true)]
    [string]$llvm_version,
    [Parameter(Mandatory=$true)]
    [string]$install_prefix,
    [switch]$use_debug
)

$ErrorActionPreference = "Stop"

# Check if tar is installed
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Error "tar not found. Please install tar (e.g., via Chocolatey: choco install tar)."
    exit 1
}

# Create installation directory if it does not exist
New-Item -ItemType Directory -Path $install_prefix -Force | Out-Null

# Change to installation directory
pushd $install_prefix > $null

# Detect architecture
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture

# Helper function to download asset from a URL
function Download-Asset {
    param(
        [string]$Url,
        [string]$OutputFile
    )

    if (-not $Url) {
        return $false
    }

    Write-Host "Downloading from $Url ..."
    try {
        Invoke-WebRequest -Uri $Url -OutFile $OutputFile
        return $true
    } catch {
        Write-Error "Download failed: $_"
        exit 1
    }
}

$manifest_url = "https://raw.githubusercontent.com/munich-quantum-software/setup-mlir/main/version-manifest.json"
$manifest_json = Invoke-RestMethod -Uri $manifest_url

$architecture = switch ($arch) {
    x64 { "x86" }
    arm64 { "aarch64" }
    default {
        Write-Error "Unsupported architecture: $arch"
        exit 1
    }
}
$debug = [bool]$use_debug
$platform = "windows"

$matching_entry = $manifest_json | Where-Object {
    $_.platform -eq $platform -and
    $_.architecture -eq $architecture -and
    $_.debug -eq $debug -and
    $_.version -like "${llvm_version}*"
} | Select-Object -First 1

if (-not $matching_entry) {
    Write-Error "No release with LLVM $llvm_version found for Windows/${arch}$(if ($use_debug) { ' (debug)' } else { '' })."
    exit 1
}

# Download zstd binary
Write-Host "Downloading zstd binary..."
if (-not (Download-Asset -Url $matching_entry.zstd_download_url -OutputFile "zstd.zip")) {
    Write-Error "No zstd binary found for Windows/${arch}."
    exit 1
}

# Extract zstd binary
Write-Host "Extracting zstd binary..."
try {
    Expand-Archive -Path "zstd.zip" -DestinationPath "zstd_temp" -Force -ErrorAction Stop
    Remove-Item "zstd.zip" -Force
} catch {
    Write-Error "Failed to extract zstd binary: $_"
    exit 1
}

# Verify extraction directory exists
if (-not (Test-Path "zstd_temp")) {
    Write-Error "zstd extraction failed: zstd_temp directory not found"
    exit 1
}

# zstd archive contains a single executable file
$zstdBinPath = Join-Path "zstd_temp" "zstd.exe"
if (-not (Test-Path $zstdBinPath)) {
    Write-Error "zstd.exe not found at $zstdBinPath (extraction succeeded but file is missing)"
    exit 1
}

# Download LLVM distribution
Write-Host "Downloading LLVM distribution..."
if (-not (Download-Asset -Url $matching_entry.download_url -OutputFile "llvm.tar.zst")) {
    Write-Error "No release with LLVM $llvm_version found for Windows/${arch}$(if ($use_debug) { ' (debug)' } else { '' })."
    exit 1
}

# Decompress and extract LLVM distribution
Write-Host "Extracting LLVM distribution..."
& $zstdBinPath -d "llvm.tar.zst" --long=30 --stdout | tar -x -f - -C "$install_prefix"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to extract LLVM distribution."
    exit 1
}

# Cleanup
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
