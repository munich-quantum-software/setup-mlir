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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as core from "@actions/core";

import type { ManifestEntry } from "./manifest.js";
import { getPlatform, getArchitecture } from "./platform.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MANIFEST_FILE = join(__dirname, "..", "..", "version-manifest.json");

/**
 * Get the manifest entry for the specified arguments
 * @param version The requested LLVM version
 * @param platform The platform
 * @param architecture The architecture
 * @param forceRemote Whether to force loading the manifest from the remote URL
 * @returns The manifest entry
 */
async function getManifestEntry(
  version: string,
  platform: string,
  architecture: string,
  forceRemote: boolean = false,
): Promise<ManifestEntry> {
  // Normalize inputs
  version = version.toLowerCase();
  platform = getPlatform(platform);
  architecture = getArchitecture(architecture);
  if (platform === "macos" && architecture !== "aarch64") {
    throw new Error("macOS requires AArch64 architecture.");
  }

  const manifest = await loadManifest(forceRemote);

  const entries = manifest.filter(
    (entry) =>
      entry.version.startsWith(version) &&
      entry.platform === platform &&
      entry.architecture === architecture &&
      entry.asset_name.endsWith(".tar.zst") &&
      !/_(?:debug|noassert)/.test(entry.asset_name),
  );

  if (entries.length === 0 && !forceRemote) {
    core.debug(
      `No local manifest entries found for LLVM ${version}. Retrying with remote manifest.`,
    );
    return await getManifestEntry(version, platform, architecture, true);
  }

  if (entries.length === 0) {
    throw new Error(
      `No ${architecture} ${platform} archive found for LLVM ${version}.`,
    );
  }

  if (entries.length !== 1) {
    throw new Error(
      `Expected exactly one ${architecture} ${platform} archive for LLVM ${version}, but found ${entries.length}.`,
    );
  }

  return entries[0];
}

/**
 * Load the manifest from the remote URL.
 *
 * The manifest is read from the default branch, which knows about all LLVM versions released so
 * far. This allows workflows pinned to an older ref of the action to install versions that were
 * released after that ref.
 *
 * @returns The manifest entries
 */
async function loadManifestFromRemote(): Promise<ManifestEntry[]> {
  const actionRepo =
    process.env.GITHUB_ACTION_REPOSITORY ??
    "munich-quantum-software/setup-mlir";
  // Deliberately not `GITHUB_ACTION_REF`: that ref ships the very manifest the remote lookup is
  // falling back from.
  const actionRef = "main";
  const manifestUrl = `https://raw.githubusercontent.com/${actionRepo}/${actionRef}/version-manifest.json`;

  const response = await fetch(manifestUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(30000), // 30-second timeout
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch version manifest from ${manifestUrl}: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as ManifestEntry[];
}

/**
 * Load the manifest. The manifest is loaded from file if possible, but falls back to the remote URL if the file is not found.
 * @param forceRemote Whether to force loading the manifest from the remote URL
 * @returns The manifest entries
 */
async function loadManifest(
  forceRemote: boolean = false,
): Promise<ManifestEntry[]> {
  if (forceRemote) {
    return await loadManifestFromRemote();
  }

  try {
    const fileContent = await fs.readFile(MANIFEST_FILE, "utf-8");
    return JSON.parse(fileContent) as ManifestEntry[];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return await loadManifestFromRemote();
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
  return {
    url: entry.zstd_download_url,
    name: entry.zstd_asset_name,
  };
}

/**
 * Get the download URL for the requested MLIR/LLVM binary
 * @param version The requested LLVM version
 * @param platform The platform
 * @param architecture The architecture
 * @param assertions Whether to retain LLVM assertions
 * @returns The download URL and the asset name
 */
export async function getMLIRUrl(
  version: string,
  platform: string,
  architecture: string,
  assertions: boolean = true,
): Promise<{ url: string; name: string }> {
  const entry = await getManifestEntry(version, platform, architecture);
  const suffix = assertions ? ".tar.zst" : "_noassert.tar.zst";
  return {
    url: entry.download_url.replace(/\.tar\.zst$/, suffix),
    name: entry.asset_name.replace(/\.tar\.zst$/, suffix),
  };
}
