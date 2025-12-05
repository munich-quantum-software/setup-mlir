/*
 * Copyright (c) 2025 Munich Quantum Software Company GmbH
 * Copyright (c) 2025 Chair for Design Automation, TUM
 * All rights reserved.
 *
 * Licensed under the Apache License v2.0 with LLVM Exceptions (the "License"); you
 * may not use this file except in compliance with the License. You may obtain a
 * copy of the License at https://llvm.org/LICENSE.txt
 *
 * Unless required by applicable law or agreed to in writing, software distributed
 * under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 * CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
 */

import process from "node:process";
import { Octokit, OctokitOptions } from "@octokit/core";
import type { components } from "@octokit/openapi-types";

type ReleaseAsset = components["schemas"]["release-asset"];

/**
 * Determine the URL of the release asset for the given platform and architecture.
 * @param {string} token - GitHub token
 * @param {string} llvm_version - LLVM version
 * @param {string} platform - platform to look for (either host, linux, macOS, or windows)
 * @param {string} architecture - architecture to look for (either host, X86, or AArch64)
 * @returns {{url: string, name: string}} - Download URL for the release asset and the asset name
 */
export default async function getDownloadLink(
  token: string,
  llvm_version: string,
  platform = "host",
  architecture = "host",
): Promise<{ url: string; name: string }> {
  const assets = await getAssets(token, llvm_version);

  if (platform === "host") {
    platform = determinePlatform();
  }

  if (architecture === "host") {
    architecture = determineArchitecture();
  }

  // Determine the file name of the asset
  const asset = findAsset(assets, platform, architecture);

  if (asset) {
    return { url: asset.browser_download_url, name: asset.name };
  } else {
    throw new Error(
      `No ${architecture} ${platform} archive found for LLVM ${llvm_version}.`,
    );
  }
}

/**
 * Determine the platform of the current host.
 * @returns {string} - platform of the current host (either linux, macOS, or windows)
 */
function determinePlatform(): string {
  if (process.platform === "linux") {
    return "linux";
  } else if (process.platform === "darwin") {
    return "macOS";
  } else if (process.platform === "win32") {
    return "windows";
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

/**
 * Determine the architecture of the current host.
 * @returns {string} - architecture of the current host (either X86 or AArch64)
 */
function determineArchitecture(): string {
  if (process.arch === "x64") {
    return "X86";
  } else if (process.arch === "arm64") {
    return "AArch64";
  } else {
    throw new Error(`Unsupported architecture: ${process.arch}`);
  }
}

/**
 * Get the release assets for the given setup-mlir tag from GitHub.
 * @param {string} token - GitHub token
 * @param {string} llvm_version - LLVM version
 * @returns {Promise<ReleaseAsset[]>} - list of release assets
 */
async function getAssets(
  token: string,
  llvm_version: string,
): Promise<ReleaseAsset[]> {
  const options: OctokitOptions = {};
  if (token) {
    options.auth = token;
  }
  const octokit = new Octokit(options);
  const releases = await octokit.request("GET /repos/{owner}/{repo}/releases", {
    owner: "munich-quantum-software",
    repo: "setup-mlir",
  });
  const matching_releases = releases.data.filter(
    (release_data: any) =>
      release_data.assets &&
      release_data.assets.some(
        (asset: ReleaseAsset) =>
          asset.name && asset.name.includes(llvm_version),
      ),
  );
  if (matching_releases.length > 0) {
    return matching_releases[0].assets;
  }
  throw new Error(`No release with LLVM ${llvm_version} found.`);
}

/**
 * Find the release asset for the given platform and architecture.
 * @param {ReleaseAsset[]} assets - list of release assets
 * @param {string} platform - platform to look for (either linux, macOS, or windows)
 * @param {string} architecture - architecture to look for (either X86 or AArch64)
 * @returns {(ReleaseAsset | undefined)} - release asset or undefined if not found
 */
function findAsset(
  assets: ReleaseAsset[],
  platform: string,
  architecture: string,
): ReleaseAsset | undefined {
  if (platform === "linux") {
    return assets.find((asset) =>
      RegExp(`.*_linux_.*_${architecture}.tar.zst$`, "i").exec(asset.name),
    );
  }

  if (platform === "macOS") {
    return assets.find((asset) =>
      RegExp(`.*_macos_.*_${architecture}.tar.zst$`, "i").exec(asset.name),
    );
  }

  if (platform === "windows") {
    return assets.find((asset) =>
      RegExp(`.*_windows_.*_${architecture}.tar.zst$`, "i").exec(asset.name),
    );
  }

  throw new Error(`Invalid platform: ${platform}`);
}
