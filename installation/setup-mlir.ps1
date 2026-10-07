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

#Requires -Version 7.4

param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^(\d+\.\d+\.\d+|[0-9a-fA-F]{7,40})$')]
    [string]$llvm_version,
    [Parameter(Mandatory=$true)]
    [string]$install_prefix,
    [switch]$no_assertions
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true
Get-Command tar -ErrorAction Stop | Out-Null

$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
switch ($arch) {
    x64 { $architecture = "x86" }
    arm64 { $architecture = "aarch64" }
    default { throw "Unsupported architecture: $arch" }
}

if ($PSScriptRoot -and (Test-Path "$PSScriptRoot/../version-manifest.json" -PathType Leaf)) {
    $manifest = Get-Content "$PSScriptRoot/../version-manifest.json" -Raw | ConvertFrom-Json
} else {
    $manifest = Invoke-RestMethod -Uri "https://raw.githubusercontent.com/munich-quantum-software/setup-mlir/main/version-manifest.json"
}
$entries = @($manifest | Where-Object {
    $_.platform -eq "windows" -and $_.architecture -eq $architecture -and
    $(if ($llvm_version.Contains('.')) { $_.version -eq $llvm_version } else { $_.version -like "$llvm_version*" })
})
if ($entries.Count -ne 1) {
    throw "Expected one release with LLVM $llvm_version for Windows/$arch, but found $($entries.Count)."
}
$llvm_url = if ($no_assertions) { $entries[0].noassert_download_url } else { $entries[0].download_url }
if (-not $llvm_url -or -not $entries[0].zstd_download_url) {
    $assertions = if ($no_assertions) { "OFF" } else { "ON" }
    throw "LLVM $llvm_version for Windows/$arch with assertions=$assertions is unavailable."
}

New-Item -ItemType Directory -Path $install_prefix -Force | Out-Null
$install_prefix = (Resolve-Path $install_prefix).Path
Push-Location $install_prefix
try {
    Invoke-WebRequest -Uri $entries[0].zstd_download_url -OutFile zstd.tar.gz
    New-Item -ItemType Directory -Path zstd_temp -Force | Out-Null
    tar -xzf zstd.tar.gz -C zstd_temp

    Invoke-WebRequest -Uri $llvm_url -OutFile llvm.tar.zst
    & ./zstd_temp/zstd.exe -d llvm.tar.zst --long=31 --stdout | tar -x
    Remove-Item zstd.tar.gz, llvm.tar.zst -Force
    Remove-Item zstd_temp -Recurse -Force
} finally {
    Pop-Location
}

Write-Host "MLIR toolchain has been installed."
Write-Host "Run the following commands to set up your environment:"
Write-Host "  `$env:LLVM_DIR = '$install_prefix\lib\cmake\llvm'"
Write-Host "  `$env:MLIR_DIR = '$install_prefix\lib\cmake\mlir'"
Write-Host "  `$env:Path = '$install_prefix\bin;`$env:Path'"
