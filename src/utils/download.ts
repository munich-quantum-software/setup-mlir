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

import { promises as fs } from "node:fs";
import { createOctokit } from "./create-oktokit.js";
import { ManifestEntry } from "./manifest.js";
import { MANIFEST_FILE, REPO_NAME, REPO_OWNER } from "./constants.js";
import type { components } from "@octokit/openapi-types";

import { getPlatform, getArchitecture } from "./platform.js";

type Release = components["schemas"]["release"];
type ReleaseAsset = components["schemas"]["release-asset"];

/**
 * Get the manifest entry for the specified arguments
 * @param version The requested LLVM version
 * @param platform The platform
 * @param architecture The architecture
 * @param debug Whether to get a debug build
 * @returns The manifest entry
 */
async function getManifestEntry(
  version: string,
  platform: string,
  architecture: string,
  debug: boolean,
): Promise<ManifestEntry> {
  const fileContent = await fs.readFile(MANIFEST_FILE, "utf-8");
  const manifest: ManifestEntry[] = JSON.parse(fileContent);

  const entry = manifest.find(
    (entry) =>
      entry.version.startsWith(version) &&
      entry.platform === platform.toLowerCase() &&
      entry.architecture === architecture.toLowerCase() &&
      entry.debug === debug,
  );

  if (!entry) {
    throw new Error(
      `No ${architecture} ${platform}${debug ? " (debug)" : ""} archive found for LLVM ${version}.`,
    );
  }
  return entry;
}

/**
 * Get the requested zstd release asset from a release
 * @param release The GitHub release containing the assets
 * @param platform The platform
 * @param architecture The architecture
 * @returns The matching release asset if found
 */
function getZstdAsset(
  release: Release,
  platform: string,
  architecture: string,
): ReleaseAsset | undefined {
  platform = platform.toLowerCase();
  const extension = platform === "windows" ? "zip" : "tar.gz";
  const pattern = RegExp(
    `^zstd-[A-Za-z0-9._-]+_${platform}_[A-Za-z0-9._-]+_${architecture}\\.${extension}$`,
    "i",
  );
  return release.assets.find((asset) => pattern.test(asset.name));
}

/**
 * Get the download URL for the requested zstd binary
 * @param token GitHub token for authentication
 * @param version The requested LLVM version
 * @param platform The platform
 * @param architecture The architecture
 * @returns The download URL and the asset name
 */
export async function getZstdUrl(
  token: string,
  version: string,
  platform: string,
  architecture: string,
): Promise<{ url: string; name: string }> {
  const octokit = createOctokit(token);

  platform = getPlatform(platform);
  architecture = getArchitecture(architecture);
  const entry = await getManifestEntry(version, platform, architecture, false);

  let asset: ReleaseAsset | undefined;

  const tag = entry.tag;
  if (!tag.match(/^\d{4}\.\d{2}\.\d{2}$/)) {
    throw new Error(`Invalid tag in manifest: ${tag}`);
  }
  const release = await octokit.request(
    "GET /repos/{owner}/{repo}/releases/tags/{tag}",
    {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      tag: tag,
    },
  );
  asset = getZstdAsset(release.data, platform, architecture);

  if (!asset) {
    octokit.log.info(
      `No zstd binary found for ${architecture} ${platform} in release ${entry.tag}.`,
    );
    const latestRelease = await octokit.request(
      "GET /repos/{owner}/{repo}/releases/latest",
      {
        owner: REPO_OWNER,
        repo: REPO_NAME,
      },
    );
    asset = getZstdAsset(latestRelease.data, platform, architecture);
  }

  if (!asset) {
    throw new Error(`No zstd binary found for ${architecture} ${platform}.`);
  }

  return { url: asset.browser_download_url, name: asset.name };
}

/**
 * Get the download URL for the requested MLIR/LLVM binary
 * @param version The requested LLVM version
 * @param platform The platform
 * @param architecture The architecture
 * @param debug Whether to get a debug build
 * @returns The download URL and the asset name
 */
export async function getMLIRUrl(
  version: string,
  platform: string,
  architecture: string,
  debug: boolean,
): Promise<{ url: string; name: string }> {
  platform = getPlatform(platform);
  architecture = getArchitecture(architecture);
  const entry = await getManifestEntry(version, platform, architecture, debug);
  return { url: entry.download_url, name: entry.asset_name };
}
