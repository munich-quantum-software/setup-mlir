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

import * as core from "@actions/core";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Octokit, OctokitOptions } from "@octokit/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_OWNER = "munich-quantum-software";
const REPO_NAME = "portable-mlir-toolchain";
const MANIFEST_FILE = join(__dirname, "..", "..", "version-manifest.json");

/**
 * Create an Octokit instance with optional authentication
 * @param token - GitHub token (optional)
 * @returns Octokit instance
 */
function createOctokit(token: string): Octokit {
  const options: OctokitOptions = token ? { auth: token } : {};
  return new Octokit(options);
}

interface ManifestEntry {
  arch: string;
  assetName: string;
  downloadUrl: string;
  isDebug: boolean;
  platform: string;
  tag: string;
  version: string;
}

async function getPlatform(
  assetName: string,
): Promise<[string, string, boolean]> {
  const platformMatch = assetName.match(
    /llvm-mlir_(.+?)_(.+?)_(.+)_(X86|AArch64)(_debug)?\./i,
  );
  if (platformMatch) {
    return [platformMatch[2], platformMatch[3], Boolean(platformMatch[5])];
  }
  throw new Error(`Could not extract platform from asset name: ${assetName}`);
}

async function getVersion(assetName: string): Promise<string> {
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

async function updateManifest(downloadUrls: string[]): Promise<void> {
  const manifest: ManifestEntry[] = [];
  for (const downloadUrl of downloadUrls) {
    const urlParts = downloadUrl.split("/");
    const tag = urlParts[urlParts.length - 2];
    const assetName = urlParts[urlParts.length - 1];
    const [platform, arch, isDebug] = await getPlatform(assetName);
    const version = await getVersion(assetName);
    manifest.push({
      arch: arch,
      assetName: assetName,
      downloadUrl: downloadUrl,
      isDebug: isDebug,
      platform: platform,
      tag: tag,
      version: version,
    });
  }
  core.debug(`Updating manifest file: ${JSON.stringify(manifest)}`);
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest));
}

async function run(): Promise<void> {
  const token = process.env.GITHUB_TOKEN || "";
  const octokit = createOctokit(token);

  const latestRelease = await octokit.request(
    "GET /repos/{owner}/{repo}/releases/latest",
    {
      owner: REPO_OWNER,
      repo: REPO_NAME,
    },
  );

  const releases = await octokit.request("GET /repos/{owner}/{repo}/releases", {
    owner: REPO_OWNER,
    repo: REPO_NAME,
    per_page: 100,
  });

  const downloadUrls: string[] = releases.data.flatMap((release) =>
    release.assets
      .filter((asset) => asset.name.startsWith("llvm-mlir"))
      .map((asset) => asset.browser_download_url),
  );

  await updateManifest(downloadUrls);

  core.setOutput("latest-tag", latestRelease.data.tag_name);
}

run();
