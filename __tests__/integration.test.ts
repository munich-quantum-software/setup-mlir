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
import * as io from "@actions/io";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import process from "node:process";

// Create mock functions
const mockGetInput =
  jest.fn<(name: string, options?: { required?: boolean }) => string>();
const mockGetBooleanInput =
  jest.fn<(name: string, options?: { required?: boolean }) => boolean>();
const mockDebug = jest.fn<(message: string) => void>();
const mockIsDebug = jest.fn<() => boolean>(() => false);
const mockAddPath = jest.fn<(pathToAdd: string) => void>();
const mockExportVariable = jest.fn<(name: string, value: string) => void>();
const mockSetFailed = jest.fn<(message: string) => void>();

const mockCore = {
  getInput: mockGetInput,
  getBooleanInput: mockGetBooleanInput,
  debug: mockDebug,
  isDebug: mockIsDebug,
  addPath: mockAddPath,
  exportVariable: mockExportVariable,
  setFailed: mockSetFailed,
};

// Mock @actions/core before importing it
jest.unstable_mockModule("@actions/core", () => mockCore);

describe("setup-mlir Integration Tests", () => {
  const testVersion = "21.1.8";
  const testVersionCommit = "f8cb798";
  const testToken = process.env.GITHUB_TOKEN || "";
  let cachedPath: string | undefined;
  let run: () => Promise<void>;

  beforeAll(async () => {
    const module = await import("../src/index.js");
    run = module.run;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up environment for tests
    if (!process.env.RUNNER_TEMP) {
      process.env.RUNNER_TEMP = os.tmpdir();
    }
    if (!process.env.RUNNER_TOOL_CACHE) {
      process.env.RUNNER_TOOL_CACHE = path.join(os.tmpdir(), "tool-cache");
    }

    // Setup default mock implementations
    mockCore.getInput.mockImplementation((name: string) => {
      if (name === "llvm-version") return testVersion;
      if (name === "platform") return "host";
      if (name === "architecture") return "host";
      if (name === "token") return testToken;
      return "";
    });

    mockCore.getBooleanInput.mockImplementation((name: string) => {
      if (name === "debug") return false;
      return false;
    });

    mockCore.debug.mockImplementation(() => {});
    mockCore.addPath.mockImplementation((pathToAdd: string) => {
      // Capture the cached path for cleanup
      if (pathToAdd.includes("mlir-toolchain")) {
        cachedPath = path.dirname(pathToAdd);
      }
    });
    mockCore.exportVariable.mockImplementation(() => {});
    mockCore.setFailed.mockImplementation(() => {});
  });

  afterEach(async () => {
    // Clean up cached toolchain if it exists
    if (cachedPath && fs.existsSync(cachedPath)) {
      await io.rmRF(cachedPath);
    }
    cachedPath = undefined;
  }, 30000); // 30 second timeout for cleanup

  describe("Version Validation", () => {
    it("should validate version tag format", () => {
      const isVersionTag = RegExp("^\\d+\\.\\d+\\.\\d+$").test(testVersion);
      expect(isVersionTag).toBe(true);
    });

    it("should validate commit hash format", () => {
      const isCommitHash = RegExp("^[0-9a-f]{7,40}$", "i").test(
        testVersionCommit,
      );
      expect(isCommitHash).toBe(true);
    });

    it("should reject invalid version format", () => {
      const invalidVersion = "invalid-version-123";
      const isVersionTag = RegExp("^\\d+\\.\\d+\\.\\d+$").test(invalidVersion);
      const isCommitHash = RegExp("^[0-9a-f]{7,40}$", "i").test(invalidVersion);
      expect(isVersionTag).toBe(false);
      expect(isCommitHash).toBe(false);
    });

    it("should reject non-existent version", async () => {
      const { getMlirUrl } = await import("../src/utils/download.js");

      await expect(
        getMlirUrl("99.99.99", "host", "host", false),
      ).rejects.toThrow();
    });
  });

  describe("Platform and Architecture Detection", () => {
    it("should detect current platform", () => {
      const expectedPlatform =
        process.platform === "linux"
          ? "linux"
          : process.platform === "darwin"
            ? "macOS"
            : process.platform === "win32"
              ? "windows"
              : null;

      expect(expectedPlatform).not.toBeNull();
    });

    it("should detect current architecture", () => {
      const expectedArch =
        process.arch === "x64"
          ? "X86"
          : process.arch === "arm64"
            ? "AArch64"
            : null;

      expect(expectedArch).not.toBeNull();
    });

    it("should handle explicit platform specification", async () => {
      if (!testToken) {
        console.log("Skipping: No GITHUB_TOKEN available");
        return;
      }

      const { getMlirUrl } = await import("../src/utils/download.js");

      // Test explicit linux platform
      const linuxAsset = await getMlirUrl(testVersion, "linux", "X86", false);
      expect(linuxAsset.name).toContain("linux");
      expect(linuxAsset.name).toContain("x86_64");
    });

    it("should handle explicit architecture specification", async () => {
      if (!testToken) {
        console.log("Skipping: No GITHUB_TOKEN available");
        return;
      }

      const { getMlirUrl } = await import("../src/utils/download.js");

      // Test with current platform but explicit architecture
      const platform =
        process.platform === "linux"
          ? "linux"
          : process.platform === "darwin"
            ? "macOS"
            : "windows";

      const asset = await getMlirUrl(testVersion, platform, "X86", false);
      expect(asset.url).toBeTruthy();
      expect(asset.name).toContain("X86");
    });
  });

  describe("Asset Download", () => {
    it("should fetch download link for LLVM distribution", async () => {
      const { getMlirUrl } = await import("../src/utils/download.js");

      const asset = await getMlirUrl(testVersion, "host", "host", false);

      expect(asset.url).toBeTruthy();
      expect(asset.name).toMatch(/^llvm-mlir_.*\.tar\.zst$/);
    });

    it("should fetch download link for zstd binary", async () => {
      const { getZstdUrl } = await import("../src/utils/download.js");

      const zstdAsset = await getZstdUrl(
        testToken,
        testVersion,
        "host",
        "host",
      );

      expect(zstdAsset.url).toBeTruthy();
      expect(zstdAsset.name).toMatch(/^zstd-.*\.(tar\.gz|zip)$/);
    });

    it("should fall back to latest release for zstd when version release doesn't have it", async () => {
      const { getZstdUrl } = await import("../src/utils/download.js");

      const zstdAsset = await getZstdUrl(
        testToken,
        testVersionCommit,
        "host",
        "host",
      );

      expect(zstdAsset.url).toBeTruthy();
      expect(zstdAsset.name).toMatch(/^zstd-.*\.(tar\.gz|zip)$/);
    });
  });

  describe("Full Setup Integration", () => {
    it("should complete full setup for current platform", async () => {
      if (!testToken) {
        console.log("Skipping: No GITHUB_TOKEN available");
        return;
      }

      // Run the actual setup function
      await run();

      // Verify mocks were called correctly
      expect(mockCore.addPath).toHaveBeenCalled();

      // Check LLVM_DIR was set correctly (normalize paths for cross-platform)
      const llvmDirCall = mockCore.exportVariable.mock.calls.find(
        (call) => call[0] === "LLVM_DIR",
      );
      expect(llvmDirCall).toBeDefined();
      expect(llvmDirCall![1]).toMatch(/lib[\/\\]cmake[\/\\]llvm$/);

      // Check MLIR_DIR was set correctly
      const mlirDirCall = mockCore.exportVariable.mock.calls.find(
        (call) => call[0] === "MLIR_DIR",
      );
      expect(mlirDirCall).toBeDefined();
      expect(mlirDirCall![1]).toMatch(/lib[\/\\]cmake[\/\\]mlir$/);
      expect(mockCore.setFailed).not.toHaveBeenCalled();

      // Get the cached path from the addPath call
      const addPathCall = mockCore.addPath.mock.calls[0];
      if (addPathCall) {
        const binPath = addPathCall[0] as string;
        const cachedDir = path.dirname(binPath);

        // Verify the structure
        expect(fs.existsSync(binPath)).toBe(true);
        expect(
          fs.existsSync(path.join(cachedDir, "lib", "cmake", "llvm")),
        ).toBe(true);
        expect(
          fs.existsSync(path.join(cachedDir, "lib", "cmake", "mlir")),
        ).toBe(true);

        // Verify binaries exist
        const mlirOptName =
          process.platform === "win32" ? "mlir-opt.exe" : "mlir-opt";
        const mlirOptPath = path.join(binPath, mlirOptName);
        expect(fs.existsSync(mlirOptPath)).toBe(true);

        // Verify mlir-opt can run and check version
        const { execSync } = await import("node:child_process");
        const versionOutput = execSync(`"${mlirOptPath}" --version`, {
          encoding: "utf8",
        });
        expect(versionOutput).toContain("LLVM version");
        expect(versionOutput).toContain(testVersion);

        cachedPath = cachedDir;
      }
    }, 600000); // 10 minute timeout

    it("should handle debug flag on Windows", async () => {
      if (process.platform !== "win32") {
        console.log("Skipping: Only available on Windows");
        return;
      }

      if (!testToken) {
        console.log("Skipping: No GITHUB_TOKEN available");
        return;
      }

      mockCore.getBooleanInput.mockImplementation((name: string) => {
        return name === "debug";
      });

      await run();

      expect(mockCore.addPath).toHaveBeenCalled();
      expect(mockCore.setFailed).not.toHaveBeenCalled();
    }, 600000); // 10 minute timeout

    it("should reject debug flag on non-Windows platforms", async () => {
      if (process.platform === "win32") {
        console.log("Skipping: Only relevant on non-Windows");
        return;
      }

      if (!testToken) {
        console.log("Skipping: No GITHUB_TOKEN available");
        return;
      }

      mockCore.getBooleanInput.mockImplementation((name: string) => {
        return name === "debug";
      });

      await expect(run()).rejects.toThrow(
        "Debug builds are only available on Windows",
      );
    });

    it("should reject invalid version", async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === "llvm-version") return "invalid-version-123";
        if (name === "platform") return "host";
        if (name === "architecture") return "host";
        if (name === "token") return testToken;
        return "";
      });

      await expect(run()).rejects.toThrow("Invalid LLVM version");
    });
  });

  describe("Asset Pattern Matching", () => {
    it("should match correct asset patterns for current platform", async () => {
      const platform =
        process.platform === "linux"
          ? "linux"
          : process.platform === "darwin"
            ? "macOS"
            : "windows";
      const arch = process.arch === "x64" ? "X86" : "AArch64";

      const { getMlirUrl } = await import("../src/utils/download.js");

      const asset = await getMlirUrl(testVersion, platform, arch, false);

      expect(asset.name).toMatch(/^llvm-mlir_llvmorg-21\.1\.8_/);
      expect(asset.name).toContain(platform.toLowerCase());
      expect(asset.name).toMatch(/\.tar\.zst$/);
    });

    it("should match correct zstd patterns for current platform", async () => {
      const { getZstdUrl } = await import("../src/utils/download.js");

      const zstdAsset = await getZstdUrl(
        testToken,
        testVersion,
        "host",
        "host",
      );

      expect(zstdAsset.name).toMatch(/^zstd-/);
      if (process.platform === "win32") {
        expect(zstdAsset.name).toMatch(/\.zip$/);
      } else {
        expect(zstdAsset.name).toMatch(/\.tar\.gz$/);
      }
    });

    it("should reject invalid platform", async () => {
      const { getMlirUrl } = await import("../src/utils/download.js");

      await expect(
        getMlirUrl(testVersion, "invalid", "X86", false),
      ).rejects.toThrow("Invalid platform: invalid");
    });

    it("should reject invalid architecture", async () => {
      const { getMlirUrl } = await import("../src/utils/download.js");

      await expect(
        getMlirUrl(testVersion, "linux", "invalid", false),
      ).rejects.toThrow(
        "Invalid architecture: invalid. Expected X86 or AArch64.",
      );
    });
  });
});
