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

import * as core from "@actions/core";
import { downloadTool } from "@actions/tool-cache";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { constants, createZstdDecompress } from "node:zlib";

async function isSdk(directory: string): Promise<boolean> {
  const exists = async (file: string) =>
    fs.stat(path.join(directory, file)).then(
      (stat) => stat.isFile(),
      () => false,
    );
  const [llvm, mlir, unixTool, windowsTool] = await Promise.all([
    exists("lib/cmake/llvm/LLVMConfig.cmake"),
    exists("lib/cmake/mlir/MLIRConfig.cmake"),
    exists("bin/mlir-opt"),
    exists("bin/mlir-opt.exe"),
  ]);
  return llvm && mlir && (unixTool || windowsTool);
}

/** Reuse complete SDKs; publish new entries with one atomic directory rename. */
export async function installSdk(
  url: string,
  cacheRoot: string,
): Promise<string> {
  // The resolved URL includes the release, full commit or version, target and variant.
  const key = createHash("sha256").update(url).digest("hex");
  const cachedPath = path.join(cacheRoot, key);
  if (await isSdk(cachedPath)) {
    core.info(`Using cached MLIR SDK: ${cachedPath}`);
    return cachedPath;
  }
  await fs.mkdir(cacheRoot, { recursive: true });
  // Keep staging on the cache filesystem so publication cannot become a partial copy.
  const staging = await fs.mkdtemp(path.join(cacheRoot, ".install-"));
  try {
    const archive = await downloadTool(url, path.join(staging, "sdk.tar.zst"));
    const extracted = path.join(staging, "extracted");
    await fs.mkdir(extracted);
    // Read through EOF so tar cannot close the pipe before zstd finishes validating.
    const tar = spawn(
      "tar",
      ["-x", "--ignore-zeros", "-f", "-", "-C", extracted],
      {
        stdio: ["pipe", "ignore", "inherit"],
      },
    );
    // Wait for close even after a spawn error so cleanup never races a live extractor.
    let spawnError: Error | undefined;
    tar.on("error", (error) => {
      spawnError = error;
    });
    const closed = new Promise<number | null>((resolve) => {
      tar.on("close", resolve);
    });
    const exited = closed.then((code) => {
      if (spawnError) throw spawnError;
      if (code !== 0) throw new Error(`tar exited with code ${code}`);
    });
    const pumping = pipeline(
      createReadStream(archive),
      createZstdDecompress({
        params: { [constants.ZSTD_d_windowLogMax]: 31 },
      }),
      tar.stdin,
    );
    try {
      await Promise.all([pumping, exited]);
    } finally {
      tar.kill();
      await Promise.allSettled([pumping, exited]);
    }
    const entries = await fs.readdir(extracted, { withFileTypes: true });
    const sdk =
      entries.length === 1 && entries[0].isDirectory()
        ? path.join(extracted, entries[0].name)
        : extracted;
    if (!(await isSdk(sdk))) {
      throw new Error(`Downloaded archive is not a complete MLIR SDK: ${url}`);
    }
    try {
      await fs.rename(sdk, cachedPath);
    } catch (error) {
      // A concurrent installer may have published the same immutable SDK first.
      if (!(await isSdk(cachedPath))) throw error;
    }
    return cachedPath;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}
