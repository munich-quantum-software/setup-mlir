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

import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { getPlatform, getArchitecture } from "./platform.js";
import { createOctokit } from "./create-oktokit.js";
import { REPO_OWNER, REPO_NAME } from "./constants.js";
import type { components } from "@octokit/openapi-types";

type Release = components["schemas"]["release"];
type ReleaseAsset = components["schemas"]["release-asset"];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MANIFEST_FILE = join(__dirname, "..", "..", "version-manifest.json");

/**
 * Interface representing an entry in the version manifest
 */
interface ManifestEntry {
  architecture: string;
  asset_name: string;
  debug: boolean;
  download_url: string;
  platform: string;
  release_url: string;
  tag: string;
  version: string;
}

/**
 * Extract platform, architecture, and debug from the name of a release asset
 * @param assetName - Name of the release asset
 * @returns Tuple of platform, architecture, and debug
 */
function getPlatformFromAsset(assetName: string): [string, string, boolean] {
  const platformMatch = assetName.match(
    /llvm-mlir_(.+?)_(.+?)_(.+)_(X86|AArch64)(_debug)?\./i,
  );
  if (platformMatch) {
    return [platformMatch[2], platformMatch[4], Boolean(platformMatch[5])];
  }
  throw new Error(`Could not extract platform from asset name: ${assetName}`);
}

/**
 * Extract version from the name of a release asset
 * @param assetName - Name of the release asset
 * @returns Version string
 */
function getVersionFromAsset(assetName: string): string {
  const versionMatch = assetName.match(/llvm-mlir_llvmorg-(\d+\.\d+\.\d+)_/i);
  if (versionMatch) {
    return versionMatch[1];
  }
  const hashMatch = assetName.match(/llvm-mlir_([0-9a-f]{7,40})_/i);
  if (hashMatch) {
    return hashMatch[1];
  }
  throw new Error(`Could not extract version from asset name: ${assetName}`);
}

/**
 * Update the version manifest with release assets
 */
export async function updateManifest(): Promise<void> {
  const token = process.env.GITHUB_TOKEN || "";
  const octokit = createOctokit(token);

  const releases: Release[] = [];
  let page = 1;
  while (true) {
    const releasesPage = await octokit.request(
      "GET /repos/{owner}/{repo}/releases",
      {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        per_page: 100,
        page: page,
      },
    );
    if (releasesPage.data.length === 0) {
      break;
    }
    releases.push(...releasesPage.data);
    if (releasesPage.data.length < 100) {
      break;
    }
    page++;
  }

  const manifest: ManifestEntry[] = [];

  for (const release of releases) {
    for (const asset of release.assets) {
      if (asset.name.startsWith("llvm-mlir")) {
        const downloadUrl = asset.browser_download_url;
        const urlParts = downloadUrl.split("/");
        const tag = urlParts[urlParts.length - 2];
        const assetName = urlParts[urlParts.length - 1];
        const [platform, architecture, debug] = getPlatformFromAsset(assetName);
        const version = getVersionFromAsset(assetName);
        manifest.push({
          architecture: architecture.toLowerCase(),
          asset_name: assetName,
          debug: debug,
          download_url: downloadUrl,
          platform: platform.toLowerCase(),
          release_url: release.html_url,
          tag: tag,
          version: version,
        });
      }
    }
  }

  manifest.sort((a, b) => {
    if (a.tag !== b.tag) {
      return b.tag.localeCompare(a.tag);
    }
    if (a.platform !== b.platform) {
      return a.platform.localeCompare(b.platform);
    }
    return a.architecture.localeCompare(b.architecture);
  });

  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest));
}

async function getManifestEntry(
  version: string,
  platform: string,
  architecture: string,
  debug: boolean,
): Promise<ManifestEntry> {
  const fileContent = await fs.readFile(MANIFEST_FILE);
  let data: string = fileContent.toString();
  let manifest: ManifestEntry[] = JSON.parse(data);

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

async function getZstdAsset(
  assets: ReleaseAsset[],
  platform: string,
  architecture: string,
): Promise<ReleaseAsset | undefined> {
  platform = platform.toLowerCase();
  const extension = platform === "windows" ? "zip" : "tar.gz";
  const pattern = RegExp(
    `^zstd-[A-Za-z0-9._-]+_${platform}_[A-Za-z0-9._-]+_${architecture}\\.${extension}$`,
    "i",
  );
  return assets.find((asset) => pattern.test(asset.name));
}

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

  let assets: ReleaseAsset[];
  let asset: ReleaseAsset | undefined;

  const release = await octokit.request(
    "GET /repos/{owner}/{repo}/releases/tags/{tag}",
    {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      tag: entry.tag,
    },
  );
  assets = release.data.assets;
  asset = await getZstdAsset(assets, platform, architecture);

  if (!asset) {
    octokit.log.info(
      `No zstd binary found for ${architecture} ${platform} in release ${entry.tag}.`,
    );
  }

  const latestRelease = await octokit.request(
    "GET /repos/{owner}/{repo}/releases/latest",
    {
      owner: REPO_OWNER,
      repo: REPO_NAME,
    },
  );
  assets = latestRelease.data.assets;
  asset = await getZstdAsset(assets, platform, architecture);

  if (!asset) {
    throw new Error(`No zstd binary found for ${architecture} ${platform}.`);
  }

  return { url: asset.browser_download_url, name: asset.name };
}

export async function getMlirUrl(
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
