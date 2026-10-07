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

import type { ManifestEntry } from "./manifest.js";
import { getPlatform, getArchitecture } from "./platform.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MANIFEST_FILE = join(__dirname, "..", "..", "version-manifest.json");

/** Resolve the SDK and decompressor together for the requested build. */
export async function getDownloadUrls(
  version: string,
  platform: string,
  architecture: string,
  assertions: boolean = true,
): Promise<{ llvm: string; zstd: string }> {
  version = version.toLowerCase();
  platform = getPlatform(platform);
  architecture = getArchitecture(architecture);
  if (platform === "macos" && architecture !== "aarch64") {
    throw new Error("macOS requires AArch64 architecture.");
  }
  const matches = (entry: ManifestEntry) =>
    (version.includes(".")
      ? entry.version === version
      : entry.version.startsWith(version)) &&
    entry.platform === platform &&
    entry.architecture === architecture;
  let manifest: ManifestEntry[] = [];
  try {
    manifest = JSON.parse(
      await fs.readFile(MANIFEST_FILE, "utf-8"),
    ) as ManifestEntry[];
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )) {
      throw error;
    }
  }
  let entries = manifest.filter(matches);
  if (entries.length === 0) {
    const url =
      "https://raw.githubusercontent.com/munich-quantum-software/setup-mlir/main/version-manifest.json";
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch version manifest from ${url}: ${response.status} ${response.statusText}`,
      );
    }
    entries = ((await response.json()) as ManifestEntry[]).filter(matches);
  }
  if (entries.length !== 1) {
    throw new Error(
      `Expected exactly one ${architecture} ${platform} archive for LLVM ${version}, but found ${entries.length}.`,
    );
  }
  const entry = entries[0];
  const llvm = assertions ? entry.download_url : entry.noassert_download_url;
  if (!llvm || !entry.zstd_download_url) {
    throw new Error(
      `LLVM ${version} for ${platform}/${architecture} with assertions=${assertions ? "ON" : "OFF"} is unavailable.`,
    );
  }
  return { llvm, zstd: entry.zstd_download_url };
}
