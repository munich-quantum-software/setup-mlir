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

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  findExecutable,
  getArchString,
  getZstdExecutableName,
} from "../src/utils.js";

describe("Utils", () => {
  let testDir: string;

  beforeAll(() => {
    // Create a temporary test directory structure
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "setup-mlir-test-"));

    // Create nested directory structure
    fs.mkdirSync(path.join(testDir, "bin"), { recursive: true });
    fs.mkdirSync(path.join(testDir, "lib", "nested"), { recursive: true });
    fs.mkdirSync(path.join(testDir, "empty"), { recursive: true });

    // Create test files
    fs.writeFileSync(path.join(testDir, "bin", "zstd"), "fake executable");
    fs.writeFileSync(path.join(testDir, "lib", "nested", "tool"), "fake tool");
    fs.writeFileSync(path.join(testDir, "lib", "other.txt"), "text file");
  });

  afterAll(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("findExecutable", () => {
    it("should find executable in root directory", () => {
      fs.writeFileSync(path.join(testDir, "root-exe"), "executable");
      const result = findExecutable(testDir, "root-exe");
      expect(result).toBe(path.join(testDir, "root-exe"));
    });

    it("should find executable in subdirectory", () => {
      const result = findExecutable(testDir, "zstd");
      expect(result).toBe(path.join(testDir, "bin", "zstd"));
    });

    it("should find executable in deeply nested directory", () => {
      const result = findExecutable(testDir, "tool");
      expect(result).toBe(path.join(testDir, "lib", "nested", "tool"));
    });

    it("should return undefined when executable not found", () => {
      const result = findExecutable(testDir, "nonexistent");
      expect(result).toBeUndefined();
    });

    it("should return undefined for empty directory", () => {
      const result = findExecutable(path.join(testDir, "empty"), "anything");
      expect(result).toBeUndefined();
    });

    it("should not match files with different names", () => {
      const result = findExecutable(testDir, "zst");
      expect(result).toBeUndefined();
    });
  });

  describe("getArchString", () => {
    describe("Linux", () => {
      it("should return x86_64 for X86 on linux", () => {
        expect(getArchString("linux", "X86")).toBe("x86_64");
      });

      it("should return aarch64 for AArch64 on linux", () => {
        expect(getArchString("linux", "AArch64")).toBe("aarch64");
      });
    });

    describe("macOS", () => {
      it("should return x86_64 for X86 on macOS", () => {
        expect(getArchString("macOS", "X86")).toBe("x86_64");
      });

      it("should return arm64 for AArch64 on macOS", () => {
        expect(getArchString("macOS", "AArch64")).toBe("arm64");
      });
    });

    describe("Windows", () => {
      it("should return X64 for X86 on windows", () => {
        expect(getArchString("windows", "X86")).toBe("X64");
      });

      it("should return Arm64 for AArch64 on windows", () => {
        expect(getArchString("windows", "AArch64")).toBe("Arm64");
      });
    });

    describe("Error cases", () => {
      it("should throw error for invalid platform", () => {
        expect(() => getArchString("invalid", "X86")).toThrow(
          "Invalid platform: invalid",
        );
      });

      it("should throw error for unsupported platform", () => {
        expect(() => getArchString("freebsd", "X86")).toThrow(
          "Invalid platform: freebsd",
        );
      });
    });
  });

  describe("getZstdExecutableName", () => {
    it("should return zstd.exe for Windows", () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      expect(getZstdExecutableName()).toBe("zstd.exe");

      // Restore
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    });

    it("should return zstd for non-Windows platforms", () => {
      const originalPlatform = process.platform;

      for (const platform of ["linux", "darwin", "freebsd"]) {
        Object.defineProperty(process, "platform", {
          value: platform,
          configurable: true,
        });

        expect(getZstdExecutableName()).toBe("zstd");
      }

      // Restore
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    });
  });
});
