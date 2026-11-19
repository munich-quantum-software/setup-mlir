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
import * as fs from "node:fs";
import type { ManifestEntry } from "../src/utils/manifest.js";

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
let getDownloadUrl: typeof import("../src/utils/download.js").getDownloadUrl;

beforeAll(async () => {
  ({ getDownloadUrl } = await import("../src/utils/download.js"));
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
        const url = await getDownloadUrl(
          version,
          platform,
          architecture,
          assertions,
        );
        expect(url).toContain(
          `/llvm-mlir_llvmorg-${version}_${target}${assertions ? "" : "_noassert"}.tar.zst`,
        );
      }
    },
  );

  it("resolves commit prefixes on the host", async () => {
    const url = await getDownloadUrl("f8cb798", "host", "host");
    expect(url).toMatch(/\/llvm-mlir_f8cb798[0-9a-f]+_.*\.tar\.zst$/);
  });

  it.each([true, false])(
    "reads the explicit URLs once with assertions=%s",
    async (assertions) => {
      const read = jest
        .spyOn(fs.promises, "readFile")
        .mockResolvedValue(JSON.stringify([entry]));
      const fetch = jest.spyOn(global, "fetch");
      expect(await getDownloadUrl(version, "linux", "x86", assertions)).toBe(
        assertions ? entry.download_url : entry.noassert_download_url,
      );
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
    expect(await getDownloadUrl(version, "linux", "x86")).toBe(
      entry.download_url,
    );
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
      await expect(getDownloadUrl(version, "linux", "x86")).rejects.toThrow(
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
    await expect(getDownloadUrl(version, "linux", "x86")).rejects.toThrow(
      error === "EACCES" ? error : SyntaxError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects duplicate default entries", async () => {
    jest
      .spyOn(fs.promises, "readFile")
      .mockResolvedValue(JSON.stringify([entry, entry]));
    await expect(getDownloadUrl(version, "linux", "x86")).rejects.toThrow(
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
    expect(await getDownloadUrl(version, "linux", "x86")).toBe(
      entry.download_url,
    );
    await expect(
      getDownloadUrl(version, "linux", "x86", false),
    ).rejects.toThrow("assertions=OFF");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid", "X86", "Invalid platform: invalid"],
    ["linux", "invalid", "Invalid architecture: invalid"],
    ["macOS", "X86", "macOS requires AArch64 architecture"],
  ])("rejects %s/%s", async (platform, architecture, message) => {
    await expect(
      getDownloadUrl(version, platform, architecture),
    ).rejects.toThrow(message);
  });
});

it("rejects invalid versions before downloading", async () => {
  await expect(
    getDownloadUrl("invalid-version", "host", "host"),
  ).rejects.toThrow("Invalid LLVM version");
});
