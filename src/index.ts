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

import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import getDownloadLink, { getZstdLink } from "./get-download-link.js";
import path from "node:path";
import process from "node:process";
import fs from "node:fs";

/**
 * Setup MLIR toolchain
 * @returns {Promise<void>}
 */
export async function run(): Promise<void> {
  const llvm_version = core.getInput("llvm-version", { required: true });
  const platform = core.getInput("platform", { required: true });
  const architecture = core.getInput("architecture", { required: true });
  const token = core.getInput("token", { required: true });
  const debug = core.getBooleanInput("debug", { required: false });

  // Validate debug flag is only used on Windows
  const isWindows =
    platform === "windows" ||
    (platform === "host" && process.platform === "win32");
  if (debug && !isWindows) {
    throw new Error("Debug builds are only available on Windows.");
  }

  // Validate LLVM version (either X.Y.Z format or commit hash)
  const isVersionTag = RegExp("^\\d+\\.\\d+\\.\\d+$").test(llvm_version);
  const isCommitHash = RegExp("^[0-9a-f]{7,40}$", "i").test(llvm_version);
  if (!isVersionTag && !isCommitHash) {
    throw new Error(
      `Invalid LLVM version: ${llvm_version}. Expected format: X.Y.Z or a commit hash (minimum 7 characters).`,
    );
  }

  core.debug("==> Determining zstd binary URL");
  const zstdAsset = await getZstdLink(
    token,
    llvm_version,
    platform,
    architecture,
  );
  core.debug(`==> Downloading zstd binary: ${zstdAsset.url}`);
  const zstdFile = await tc.downloadTool(zstdAsset.url);

  core.debug("==> Extracting zstd binary");
  let zstdDir: string;
  if (zstdAsset.name.endsWith(".zip")) {
    zstdDir = await tc.extractZip(zstdFile);
  } else {
    zstdDir = await tc.extractTar(zstdFile);
  }

  // zstd archive contains a single executable file
  const zstdExecutableName = process.platform === "win32" ? "zstd.exe" : "zstd";
  const zstdPath = path.join(zstdDir, zstdExecutableName);

  if (!fs.existsSync(zstdPath)) {
    throw new Error(`zstd executable not found at ${zstdPath}`);
  }

  // Make sure zstd is executable on Unix
  if (process.platform !== "win32") {
    await exec.exec("chmod", ["+x", zstdPath]);
  }

  core.debug("==> Determining LLVM asset URL");
  const asset = await getDownloadLink(
    token,
    llvm_version,
    platform,
    architecture,
    debug,
  );
  core.debug(`==> Downloading LLVM asset: ${asset.url}`);
  const file = await tc.downloadTool(asset.url);

  core.debug("==> Decompressing and extracting LLVM distribution");
  const extractDir = path.join(
    process.env.RUNNER_TEMP || "/tmp",
    `mlir-extract-${Date.now()}`,
  );
  await io.mkdirP(extractDir);

  // Extract the archive to a specific directory
  const extractedDir = path.join(extractDir, "extracted");
  await io.mkdirP(extractedDir);
  if (process.platform === "win32") {
    const command = `& "${zstdPath}" -d "${file}" --long=30 --stdout | tar -x -f - -C "${extractedDir}"`;
    await exec.exec("powershell", ["-Command", command]);
  } else {
    const command = `"${zstdPath}" -d "${file}" --long=30 --stdout | tar -x -f - -C "${extractedDir}"`;
    await exec.exec("sh", ["-c", command]);
  }

  // Find the actual LLVM directory (might be nested)
  const entries = fs.readdirSync(extractedDir);
  const dir =
    entries.length === 1 &&
    fs.statSync(path.join(extractedDir, entries[0])).isDirectory()
      ? path.join(extractedDir, entries[0])
      : extractedDir;

  core.debug("==> Adding MLIR toolchain to tool cache");
  const cachedPath = await tc.cacheDir(dir, "mlir-toolchain", llvm_version);

  // Cleanup (after caching)
  await io.rmRF(extractDir);
  await io.rmRF(zstdDir);

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

// Run if this module is executed directly (not during tests)
// Note: In production, this is bundled by ncc, so this check doesn't affect the action
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
