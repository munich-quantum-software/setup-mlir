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
const mockDebug = jest.fn<(message: string) => void>();
const mockIsDebug = jest.fn<() => boolean>(() => false);
const mockAddPath = jest.fn<(pathToAdd: string) => void>();
const mockExportVariable = jest.fn<(name: string, value: string) => void>();
const mockSetFailed = jest.fn<(message: string) => void>();

const mockCore = {
  getInput: mockGetInput,
  getBooleanInput: jest.fn(() => true),
  debug: mockDebug,
  isDebug: mockIsDebug,
  addPath: mockAddPath,
  exportVariable: mockExportVariable,
  setFailed: mockSetFailed,
};

// Mock @actions/core before importing it
jest.unstable_mockModule("@actions/core", () => mockCore);

describe("setup-mlir Integration Tests", () => {
  const testVersion = "22.1.0";
  const testVersionCommit = "f8cb798";
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
      return "";
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
  }, 30000); // 30-second timeout for cleanup

  describe("Version Validation", () => {
    it("should reject non-existent version", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");

      await expect(getMLIRUrl("99.99.99", "host", "host")).rejects.toThrow();
    });
  });

  describe("Platform and Architecture Detection", () => {
    it("should handle explicit platform specification", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");

      // Test explicit linux platform
      const asset = await getMLIRUrl(testVersion, "linux", "X86");
      expect(asset.name).toContain("linux");
      expect(asset.name).toContain("x86_64");
    });

    it("should handle explicit architecture specification", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");

      // Test with current platform but explicit architecture
      const platform =
        process.platform === "linux"
          ? "linux"
          : process.platform === "darwin"
            ? "macOS"
            : "windows";

      const asset = await getMLIRUrl(testVersion, platform, "AArch64");
      expect(asset.url).toBeTruthy();
      expect(asset.name).toContain(platform === "macOS" ? "arm64" : "aarch64");
    });
  });

  describe("Asset Download", () => {
    it("should fetch download link for LLVM distribution", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");

      const asset = await getMLIRUrl(testVersion, "host", "host");

      expect(asset.url).toBeTruthy();
      expect(asset.name).toMatch(/^llvm-mlir_.*\.tar\.zst$/);
    });

    it.each([
      ["x86", "x86_64-pc-windows-msvc"],
      ["aarch64", "aarch64-pc-windows-msvc"],
    ])(
      "should resolve the Windows %s archive",
      async (architecture, target) => {
        const { getMLIRUrl } = await import("../src/utils/download.js");
        const asset = await getMLIRUrl(testVersion, "windows", architecture);

        expect(asset.name).toBe(
          `llvm-mlir_llvmorg-${testVersion}_${target}.tar.zst`,
        );
        expect(asset.url).toContain(asset.name);
      },
    );

    it("should reject duplicate Release archives", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");
      const entry = {
        architecture: "x86",
        platform: "windows",
        version: testVersion,
        asset_name: `llvm-mlir_llvmorg-${testVersion}_x86_64-pc-windows-msvc.tar.zst`,
      };
      const readFileSpy = jest
        .spyOn(fs.promises, "readFile")
        .mockResolvedValueOnce(JSON.stringify([entry, entry]));

      try {
        await expect(getMLIRUrl(testVersion, "windows", "x86")).rejects.toThrow(
          "Expected exactly one",
        );
      } finally {
        readFileSpy.mockRestore();
      }
    });

    it("should select the assertion-free companion without changing the default", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");
      const ordinary = await getMLIRUrl(testVersion, "linux", "X86");
      const optimized = await getMLIRUrl(testVersion, "linux", "X86", false);
      expect(ordinary.name).not.toContain("_noassert");
      expect(optimized.name).toBe(
        ordinary.name.replace(/\.tar\.zst$/, "_noassert.tar.zst"),
      );
      expect(optimized.url).toBe(
        ordinary.url.replace(/\.tar\.zst$/, "_noassert.tar.zst"),
      );
    });

    it("should fall back to remote manifest when local file is missing", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");
      const readFileSpy = jest
        .spyOn(fs.promises, "readFile")
        .mockRejectedValueOnce(
          Object.assign(new Error("missing"), { code: "ENOENT" }),
        );

      const manifest = [
        {
          architecture: "x86",
          asset_name:
            "llvm-mlir_llvmorg-22.1.0_x86_64-unknown-linux-gnu.tar.zst",
          download_url: "https://example.com/llvm.tar.zst",
          platform: "linux",
          release_url: "https://example.com/release",
          tag: "v22.1.0",
          version: testVersion,
          zstd_asset_name: "zstd-1.5.7_x86_64-unknown-linux-gnu.tar.gz",
          zstd_download_url: "https://example.com/zstd.tar.gz",
        },
      ];

      const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn(
        async (..._args: Parameters<typeof fetch>) =>
          new Response(JSON.stringify(manifest), {
            status: 200,
            statusText: "OK",
          }),
      );

      const originalFetch = global.fetch;
      global.fetch = fetchMock as typeof fetch;
      process.env.GITHUB_ACTION_REPOSITORY =
        "munich-quantum-software/setup-mlir";
      // The ref the action is used at must not affect the remote manifest URL.
      process.env.GITHUB_ACTION_REF = "v1.0.0";

      try {
        const asset = await getMLIRUrl(testVersion, "linux", "X86");
        expect(asset.url).toBe("https://example.com/llvm.tar.zst");
        expect(fetchMock).toHaveBeenCalledWith(
          "https://raw.githubusercontent.com/munich-quantum-software/setup-mlir/main/version-manifest.json",
          expect.objectContaining({
            redirect: "follow",
            signal: expect.any(AbortSignal),
          }),
        );
      } finally {
        readFileSpy.mockRestore();
        global.fetch = originalFetch;
        delete process.env.GITHUB_ACTION_REPOSITORY;
        delete process.env.GITHUB_ACTION_REF;
      }
    });

    it("should fall back to remote manifest when local file doesn't know the version", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");
      // A pinned ref ships a manifest that predates the requested version.
      const readFileSpy = jest
        .spyOn(fs.promises, "readFile")
        .mockResolvedValueOnce(JSON.stringify([]));

      const manifest = [
        {
          architecture: "x86",
          asset_name:
            "llvm-mlir_llvmorg-22.1.0_x86_64-unknown-linux-gnu.tar.zst",
          download_url: "https://example.com/llvm.tar.zst",
          platform: "linux",
          release_url: "https://example.com/release",
          tag: "v22.1.0",
          version: testVersion,
          zstd_asset_name: "zstd-1.5.7_x86_64-unknown-linux-gnu.tar.gz",
          zstd_download_url: "https://example.com/zstd.tar.gz",
        },
      ];

      const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn(
        async (..._args: Parameters<typeof fetch>) =>
          new Response(JSON.stringify(manifest), {
            status: 200,
            statusText: "OK",
          }),
      );

      const originalFetch = global.fetch;
      global.fetch = fetchMock as typeof fetch;
      process.env.GITHUB_ACTION_REPOSITORY =
        "munich-quantum-software/setup-mlir";
      process.env.GITHUB_ACTION_REF = "v1.0.0";

      try {
        const asset = await getMLIRUrl(testVersion, "linux", "X86");
        expect(asset.url).toBe("https://example.com/llvm.tar.zst");
        expect(fetchMock).toHaveBeenCalledWith(
          "https://raw.githubusercontent.com/munich-quantum-software/setup-mlir/main/version-manifest.json",
          expect.objectContaining({
            redirect: "follow",
            signal: expect.any(AbortSignal),
          }),
        );
      } finally {
        readFileSpy.mockRestore();
        global.fetch = originalFetch;
        delete process.env.GITHUB_ACTION_REPOSITORY;
        delete process.env.GITHUB_ACTION_REF;
      }
    });

    it("should fall back to default action repository when env is missing", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");
      const readFileSpy = jest
        .spyOn(fs.promises, "readFile")
        .mockRejectedValueOnce(
          Object.assign(new Error("missing"), { code: "ENOENT" }),
        );

      const manifest = [
        {
          architecture: "x86",
          asset_name: "llvm-mlir_llvmorg-22.1.0_linux_x86_64_X86.tar.zst",
          download_url: "https://example.com/llvm.tar.zst",
          platform: "linux",
          release_url: "https://example.com/release",
          tag: "v22.1.0",
          version: testVersion,
          zstd_asset_name: "zstd-1.5.7_x86_64-unknown-linux-gnu.tar.gz",
          zstd_download_url: "https://example.com/zstd.tar.gz",
        },
      ];

      const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn(
        async (..._args: Parameters<typeof fetch>) =>
          new Response(JSON.stringify(manifest), {
            status: 200,
            statusText: "OK",
          }),
      );

      const originalFetch = global.fetch;
      global.fetch = fetchMock as typeof fetch;
      delete process.env.GITHUB_ACTION_REPOSITORY;

      try {
        const asset = await getMLIRUrl(testVersion, "linux", "X86");
        expect(asset.url).toBe("https://example.com/llvm.tar.zst");
        expect(fetchMock).toHaveBeenCalledWith(
          "https://raw.githubusercontent.com/munich-quantum-software/setup-mlir/main/version-manifest.json",
          expect.objectContaining({
            redirect: "follow",
            signal: expect.any(AbortSignal),
          }),
        );
      } finally {
        readFileSpy.mockRestore();
        global.fetch = originalFetch;
        delete process.env.GITHUB_ACTION_REPOSITORY;
      }
    });

    it("should surface a remote manifest fetch failure", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");
      const readFileSpy = jest
        .spyOn(fs.promises, "readFile")
        .mockRejectedValueOnce(
          Object.assign(new Error("missing"), { code: "ENOENT" }),
        );

      const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn(
        async (..._args: Parameters<typeof fetch>) =>
          new Response("nope", {
            status: 404,
            statusText: "Not Found",
          }),
      );

      const originalFetch = global.fetch;
      global.fetch = fetchMock as typeof fetch;
      process.env.GITHUB_ACTION_REPOSITORY =
        "munich-quantum-software/setup-mlir";

      try {
        await expect(getMLIRUrl(testVersion, "linux", "X86")).rejects.toThrow(
          "Failed to fetch version manifest",
        );
      } finally {
        readFileSpy.mockRestore();
        global.fetch = originalFetch;
        delete process.env.GITHUB_ACTION_REPOSITORY;
      }
    });

    it("should surface non-ENOENT read errors", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");
      const readFileSpy = jest
        .spyOn(fs.promises, "readFile")
        .mockRejectedValueOnce(
          Object.assign(new Error("permission denied"), { code: "EACCES" }),
        );

      try {
        await expect(getMLIRUrl(testVersion, "host", "host")).rejects.toThrow(
          "permission denied",
        );
      } finally {
        readFileSpy.mockRestore();
      }
    });

    it("should fetch download link for zstd binary", async () => {
      const { getZstdUrl } = await import("../src/utils/download.js");

      const zstdAsset = await getZstdUrl(testVersion, "host", "host");

      expect(zstdAsset.url).toBeTruthy();
      expect(zstdAsset.name).toMatch(/^zstd-.*\.(tar\.gz|zip)$/);
    });

    it("should resolve zstd for a commit-based LLVM version", async () => {
      const { getZstdUrl } = await import("../src/utils/download.js");

      const zstdAsset = await getZstdUrl(testVersionCommit, "host", "host");

      expect(zstdAsset.url).toBeTruthy();
      expect(zstdAsset.name).toMatch(/^zstd-.*\.(tar\.gz|zip)$/);
    });
  });

  describe("Full Setup Integration", () => {
    it("should complete full setup for current platform", async () => {
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
    }, 900000); // 15-minute timeout

    it("should reject invalid version", async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === "llvm-version") return "invalid-version-123";
        if (name === "platform") return "host";
        if (name === "architecture") return "host";
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
      const architecture = process.arch === "x64" ? "X86" : "AArch64";

      const { getMLIRUrl } = await import("../src/utils/download.js");

      const asset = await getMLIRUrl(testVersion, platform, architecture);

      const expectedPlatform =
        platform === "linux"
          ? "linux"
          : platform === "macOS"
            ? "apple"
            : "windows";

      expect(asset.name).toMatch(/^llvm-mlir_llvmorg-22\.1\.0_/);
      expect(asset.name).toContain(expectedPlatform.toLowerCase());
      expect(asset.name).toMatch(/\.tar\.zst$/);
    });

    it("should match correct zstd patterns for current platform", async () => {
      const { getZstdUrl } = await import("../src/utils/download.js");

      const zstdAsset = await getZstdUrl(testVersion, "host", "host");

      expect(zstdAsset.name).toMatch(/^zstd-/);
      expect(zstdAsset.name).toMatch(/\.tar\.gz$/);
    });

    it("should reject invalid platform", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");

      await expect(getMLIRUrl(testVersion, "invalid", "X86")).rejects.toThrow(
        "Invalid platform: invalid",
      );
    });

    it("should require AArch64 for macOS", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");

      await expect(getMLIRUrl(testVersion, "macOS", "X86")).rejects.toThrow(
        "macOS requires AArch64 architecture.",
      );
    });

    it("should reject invalid architecture", async () => {
      const { getMLIRUrl } = await import("../src/utils/download.js");

      await expect(getMLIRUrl(testVersion, "linux", "invalid")).rejects.toThrow(
        "Invalid architecture: invalid",
      );
    });
  });
});
