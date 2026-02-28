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

import { promises as fs } from "node:fs";
import { ManifestEntry } from "./manifest.js";
import { MANIFEST_FILE } from "./constants.js";

import { getPlatform, getArchitecture } from "./platform.js";

/**
 * Get the manifest entry for the specified arguments
 * @param version The requested LLVM version
 * @param platform The platform
 * @param architecture The architecture
 * @returns The manifest entry
 */
async function getManifestEntry(
  version: string,
  platform: string,
  architecture: string,
): Promise<ManifestEntry> {
  // Normalize inputs
  version = version.toLowerCase();
  platform = getPlatform(platform);
  architecture = getArchitecture(architecture);

  const manifest = await loadManifest();

  const entry = manifest.find(
    (entry) =>
      entry.version.startsWith(version) &&
      entry.platform === platform &&
      entry.architecture === architecture,
  );

  if (!entry) {
    throw new Error(
      `No ${architecture} ${platform} archive found for LLVM ${version}.`,
    );
  }
  return entry;
}

/**
 * Load the manifest from the local file system or remote URL
 * @returns The manifest entries
 */
async function loadManifest(): Promise<ManifestEntry[]> {
  try {
    const fileContent = await fs.readFile(MANIFEST_FILE, "utf-8");
    return JSON.parse(fileContent) as ManifestEntry[];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      const actionRepo =
        process.env.GITHUB_ACTION_REPOSITORY ??
        "munich-quantum-software/setup-mlir";
      const actionRef = process.env.GITHUB_ACTION_REF ?? "main";
      const manifestUrl = `https://raw.githubusercontent.com/${actionRepo}/${actionRef}/version-manifest.json`;

      const response = await fetch(manifestUrl, { redirect: "follow" });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch version manifest from ${manifestUrl}: ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as ManifestEntry[];
    }
    throw error;
  }
}

/**
 * Get the download URL for the requested zstd binary
 * @param version The requested LLVM version
 * @param platform The platform
 * @param architecture The architecture
 * @returns The download URL and the asset name
 */
export async function getZstdUrl(
  version: string,
  platform: string,
  architecture: string,
): Promise<{ url: string; name: string }> {
  const entry = await getManifestEntry(version, platform, architecture);
  return { url: entry.zstd_download_url, name: entry.zstd_asset_name };
}

/**
 * Get the download URL for the requested MLIR/LLVM binary
 * @param version The requested LLVM version
 * @param platform The platform
 * @param architecture The architecture
 * @returns The download URL and the asset name
 */
export async function getMLIRUrl(
  version: string,
  platform: string,
  architecture: string,
): Promise<{ url: string; name: string }> {
  const entry = await getManifestEntry(version, platform, architecture);
  return { url: entry.download_url, name: entry.asset_name };
}
