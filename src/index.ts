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

import * as core from "@actions/core"
import * as tc from "@actions/tool-cache"
import * as exec from "@actions/exec"
import getDownloadLink from "./get-download-link.js"
import path from "node:path"

/**
 * Setup MLIR toolchain
 * @returns {Promise<void>}
 */
async function run(): Promise<void> {
  const tag = core.getInput("tag", { required: true })
  const platform = core.getInput("platform", { required: true })
  const architecture = core.getInput("architecture", { required: true })
  const token = core.getInput("token", { required: true })

  core.debug("==> Determining asset URL")
  const asset = await getDownloadLink(token, tag, platform, architecture)
  core.debug(`==> Downloading asset: ${asset.url}`)
  const file = await tc.downloadTool(asset.url)
  core.debug("==> Extracting asset")
  const dir = await tc.extractTar(path.resolve(file), undefined, ["--zstd", "-xv"])
  core.debug("==> Adding MLIR toolchain to tool cache")
  const cachedPath = await tc.cacheDir(dir, "llvm-mlir-toolchain", tag)

  core.debug("==> Adding MLIR toolchain to PATH")
  core.addPath(path.join(cachedPath, "bin"))
  core.debug("==> Exporting LLVM_DIR")
  core.exportVariable("LLVM_DIR", path.join(cachedPath, "lib", "cmake", "llvm"))
  core.debug("==> Exporting MLIR_DIR")
  core.exportVariable("MLIR_DIR", path.join(cachedPath, "lib", "cmake", "mlir"))
}

try {
  core.debug("==> Starting MLIR toolchain setup")
  run()
  core.debug("==> Finished MLIR toolchain setup")
} catch (error) {
  if (typeof error === "string") {
    core.setFailed(error)
  } else if (error instanceof Error) {
    core.setFailed(error.message)
  }
}
