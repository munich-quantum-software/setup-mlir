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
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { ManifestEntry } from "../src/utils/manifest.js";

const core = {
  getInput: jest.fn<(name: string) => string>(),
  getBooleanInput: jest.fn(() => true),
  debug: jest.fn(),
  isDebug: jest.fn(() => false),
  addPath: jest.fn<(value: string) => void>(),
  exportVariable: jest.fn<(name: string, value: string) => void>(),
  setFailed: jest.fn(),
};
jest.unstable_mockModule("@actions/core", () => core);

const version = "23.1.2";
const entry: ManifestEntry = {
  architecture: "x86",
  platform: "linux",
  version,
  tag: "2026.10.06",
  debug: false,
  release_url: "https://example.com/release",
  asset_name: `llvm-mlir_llvmorg-${version}_x86_64-unknown-linux-gnu.tar.zst`,
  download_url: "https://example.com/default.tar.zst",
  noassert_asset_name: "assertion-free.tar.zst",
  noassert_download_url: "https://example.com/explicit-companion.tar.zst",
  zstd_asset_name: "zstd-1.5.7_x86_64-unknown-linux-gnu.tar.gz",
  zstd_download_url: "https://example.com/zstd.tar.gz",
};
const manifestUrl =
  "https://raw.githubusercontent.com/munich-quantum-software/setup-mlir/main/version-manifest.json";
let getDownloadUrls: typeof import("../src/utils/download.js").getDownloadUrls;
let run: typeof import("../src/index.js").run;

beforeAll(async () => {
  ({ getDownloadUrls } = await import("../src/utils/download.js"));
  ({ run } = await import("../src/index.js"));
});
beforeEach(() => {
  jest.clearAllMocks();
  core.getBooleanInput.mockReturnValue(true);
  core.getInput.mockImplementation((name) =>
    name === "llvm-version" ? version : "host",
  );
});
afterEach(() => jest.restoreAllMocks());

describe("Manifest selection", () => {
  it.each([
    ["linux", "X86", "x86_64-unknown-linux-gnu"],
    ["linux", "AArch64", "aarch64-unknown-linux-gnu"],
    ["macOS", "AArch64", "arm64-apple-darwin"],
    ["windows", "X86", "x86_64-pc-windows-msvc"],
    ["windows", "AArch64", "aarch64-pc-windows-msvc"],
  ])(
    "resolves both variants for %s/%s",
    async (platform, architecture, target) => {
      for (const assertions of [true, false]) {
        const urls = await getDownloadUrls(
          version,
          platform,
          architecture,
          assertions,
        );
        expect(urls.llvm).toContain(
          `/llvm-mlir_llvmorg-${version}_${target}${assertions ? "" : "_noassert"}.tar.zst`,
        );
        expect(urls.zstd).toMatch(
          new RegExp(`/zstd-[^/]+_${target}\\.tar\\.gz$`),
        );
      }
    },
  );

  it("resolves commit prefixes on the host", async () => {
    const urls = await getDownloadUrls("f8cb798", "host", "host");
    expect(urls.llvm).toMatch(/\/llvm-mlir_f8cb798[0-9a-f]+_.*\.tar\.zst$/);
    expect(urls.zstd).toMatch(/\/zstd-.*\.tar\.gz$/);
  });

  it.each([true, false])(
    "reads the explicit URLs once with assertions=%s",
    async (assertions) => {
      const read = jest
        .spyOn(fs.promises, "readFile")
        .mockResolvedValue(JSON.stringify([entry]));
      const fetch = jest.spyOn(global, "fetch");
      expect(
        await getDownloadUrls(version, "linux", "x86", assertions),
      ).toEqual({
        llvm: assertions ? entry.download_url : entry.noassert_download_url,
        zstd: entry.zstd_download_url,
      });
      expect(read).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing file", null],
    ["unknown version", []],
    ["different patch version", [{ ...entry, version: "23.1.20" }]],
  ])("loads main for a %s", async (_reason, local) => {
    const read = jest.spyOn(fs.promises, "readFile");
    if (local === null)
      read.mockRejectedValueOnce(
        Object.assign(new Error("missing"), { code: "ENOENT" }),
      );
    else read.mockResolvedValueOnce(JSON.stringify(local));
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([entry])));
    expect(await getDownloadUrls(version, "linux", "x86")).toEqual({
      llvm: entry.download_url,
      zstd: entry.zstd_download_url,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      manifestUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each([
    [404, "Not Found", "Failed to fetch version manifest"],
    [200, "[]", "but found 0"],
  ])(
    "reports an unusable remote manifest (%s)",
    async (status, body, message) => {
      jest.spyOn(fs.promises, "readFile").mockResolvedValue("[]");
      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(body, { status }));
      await expect(getDownloadUrls(version, "linux", "x86")).rejects.toThrow(
        message,
      );
    },
  );

  it.each(["EACCES", "invalid JSON"])("preserves %s errors", async (error) => {
    const read = jest.spyOn(fs.promises, "readFile");
    if (error === "EACCES")
      read.mockRejectedValueOnce(
        Object.assign(new Error(error), { code: error }),
      );
    else read.mockResolvedValueOnce("invalid JSON");
    const fetch = jest.spyOn(global, "fetch");
    await expect(getDownloadUrls(version, "linux", "x86")).rejects.toThrow(
      error === "EACCES" ? error : SyntaxError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects duplicate default entries", async () => {
    jest
      .spyOn(fs.promises, "readFile")
      .mockResolvedValue(JSON.stringify([entry, entry]));
    await expect(getDownloadUrls(version, "linux", "x86")).rejects.toThrow(
      "Expected exactly one",
    );
  });

  it("retains old defaults and rejects unavailable companions without fetching", async () => {
    jest.spyOn(fs.promises, "readFile").mockResolvedValue(
      JSON.stringify([
        {
          ...entry,
          noassert_asset_name: undefined,
          noassert_download_url: undefined,
        },
      ]),
    );
    const fetch = jest.spyOn(global, "fetch");
    expect((await getDownloadUrls(version, "linux", "x86")).llvm).toBe(
      entry.download_url,
    );
    await expect(
      getDownloadUrls(version, "linux", "x86", false),
    ).rejects.toThrow("assertions=OFF");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid", "X86", "Invalid platform: invalid"],
    ["linux", "invalid", "Invalid architecture: invalid"],
    ["macOS", "X86", "macOS requires AArch64 architecture"],
  ])("rejects %s/%s", async (platform, architecture, message) => {
    await expect(
      getDownloadUrls(version, platform, architecture),
    ).rejects.toThrow(message);
  });
});

describe("Full setup", () => {
  it("rejects invalid versions before downloading", async () => {
    core.getInput.mockImplementation((name) =>
      name === "llvm-version" ? "invalid-version" : "host",
    );
    await expect(run()).rejects.toThrow("Invalid LLVM version");
  });

  it("installs both assertion modes into independent usable caches", async () => {
    const previous = {
      RUNNER_TEMP: process.env.RUNNER_TEMP,
      RUNNER_TOOL_CACHE: process.env.RUNNER_TOOL_CACHE,
    };
    const temp = fs.mkdtempSync(
      path.join(previous.RUNNER_TEMP || os.tmpdir(), "setup-mlir-test-"),
    );
    process.env.RUNNER_TEMP = temp;
    process.env.RUNNER_TOOL_CACHE = path.join(temp, "cache");
    const installed: string[] = [];
    try {
      for (const assertions of [true, false]) {
        jest.clearAllMocks();
        core.getBooleanInput.mockReturnValue(assertions);
        await run();
        expect(core.addPath).toHaveBeenCalledTimes(1);
        const bin = core.addPath.mock.calls[0][0];
        const dir = path.dirname(bin);
        installed.push(dir);
        expect(dir).toContain(
          `${assertions ? "mlir-toolchain" : "mlir-toolchain-noassert"}${path.sep}`,
        );
        expect(core.exportVariable).toHaveBeenCalledWith(
          "LLVM_DIR",
          path.join(dir, "lib", "cmake", "llvm"),
        );
        expect(core.exportVariable).toHaveBeenCalledWith(
          "MLIR_DIR",
          path.join(dir, "lib", "cmake", "mlir"),
        );
        expect(
          fs.existsSync(
            path.join(dir, "lib", "cmake", "mlir", "MLIRConfig.cmake"),
          ),
        ).toBe(true);
        const executable = path.join(
          bin,
          process.platform === "win32" ? "mlir-opt.exe" : "mlir-opt",
        );
        expect(
          execFileSync(executable, ["--version"], { encoding: "utf8" }),
        ).toContain(`LLVM version ${version}`);
      }
      expect(installed[0]).not.toBe(installed[1]);
      for (const [i, dir] of installed.entries()) {
        const config = fs.readFileSync(
          path.join(dir, "lib", "cmake", "llvm", "LLVMConfig.cmake"),
          "utf8",
        );
        expect(config).toContain(
          `set(LLVM_ENABLE_ASSERTIONS ${i === 0 ? "ON" : "OFF"})`,
        );
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }, 1800000);
});
