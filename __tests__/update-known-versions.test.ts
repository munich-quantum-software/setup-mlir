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

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import * as path from "node:path";
import * as os from "node:os";
import process from "node:process";
import type { ManifestEntry } from "../src/utils/manifest.js";

describe("Update Known Versions", () => {
  const testToken = process.env.GITHUB_TOKEN || "";
  let tempDir: string;
  let tempManifestPath: string;
  let actualFsModule: any;
  let updateManifest: () => Promise<void>;

  beforeEach(async () => {
    // Create temporary directory
    const { mkdtemp } = await import("node:fs/promises");
    tempDir = await mkdtemp(path.join(os.tmpdir(), "manifest-test-"));
    tempManifestPath = path.join(tempDir, "test-version-manifest.json");

    // Get the actual fs module
    actualFsModule = await import("node:fs/promises");

    // Redirect writeFile to temporary file
    jest.unstable_mockModule("node:fs/promises", () => ({
      ...actualFsModule,
      writeFile: jest.fn(async (_file: any, data: any, options?: any) => {
        return actualFsModule.writeFile(tempManifestPath, data, options);
      }),
    }));

    // Import manifest module after mocking
    const manifestModule = await import("../src/utils/manifest.js");
    updateManifest = manifestModule.updateManifest;
  });

  afterEach(async () => {
    // Clean up
    jest.unstable_mockModule("node:fs/promises", () => actualFsModule);
    if (tempDir) {
      await actualFsModule.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should generate a valid manifest with entries", async () => {
    if (!testToken) {
      console.log("Skipping: No GITHUB_TOKEN available");
      return;
    }

    // Call updateManifest
    await updateManifest();

    // Parse the generated manifest
    const fileContent = await actualFsModule.readFile(
      tempManifestPath,
      "utf-8",
    );
    const manifest: ManifestEntry[] = JSON.parse(fileContent);

    // Verify manifest is an array with entries
    expect(Array.isArray(manifest)).toBe(true);
    expect(manifest.length).toBeGreaterThan(0);

    // Verify at least one entry has valid data
    const entry = manifest[0];

    // Check that all required fields exist
    expect(entry.architecture).toBeTruthy();
    expect(entry.asset_name).toBeTruthy();
    expect(typeof entry.debug).toBe("boolean");
    expect(entry.download_url).toBeTruthy();
    expect(entry.platform).toBeTruthy();
    expect(entry.release_url).toBeTruthy();
    expect(entry.tag).toBeTruthy();
    expect(entry.version).toBeTruthy();

    // Verify version is either semantic version or commit hash
    const isSemanticVersion = /^\d+\.\d+\.\d+$/.test(entry.version);
    const isCommitHash = /^[0-9a-f]{7,40}$/i.test(entry.version);
    expect(isSemanticVersion || isCommitHash).toBe(true);

    // Verify tag is a calendar version (YYYY.MM.DD format)
    const isCalendarVersion = /^\d{4}\.\d{2}\.\d{2}$/.test(entry.tag);
    expect(isCalendarVersion).toBe(true);

    // Verify platform is valid
    expect(["linux", "macos", "windows"]).toContain(entry.platform);

    // Verify architecture is valid
    expect(["x86", "aarch64"]).toContain(entry.architecture);

    // Verify download URL is from the correct repository
    expect(entry.download_url).toContain(
      "github.com/munich-quantum-software/portable-mlir-toolchain/releases/download",
    );

    // Verify release URL is from the correct repository
    expect(entry.release_url).toContain(
      "github.com/munich-quantum-software/portable-mlir-toolchain/releases/tag",
    );

    // Verify asset name matches expected pattern
    expect(entry.asset_name).toMatch(/^llvm-mlir_.*\.tar\.zst$/);
  }, 600000); // 10 minute timeout
});
