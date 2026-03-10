/*
 * Copyright (c) 2025 - 2026 Munich Quantum Software Company GmbH
 * Copyright (c) 2025 - 2026 Chair for Design Automation, TUM
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

import * as core from "@actions/core";
import { promises as fs } from "node:fs";
import { createOctokit } from "./create-octokit.js";
import {
  MANIFEST_FILE,
  README_FILE,
  REPO_NAME,
  REPO_OWNER,
} from "./constants.js";
import { Octokit } from "@octokit/core";
import type { Asset, Release } from "./types.js";
import { compare } from "semver";
import { match } from "node:assert";
import { arch } from "node:os";

const README_LIST_BEGIN = "<!--- BEGIN: AUTO-GENERATED LIST. DO NOT EDIT. -->";
const README_LIST_END = "<!--- END: AUTO-GENERATED LIST. DO NOT EDIT. -->";

/**
 * Interface representing an entry in the version manifest
 */
export interface ManifestEntry {
  architecture: string;
  asset_name: string;
  debug: boolean;
  download_url: string;
  platform: string;
  release_url: string;
  tag: string;
  version: string;
  zstd_asset_name: string;
  zstd_download_url: string;
}

/**
 * Interface representing zstd asset information
 */
interface ZstdInfo {
  asset_name_linux_x86?: string;
  asset_name_linux_aarch64?: string;
  asset_name_macos_x86?: string;
  asset_name_macos_aarch64?: string;
  asset_name_windows_x86?: string;
  asset_name_windows_aarch64?: string;
  download_url_linux_x86?: string;
  download_url_linux_aarch64?: string;
  download_url_macos_x86?: string;
  download_url_macos_aarch64?: string;
  download_url_windows_x86?: string;
  download_url_windows_aarch64?: string;
}

/**
 * Fetch all releases from the `portable-mlir-toolchain` repository
 * @param octokit The Octokit instance
 * @returns Array of releases sorted by creation date
 */
async function getReleases(octokit: Octokit): Promise<Release[]> {
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
  releases.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return releases;
}

function populateZstdInfo(info: ZstdInfo, asset: Asset): void {
  const match_linux_x86 = asset.name.match(
    /zstd-(.+?)_x86_64-unknown-linux-gnu\./,
  );
  const match_linux_aarch64 = asset.name.match(
    /zstd-(.+?)_aarch64-unknown-linux-gnu\./,
  );
  const match_macos_x86 = asset.name.match(/zstd-(.+?)_x86_64-apple-darwin\./);
  const match_macos_aarch64 = asset.name.match(
    /zstd-(.+?)_arm64-apple-darwin\./,
  );
  const match_windows_x86 = asset.name.match(
    /zstd-(.+?)_x86_64-pc-windows-msvc\./,
  );
  const match_windows_aarch64 = asset.name.match(
    /zstd-(.+?)_aarch64-pc-windows-msvc\./,
  );
  const match_legacy = asset.name.match(
    /zstd-(.+?)_(.+?)_(.+)_(x86|aarch64)\./i,
  );

  if (match_linux_x86) {
    info[`asset_name_linux_x86`] = asset.name;
    info[`download_url_linux_x86`] = asset.browser_download_url;
  } else if (match_linux_aarch64) {
    info[`asset_name_linux_aarch64`] = asset.name;
    info[`download_url_linux_aarch64`] = asset.browser_download_url;
  } else if (match_macos_x86) {
    info[`asset_name_macos_x86`] = asset.name;
    info[`download_url_macos_x86`] = asset.browser_download_url;
  } else if (match_macos_aarch64) {
    info[`asset_name_macos_aarch64`] = asset.name;
    info[`download_url_macos_aarch64`] = asset.browser_download_url;
  } else if (match_windows_x86) {
    info[`asset_name_windows_x86`] = asset.name;
    info[`download_url_windows_x86`] = asset.browser_download_url;
  } else if (match_windows_aarch64) {
    info[`asset_name_windows_aarch64`] = asset.name;
    info[`download_url_windows_aarch64`] = asset.browser_download_url;
  } else if (match_legacy) {
    const platform = match_legacy[2].toLowerCase();
    const architecture = match_legacy[4].toLowerCase();
    const assetNameKey =
      `asset_name_${platform}_${architecture}` as keyof ZstdInfo;
    const downloadUrlKey =
      `download_url_${platform}_${architecture}` as keyof ZstdInfo;
    if (!info[assetNameKey] || !info[downloadUrlKey]) {
      info[assetNameKey] = asset.name;
      info[downloadUrlKey] = asset.browser_download_url;
    }
  } else {
    throw new Error(`Asset ${asset.name} does not match any known pattern.`);
  }
}

/**
 * Extract version from the name of a release asset
 * @param assetName - Name of the release asset
 * @returns Version string
 */
function getVersionFromAssetName(assetName: string): string {
  const versionMatch = assetName.match(/llvm-mlir_llvmorg-(\d+\.\d+\.\d+)_/i);
  if (versionMatch) {
    return versionMatch[1].toLowerCase();
  }
  const hashMatch = assetName.match(/llvm-mlir_([0-9a-f]{7,40})_/i);
  if (hashMatch) {
    return hashMatch[1].toLowerCase();
  }
  throw new Error(`Could not extract version from asset name: ${assetName}`);
}

function populateManifest(
  manifest: ManifestEntry[],
  asset: Asset,
  release: Release,
  zstdInfo: ZstdInfo,
): void {
  const match_linux_x86 = asset.name.match(
    /llvm-mlir_(.+?)_x86_64-unknown-linux-gnu\./i,
  );
  const match_linux_aarch64 = asset.name.match(
    /llvm-mlir_(.+?)_aarch64-unknown-linux-gnu\./i,
  );
  const match_macos_x86 = asset.name.match(
    /llvm-mlir_(.+?)_x86_64-apple-darwin\./i,
  );
  const match_macos_aarch64 = asset.name.match(
    /llvm-mlir_(.+?)_arm64-apple-darwin\./i,
  );
  const match_windows_x86 = asset.name.match(
    /llvm-mlir_(.+?)_x86_64-pc-windows-msvc(_debug)?\./i,
  );
  const match_windows_aarch64 = asset.name.match(
    /llvm-mlir_(.+?)_aarch64-pc-windows-msvc(_debug)?\./i,
  );
  const match_legacy = asset.name.match(
    /llvm-mlir_(.+?)_(.+?)_(.+)_(x86|aarch64)(_debug)?\./i,
  );

  let architecture = "";
  let debug = false;
  let platform = "";
  let zstdAssetNameKey = "";
  let zstdDownloadUrlKey = "";

  if (match_linux_x86) {
    architecture = "x86";
    platform = "linux";
    zstdAssetNameKey = "asset_name_linux_x86";
    zstdDownloadUrlKey = "download_url_linux_x86";
  } else if (match_linux_aarch64) {
    architecture = "aarch64";
    platform = "linux";
    zstdAssetNameKey = "asset_name_linux_aarch64";
    zstdDownloadUrlKey = "download_url_linux_aarch64";
  } else if (match_macos_x86) {
    architecture = "x86";
    platform = "macos";
    zstdAssetNameKey = "asset_name_macos_x86";
    zstdDownloadUrlKey = "download_url_macos_x86";
  } else if (match_macos_aarch64) {
    architecture = "aarch64";
    platform = "macos";
    zstdAssetNameKey = "asset_name_macos_aarch64";
    zstdDownloadUrlKey = "download_url_macos_aarch64";
  } else if (match_windows_x86) {
    architecture = "x86";
    debug = Boolean(match_windows_x86[2]);
    platform = "windows";
    zstdAssetNameKey = "asset_name_windows_x86";
    zstdDownloadUrlKey = "download_url_windows_x86";
  } else if (match_windows_aarch64) {
    architecture = "aarch64";
    debug = Boolean(match_windows_aarch64[2]);
    platform = "windows";
    zstdAssetNameKey = "asset_name_windows_aarch64";
    zstdDownloadUrlKey = "download_url_windows_aarch64";
  } else if (match_legacy) {
    architecture = match_legacy[4].toLowerCase();
    debug = Boolean(match_legacy[5]);
    platform = match_legacy[2].toLowerCase();
    zstdAssetNameKey = `asset_name_${platform}_${architecture}`;
    zstdDownloadUrlKey = `download_url_${platform}_${architecture}`;
  } else {
    throw new Error(`Asset ${asset.name} does not match any known pattern.`);
  }

  const version = getVersionFromAssetName(asset.name);

  const zstdAssetName = zstdInfo[zstdAssetNameKey as keyof ZstdInfo];
  const zstdDownloadUrl = zstdInfo[zstdDownloadUrlKey as keyof ZstdInfo];
  if (!zstdAssetName || !zstdDownloadUrl) {
    throw new Error(`No zstd binary found for ${asset.name}.`);
  }

  manifest.push({
    architecture: architecture,
    asset_name: asset.name,
    debug: debug,
    download_url: asset.browser_download_url,
    platform: platform,
    release_url: release.html_url,
    tag: release.tag_name,
    version: version,
    zstd_asset_name: zstdAssetName,
    zstd_download_url: zstdDownloadUrl,
  });
}

/**
 * Update README.md file with a list of available versions
 * @param versions The available versions
 */
async function updateReadme(versions: Set<string>): Promise<void> {
  const readme = await fs.readFile(README_FILE, "utf-8");
  const beginIndex = readme.indexOf(README_LIST_BEGIN);
  const endIndex = readme.indexOf(README_LIST_END);

  if (beginIndex === -1 || endIndex === -1 || beginIndex >= endIndex) {
    throw new Error("Could not find valid list markers in README.md.");
  }

  let tags: string[] = [];
  let hashes: string[] = [];
  for (const version of versions) {
    if (/^\d+\.\d+\.\d+$/.test(version)) {
      tags.push(version);
    } else if (/^[0-9a-f]{7,40}$/i.test(version)) {
      hashes.push(version);
    }
  }

  let body = "";
  if (tags.length > 0) {
    body += `List of available LLVM versions:\n\n`;
    tags.sort(compare);
    for (const tag of tags) {
      body += `- \`${tag}\`\n`;
    }
    body += `\n`;
  }
  if (hashes.length > 0) {
    body += `List of available LLVM commit hashes:\n\n`;
    for (const hash of hashes) {
      body += `- \`${hash}\`\n`;
    }
    body += `\n`;
  }

  const before = readme.slice(0, beginIndex + README_LIST_BEGIN.length);
  const after = readme.slice(endIndex);

  const updatedReadme = `${before}\n\n${body}${after}`;
  await fs.writeFile(README_FILE, updatedReadme);
}

/**
 * Update the version manifest with release assets
 */
export async function updateManifest(): Promise<void> {
  const token = process.env.GITHUB_TOKEN || "";
  if (!token) {
    core.warning("GITHUB_TOKEN is not set. API rate limits may apply.");
  }
  const octokit = createOctokit(token);

  const releases = await getReleases(octokit);

  const versions: Set<string> = new Set();
  const manifest: ManifestEntry[] = [];
  const zstdInfo: ZstdInfo = {};
  for (const release of releases) {
    let version: string | undefined = undefined;
    for (const asset of release.assets) {
      if (asset.name.startsWith("zstd-")) {
        populateZstdInfo(zstdInfo, asset);
      }
    }
    for (const asset of release.assets) {
      if (asset.name.startsWith("llvm-mlir_")) {
        try {
          version = getVersionFromAssetName(asset.name);
          if (versions.has(version)) {
            continue;
          }
          populateManifest(manifest, asset, release, zstdInfo);
        } catch (error) {
          core.warning(
            `Skipping asset ${asset.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
    if (version) {
      versions.add(version);
    }
  }

  // Sort manifest entries by tag name, platform, and architecture
  manifest.sort((a, b) => {
    if (a.tag !== b.tag) {
      return b.tag.localeCompare(a.tag);
    }
    if (a.platform !== b.platform) {
      return a.platform.localeCompare(b.platform);
    }
    return a.architecture.localeCompare(b.architecture);
  });

  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
  await updateReadme(versions);

  const latestRelease = await octokit.request(
    "GET /repos/{owner}/{repo}/releases/latest",
    {
      owner: REPO_OWNER,
      repo: REPO_NAME,
    },
  );
  core.setOutput("latest-tag", latestRelease.data.tag_name);
}
