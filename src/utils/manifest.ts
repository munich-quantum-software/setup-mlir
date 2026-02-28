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
import type { Release } from "./types.js";

const README_LIST_BEGIN = "<!--- BEGIN: AUTO-GENERATED LIST. DO NOT EDIT. -->";
const README_LIST_END = "<!--- END: AUTO-GENERATED LIST. DO NOT EDIT. -->";

/**
 * Interface representing an entry in the version manifest
 */
export interface ManifestEntry {
  architecture: string;
  asset_name: string;
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
    tags.sort((a, b) => {
      const pa = a.split(".").map(Number);
      const pb = b.split(".").map(Number);
      for (let i = 0; i < 3; i++) {
        const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
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
        const match = asset.name.match(
          /zstd-(.+?)_(.+?)_(.+)_(x86|aarch64)\./i,
        );
        if (match) {
          const platform = match[2].toLowerCase();
          const architecture = match[4].toLowerCase();
          const assetNameKey =
            `asset_name_${platform}_${architecture}` as keyof ZstdInfo;
          const downloadUrlKey =
            `download_url_${platform}_${architecture}` as keyof ZstdInfo;
          if (!zstdInfo[assetNameKey] || !zstdInfo[downloadUrlKey]) {
            zstdInfo[assetNameKey] = asset.name;
            zstdInfo[downloadUrlKey] = asset.browser_download_url;
          }
        }
      }
    }
    for (const asset of release.assets) {
      const match = asset.name.match(
        /llvm-mlir_(.+?)_(.+?)_(.+)_(x86|aarch64)\./i,
      );
      if (match) {
        try {
          version = getVersionFromAssetName(asset.name);
          if (versions.has(version)) {
            continue;
          }
          const platform = match[2].toLowerCase();
          const architecture = match[4].toLowerCase();
          const zstdAssetNameKey =
            `asset_name_${platform}_${architecture}` as keyof ZstdInfo;
          const zstdDownloadUrlKey =
            `download_url_${platform}_${architecture}` as keyof ZstdInfo;
          const zstdAssetName = zstdInfo[zstdAssetNameKey];
          const zstdDownloadUrl = zstdInfo[zstdDownloadUrlKey];
          if (!zstdAssetName || !zstdDownloadUrl) {
            throw new Error(`No zstd binary found for ${asset.name}.`);
          }
          manifest.push({
            architecture: architecture,
            asset_name: asset.name,
            download_url: asset.browser_download_url,
            platform: platform,
            release_url: release.html_url,
            tag: release.tag_name,
            version: version,
            zstd_asset_name: zstdAssetName,
            zstd_download_url: zstdDownloadUrl,
          });
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
