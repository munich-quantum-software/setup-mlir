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

# Usage: setup-mlir.ps1 -setup_mlir_tag <tag> -install_prefix <installation directory>

param(
    [Parameter(Mandatory=$true)]
    [string]$setup_mlir_tag,
    [Parameter(Mandatory=$true)]
    [string]$install_prefix,
    [string]$token
)

$ErrorActionPreference = "Stop"

# Check if installation directory exists
if (-not (Test-Path $install_prefix -PathType Container)) {
    Write-Error "Installation directory $install_prefix does not exist."
    exit 1
}

# Check if zstd is installed
if (-not (Get-Command zstd -ErrorAction SilentlyContinue)) {
    Write-Error "zstd not found. Please install zstd (e.g., via Chocolatey: choco install zstd)."
    exit 1
}

# Check if tar is installed
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Error "tar not found. Please install tar (e.g., via Chocolatey: choco install tar)."
    exit 1
}

# Change to installation directory
pushd $install_prefix > $null

# Detect architecture
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture

# Determine download URL
$headers = @{
    "Accept" = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}
if ($token) {
    $headers["Authorization"] = "Bearer $token"
}

$release_url = "https://api.github.com/repos/munich-quantum-software/setup-mlir/releases/tags/$setup_mlir_tag"
$release_json = Invoke-RestMethod -Uri $release_url -Headers $headers

$assets_url = $release_json.assets_url
$assets_json = Invoke-RestMethod -Uri $assets_url -Headers $headers

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

# Clean up
Remove-Item "asset.tar.zst" -Force
Remove-Item "asset.tar" -Force

# Return to original directory
popd > $null

# Output instructions
Write-Host "MLIR toolchain has been installed."
Write-Host "Run the following commands to set up your environment:"
Write-Host "  `$env:LLVM_DIR = '$install_prefix\lib\cmake\llvm'"
Write-Host "  `$env:MLIR_DIR = '$install_prefix\lib\cmake\mlir'"
Write-Host "  `$env:Path = '$install_prefix\bin;`$env:Path'"
