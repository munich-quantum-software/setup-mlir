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
import { join } from "node:path";
import { createOctokit } from "./create-octokit.js";
import { REPO_NAME, REPO_OWNER } from "./constants.js";
import { Octokit } from "@octokit/core";
import type { Asset, Release } from "./types.js";
import { compare } from "semver";

const REPOSITORY_ROOT = process.env.GITHUB_WORKSPACE ?? process.cwd();
const MANIFEST_FILE = join(REPOSITORY_ROOT, "version-manifest.json");
const README_FILE = join(REPOSITORY_ROOT, "README.md");
const README_LIST_BEGIN = "<!--- BEGIN: AUTO-GENERATED LIST. DO NOT EDIT. -->";
const README_LIST_END = "<!--- END: AUTO-GENERATED LIST. DO NOT EDIT. -->";

/** Download metadata for one LLVM version, platform, and architecture. */
export interface ManifestEntry {
  architecture: string;
  asset_name: string;
  /** @deprecated Compatibility metadata for older pinned actions. */
  debug: false;
  download_url: string;
  noassert_asset_name?: string;
  noassert_download_url?: string;
  platform: string;
  release_url: string;
  tag: string;
  version: string;
  zstd_asset_name: string;
  zstd_download_url: string;
}

const TARGETS = [
  ["x86_64-unknown-linux-gnu", "linux", "x86"],
  ["aarch64-unknown-linux-gnu", "linux", "aarch64"],
  ["arm64-apple-darwin", "macos", "aarch64"],
  ["x86_64-pc-windows-msvc", "windows", "x86"],
  ["aarch64-pc-windows-msvc", "windows", "aarch64"],
] as const;

/** Identify current target triples and legacy platform/architecture suffixes. */
function getTarget(assetName: string): {
  platform: string;
  architecture: string;
} {
  const stem = assetName.replace(/\.(?:tar\.gz|tar\.zst|zip)$/, "");
  for (const [target, platform, architecture] of TARGETS) {
    if (stem.endsWith(`_${target}`)) {
      return { platform, architecture };
    }
  }
  const legacy = stem.match(/_(linux|macos|windows)_.+_(x86|aarch64)$/i);
  if (legacy) {
    return {
      platform: legacy[1].toLowerCase(),
      architecture: legacy[2].toLowerCase(),
    };
  }
  throw new Error(`Asset ${assetName} does not match any known target.`);
}

/** Fetch SDK releases, newest first. */
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

/** Extract an LLVM release version or commit hash from an archive name. */
function getVersionFromAssetName(assetName: string): string {
  const match = assetName.match(
    /^llvm-mlir_(?:llvmorg-(\d+\.\d+\.\d+)|([0-9a-f]{7,40}))_/i,
  );
  if (!match) {
    throw new Error(`Could not extract version from asset name: ${assetName}`);
  }
  return (match[1] ?? match[2]).toLowerCase();
}

/** Regenerate the available-version list in the README. */
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

/** Index published SDKs and their available assertion-free companions. */
export async function updateManifest(): Promise<void> {
  const token = process.env.GITHUB_TOKEN || "";
  if (!token) {
    core.warning("GITHUB_TOKEN is not set. API rate limits may apply.");
  }
  const octokit = createOctokit(token);

  const releases = await getReleases(octokit);

  const manifest: ManifestEntry[] = [];
  const seen = new Set<string>();
  const zstdAssets = new Map<string, Asset>();
  for (const release of releases) {
    const assets = release.assets.filter(
      (asset) =>
        !/(?:x86_64-apple-darwin|macos_.*_x86)\.|_(?:debug|noassert)/i.test(
          asset.name,
        ),
    );
    for (const asset of assets.filter((asset) =>
      asset.name.startsWith("zstd-"),
    )) {
      const { platform, architecture } = getTarget(asset.name);
      const target = `${platform}/${architecture}`;
      if (!zstdAssets.has(target)) {
        zstdAssets.set(target, asset);
      }
    }
    for (const asset of assets.filter(
      (asset) =>
        asset.name.startsWith("llvm-mlir_") && asset.name.endsWith(".tar.zst"),
    )) {
      try {
        const version = getVersionFromAssetName(asset.name);
        const { platform, architecture } = getTarget(asset.name);
        const key = `${version}/${platform}/${architecture}`;
        if (seen.has(key)) {
          continue;
        }
        const zstd = zstdAssets.get(`${platform}/${architecture}`);
        if (!zstd) {
          throw new Error(`No zstd binary found for ${asset.name}.`);
        }
        const noassert = release.assets.find(
          (candidate) =>
            candidate.name ===
            asset.name.replace(/\.tar\.zst$/, "_noassert.tar.zst"),
        );
        manifest.push({
          architecture,
          asset_name: asset.name,
          debug: false,
          download_url: asset.browser_download_url,
          noassert_asset_name: noassert?.name,
          noassert_download_url: noassert?.browser_download_url,
          platform,
          release_url: release.html_url,
          tag: release.tag_name,
          version,
          zstd_asset_name: zstd.name,
          zstd_download_url: zstd.browser_download_url,
        });
        seen.add(key);
      } catch (error) {
        core.warning(
          `Skipping asset ${asset.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
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

  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
  await updateReadme(new Set(manifest.map((entry) => entry.version)));

  core.setOutput("latest-tag", releases[0]?.tag_name);
}
