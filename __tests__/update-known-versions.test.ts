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

import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { promises as fs } from "node:fs";
import type { ManifestEntry } from "../src/utils/manifest.js";

const request =
  jest.fn<(route: string, options: unknown) => Promise<{ data: unknown[] }>>();
const setOutput = jest.fn();
jest.unstable_mockModule("../src/utils/create-octokit.js", () => ({
  createOctokit: () => ({ request }),
}));
jest.unstable_mockModule("@actions/core", () => ({
  warning: jest.fn(),
  setOutput,
}));
let updateManifest: typeof import("../src/utils/manifest.js").updateManifest;
beforeAll(
  async () => ({ updateManifest } = await import("../src/utils/manifest.js")),
);
afterEach(() => jest.restoreAllMocks());

const targets = [
  ["linux", "x86", "x86_64-unknown-linux-gnu", "linux_x86_64_X86"],
  ["linux", "aarch64", "aarch64-unknown-linux-gnu", "linux_aarch64_AArch64"],
  ["macos", "aarch64", "arm64-apple-darwin", "macos_arm64_AArch64"],
  ["windows", "x86", "x86_64-pc-windows-msvc", "windows_X64_X86"],
  ["windows", "aarch64", "aarch64-pc-windows-msvc", "windows_Arm64_AArch64"],
];
const asset = (name: string) => ({
  name,
  browser_download_url: `https://example.com/${name}`,
});
const modern = targets.map(
  ([, , target]) => `llvm-mlir_llvmorg-23.1.2_${target}.tar.zst`,
);
const legacy = targets.map(
  ([, , , target]) => `llvm-mlir_llvmorg-21.1.8_${target}.tar.zst`,
);
const hash = "f8cb7987c64dcffb72414a40560055cb717dbf74";
const releases = [
  {
    tag_name: "2026.01.08",
    created_at: "2026-01-08T00:00:00Z",
    html_url: "https://example.com/old",
    assets: [
      ...targets.map(([, , , target]) => `zstd-1.5.7_${target}.tar.gz`),
      ...legacy,
      modern[0],
    ].map(asset),
  },
  {
    tag_name: "2026.10.06",
    created_at: "2026-10-06T00:00:00Z",
    html_url: "https://example.com/current",
    assets: [
      ...targets.map(([, , target]) => `zstd-1.5.7_${target}.tar.gz`),
      ...modern,
      ...modern.map((name) => name.replace(".tar.zst", "_noassert.tar.zst")),
      "llvm-mlir_llvmorg-23.1.2_x86_64-apple-darwin.tar.zst",
      "llvm-mlir_llvmorg-23.1.2_x86_64-pc-windows-msvc_debug.tar.zst.part1",
    ].map(asset),
  },
  {
    tag_name: "2025.12.23",
    created_at: "2025-12-23T00:00:00Z",
    html_url: "https://example.com/commit",
    assets: [asset(`llvm-mlir_${hash}_linux_x86_64_X86.tar.zst`)],
  },
];
const readme =
  "before\n<!--- BEGIN: AUTO-GENERATED LIST. DO NOT EDIT. -->\nstale\n<!--- END: AUTO-GENERATED LIST. DO NOT EDIT. -->\nafter\n";

describe("Manifest generation", () => {
  it("records companions without adding rows visible to pinned actions", async () => {
    request.mockResolvedValue({ data: releases });
    jest.spyOn(fs, "readFile").mockResolvedValue(readme);
    const write = jest.spyOn(fs, "writeFile").mockResolvedValue(undefined);
    await updateManifest();
    const manifest: ManifestEntry[] = JSON.parse(
      String(
        write.mock.calls.find(([file]) =>
          String(file).endsWith("version-manifest.json"),
        )![1],
      ),
    );
    expect(manifest).toHaveLength(11);
    for (const [i, [platform, architecture, target]] of targets.entries()) {
      const current = manifest.filter(
        (entry) =>
          entry.version === "23.1.2" &&
          entry.platform === platform &&
          entry.architecture === architecture &&
          entry.debug === false,
      );
      expect(current).toEqual([
        {
          architecture,
          platform,
          version: "23.1.2",
          debug: false,
          tag: "2026.10.06",
          release_url: "https://example.com/current",
          asset_name: modern[i],
          download_url: asset(modern[i]).browser_download_url,
          noassert_asset_name: modern[i].replace(
            ".tar.zst",
            "_noassert.tar.zst",
          ),
          noassert_download_url: asset(
            modern[i].replace(".tar.zst", "_noassert.tar.zst"),
          ).browser_download_url,
          zstd_asset_name: `zstd-1.5.7_${target}.tar.gz`,
          zstd_download_url: asset(`zstd-1.5.7_${target}.tar.gz`)
            .browser_download_url,
        },
      ]);
      const old = manifest.find(
        (entry) =>
          entry.version === "21.1.8" &&
          entry.platform === platform &&
          entry.architecture === architecture,
      )!;
      expect(old.asset_name).toBe(legacy[i]);
      expect(old).not.toHaveProperty("noassert_asset_name");
      expect(old).not.toHaveProperty("noassert_download_url");
    }
    expect(manifest.some((entry) => entry.version === hash)).toBe(true);
    const updatedReadme = String(
      write.mock.calls.find(([file]) => String(file).endsWith("README.md"))![1],
    );
    expect(updatedReadme).toContain("before\n");
    expect(updatedReadme).toContain("\nafter\n");
    expect(updatedReadme).not.toContain("stale");
    expect(updatedReadme).toContain("- `21.1.8`\n- `23.1.2`");
    expect(updatedReadme).toContain(`- \`${hash}\``);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/releases",
      expect.objectContaining({ page: 1, per_page: 100 }),
    );
    expect(setOutput).toHaveBeenCalledWith("latest-tag", "2026.10.06");
  });
});
