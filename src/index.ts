// Copyright (c) 2025 Lukas Burgholzer
// All rights reserved.
//
// SPDX-License-Identifier: MIT
//
// Licensed under the MIT License

import * as core from "@actions/core"
import * as tc from "@actions/tool-cache"
import getDownloadLink from "./get-download-link.js"
import path from "node:path"

/**
 * Setup LLVM/MLIR toolchain
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
  core.debug("==> Adding LLVM/MLIR toolchain to tool cache")
  const cachedPath = await tc.cacheDir(dir, "llvm-mlir-toolchain", tag)

  const llvmMlirRoot = path.join(cachedPath, asset.name.replace(/\.tar\.zst$/, ""))
  core.setOutput("llvm-mlir-root", llvmMlirRoot)

  core.debug("==> Adding LLVM/MLIR toolchain to PATH")
  core.addPath(path.join(llvmMlirRoot, "bin"))
  core.debug("==> Exporting LLVM_DIR")
  core.exportVariable("LLVM_DIR", path.join(llvmMlirRoot, "lib", "cmake", "llvm"))
  core.debug("==> Exporting MLIR_DIR")
  core.exportVariable("MLIR_DIR", path.join(llvmMlirRoot, "lib", "cmake", "mlir"))
}

try {
  core.debug("==> Starting LLVM/MLIR toolchain setup")
  run()
  core.debug("==> Finished LLVM/MLIR toolchain setup")
} catch (error) {
  if (typeof error === "string") {
    core.setFailed(error)
  } else if (error instanceof Error) {
    core.setFailed(error.message)
  }
}
