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
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { constants, zstdCompressSync } from "node:zlib";
import { installSdk } from "../src/utils/install.js";

let directory: string;
let cache: string;
let archive: Buffer;
let response: Buffer;
let requests = 0;
let url: string;
const server = createServer((_request, reply) => {
  requests++;
  reply.end(response);
});

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "setup-mlir-unit-"));
  const sdk = path.join(directory, "fixture");
  for (const file of [
    "lib/cmake/llvm/LLVMConfig.cmake",
    "lib/cmake/mlir/MLIRConfig.cmake",
    "bin/mlir-opt",
  ]) {
    const output = path.join(sdk, file);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, "SDK fixture");
  }
  const tar = path.join(directory, "fixture.tar");
  execFileSync("tar", ["-cf", tar, "-C", sdk, "."]);
  // Padding makes early tar exit reproducible; the checksum catches a late decoder failure.
  archive = zstdCompressSync(
    Buffer.concat([await fs.readFile(tar), Buffer.alloc(128 * 1024)]),
    { params: { [constants.ZSTD_c_checksumFlag]: 1 } },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server address");
  url = `http://127.0.0.1:${address.port}/release/llvm-sdk.tar.zst`;
});
beforeEach(async () => {
  response = archive;
  requests = 0;
  cache = await fs.mkdtemp(path.join(directory, "cache-"));
});
afterEach(async () => {
  await fs.rm(cache, { recursive: true, force: true });
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await fs.rm(directory, { recursive: true, force: true });
});

describe("SDK cache", () => {
  it("shares one complete entry between concurrent writers and later hits", async () => {
    const [first, second] = await Promise.all([
      installSdk(url, cache),
      installSdk(url, cache),
    ]);
    expect(first).toBe(second);
    expect(
      await fs.readFile(
        path.join(first, "lib/cmake/llvm/LLVMConfig.cmake"),
        "utf8",
      ),
    ).toBe("SDK fixture");
    const downloads = requests;
    expect(downloads).toBeGreaterThan(0);
    expect(await installSdk(url, cache)).toBe(first);
    expect(requests).toBe(downloads);
    expect(await fs.readdir(cache)).toEqual([path.basename(first)]);
  });

  it("separates different release, target and variant URLs", async () => {
    const paths = await Promise.all([
      installSdk(url, cache),
      installSdk(url.replace("/release/", "/rebuilt-release/"), cache),
      installSdk(url.replace("llvm-sdk", "llvm-sdk-other-target"), cache),
      installSdk(url.replace(".tar.zst", "_noassert.tar.zst"), cache),
    ]);
    expect(new Set(paths).size).toBe(4);
  });

  it("does not publish a failed extraction and retries cleanly", async () => {
    response = Buffer.from(archive);
    response[response.length - 1] ^= 1;
    await expect(installSdk(url, cache)).rejects.toThrow();
    expect(await fs.readdir(cache)).toEqual([]);
    response = archive;
    const installed = await installSdk(url, cache);
    expect(
      await fs.readFile(path.join(installed, "bin/mlir-opt"), "utf8"),
    ).toBe("SDK fixture");
  });

  it("rejects valid compressed archives without an SDK", async () => {
    response = zstdCompressSync(Buffer.alloc(10240));
    await expect(installSdk(url, cache)).rejects.toThrow(
      "not a complete MLIR SDK",
    );
    expect(await fs.readdir(cache)).toEqual([]);
  });
});
