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
import * as tc from "@actions/tool-cache";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import { getDownloadUrls } from "./utils/download.js";
import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";

/** Install the selected SDK into the Actions tool cache and export its paths. */
export async function run(): Promise<void> {
  const llvm_version = core.getInput("llvm-version", { required: true });
  const platform = core.getInput("platform", { required: true });
  const architecture = core.getInput("architecture", { required: true });
  const assertions = core.getBooleanInput("assertions");

  /// Validate LLVM version (either X.Y.Z format or commit hash)
  const isVersionTag = RegExp("^\\d+\\.\\d+\\.\\d+$").test(llvm_version);
  const isCommitHash = RegExp("^[0-9a-f]{7,40}$", "i").test(llvm_version);
  if (!isVersionTag && !isCommitHash) {
    throw new Error(
      `Invalid LLVM version: ${llvm_version}. Expected format: X.Y.Z or a commit hash (minimum 7 characters).`,
    );
  }

  const urls = await getDownloadUrls(
    llvm_version,
    platform,
    architecture,
    assertions,
  );
  core.debug(`==> Downloading zstd binary: ${urls.zstd}`);
  const zstdFile = await tc.downloadTool(urls.zstd);

  core.debug("==> Extracting zstd binary");
  const zstdDir = await tc.extractTar(zstdFile);

  /// zstd archive contains a single executable file
  const zstdExecutableName = process.platform === "win32" ? "zstd.exe" : "zstd";
  const zstdPath = path.join(zstdDir, zstdExecutableName);

  if (!fs.existsSync(zstdPath)) {
    throw new Error(`zstd executable not found at ${zstdPath}`);
  }

  /// Make sure zstd is executable on Unix
  if (process.platform !== "win32") {
    await exec.exec("chmod", ["+x", zstdPath]);
  }

  core.debug(`==> Downloading LLVM distribution: ${urls.llvm}`);
  const file = await tc.downloadTool(urls.llvm);

  core.debug("==> Decompressing and extracting LLVM distribution");
  const extractDir = path.join(
    process.env.RUNNER_TEMP || os.tmpdir(),
    `mlir-extract-${Date.now()}`,
  );
  await io.mkdirP(extractDir);

  /// Extract the archive to a specific directory
  const extractedDir = path.join(extractDir, "extracted");
  await io.mkdirP(extractedDir);

  let cachedPath: string;
  try {
    /// Stream decompression to tar without an intermediate archive.
    const zstd = spawn(zstdPath, ["-d", file, "--long=31", "--stdout"], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const tar = spawn("tar", ["-x", "-f", "-", "-C", extractedDir], {
      stdio: ["pipe", "ignore", "inherit"],
    });
    const exits = [zstd, tar].map(async (child) => {
      const [code] = await once(child, "close");
      if (code !== 0) {
        throw new Error(`${child.spawnfile} exited with code ${code}`);
      }
    });
    try {
      await Promise.all([pipeline(zstd.stdout, tar.stdin), ...exits]);
    } finally {
      zstd.kill();
      tar.kill();
      await Promise.allSettled(exits);
    }

    /// Find the actual LLVM directory (might be nested)
    const entries = fs.readdirSync(extractedDir);
    const dir =
      entries.length === 1 &&
      fs.statSync(path.join(extractedDir, entries[0])).isDirectory()
        ? path.join(extractedDir, entries[0])
        : extractedDir;

    core.debug("==> Adding MLIR toolchain to tool cache");
    cachedPath = await tc.cacheDir(
      dir,
      assertions ? "mlir-toolchain" : "mlir-toolchain-noassert",
      llvm_version,
    );
  } finally {
    /// Clean up temp directories
    await io.rmRF(extractDir);
    await io.rmRF(zstdDir);
    await io.rmRF(zstdFile);
    await io.rmRF(file);
  }

  core.debug("==> Adding MLIR toolchain to PATH");
  core.addPath(path.join(cachedPath, "bin"));
  core.debug("==> Exporting LLVM_DIR");
  core.exportVariable(
    "LLVM_DIR",
    path.join(cachedPath, "lib", "cmake", "llvm"),
  );
  core.debug("==> Exporting MLIR_DIR");
  core.exportVariable(
    "MLIR_DIR",
    path.join(cachedPath, "lib", "cmake", "mlir"),
  );
}

if (process.env.NODE_ENV !== "test") {
  (async () => {
    try {
      core.debug("==> Starting MLIR toolchain setup");
      await run();
      core.debug("==> Finished MLIR toolchain setup");
    } catch (error) {
      if (typeof error === "string") {
        core.setFailed(error);
      } else if (error instanceof Error) {
        core.setFailed(error.message);
      } else {
        core.setFailed(`Unknown error: ${JSON.stringify(error)}`);
      }
    }
  })();
}
