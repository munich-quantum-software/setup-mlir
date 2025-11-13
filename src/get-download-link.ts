// Copyright (c) 2025 Lukas Burgholzer
// All rights reserved.
//
// SPDX-License-Identifier: MIT
//
// Licensed under the MIT License

import process from "node:process"
import { Octokit, OctokitOptions } from "@octokit/core"
import type { components } from "@octokit/openapi-types"

type ReleaseAsset = components["schemas"]["release-asset"]

/**
 * Determine the URL of the release asset for the given platform and architecture.
 * @param {string} token - GitHub token
 * @param {string} tag - toolchain tag
 * @param {string} platform - platform to look for (either host, linux, macOS, or windows)
 * @param {string} architecture - architecture to look for (either host, X86, or AArch64)
 * @returns {{url: string, name: string}} - Download URL for the release asset and the asset name
 */
export default async function getDownloadLink(
  token: string,
  tag: string,
  platform = "host",
  architecture = "host"
): Promise<{ url: string; name: string }> {
  const assets = await getAssets(token, tag)

  if (platform === "host") {
    platform = determinePlatform()
  }

  if (architecture === "host") {
    architecture = determineArchitecture()
  }

  // Determine the file name of the asset
  const asset = findAsset(assets, platform, architecture)

  if (asset) {
    return { url: asset.browser_download_url, name: asset.name  }
  } else {
    throw new Error(`No ${architecture} ${platform} archive found for tag ${tag}.`)
  }
}

/**
 * Determine the platform of the current host.
 * @returns {string} - platform of the current host (either linux, macOS, or windows)
 */
function determinePlatform(): string {
  if (process.platform === "linux") {
    return "linux"
  } else if (process.platform === "darwin") {
    return "macOS"
  } else if (process.platform === "win32") {
    return "windows"
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

/**
 * Determine the architecture of the current host.
 * @returns {string} - architecture of the current host (either x64 or arm64)
 */
function determineArchitecture(): string {
  if (process.arch === "x64") {
    return "X86"
  } else if (process.arch === "arm64") {
    return "AArch64"
  } else {
    throw new Error(`Unsupported architecture: ${process.arch}`)
  }
}

/**
 * Get the release assets for the given tag from GitHub.
 * @param {string} token - GitHub token
 * @param tag - toolchain tag
 * @returns {Promise<ReleaseAsset[]>} - list of release assets
 */
async function getAssets(token: string, tag: string): Promise<ReleaseAsset[]> {
  const options: OctokitOptions = {}
  if (token) {
    options.auth = token
  }
  const octokit = new Octokit(options)
    const response = await octokit.request("GET /repos/{owner}/{repo}/releases/tags/{tag}", {
        owner: "burgholzer",
        repo: "portable-mlir-toolchain",
        tag: tag
    })
    return response.data.assets
}

/**s
 * Find the release asset for the given platform and architecture.
 * @param {ReleaseAsset[]} assets - list of release assets
 * @param {string} platform - platform to look for (either linux, macOS, or windows)
 * @param {string} architecture - architecture to look for (either X86 or AArch64)
 * @returns {(ReleaseAsset | undefined)} - release asset or undefined if not found
 */
function findAsset(
  assets: ReleaseAsset[],
  platform: string,
  architecture: string
): ReleaseAsset | undefined {
  if (platform === "linux") {
    return assets.find(asset => RegExp(`.*_linux_.*_${architecture}.tar.zst$`, 'i').exec(asset.name))
  }

  if (platform === "macOS") {
    return assets.find(asset => RegExp(`.*_macos_.*_${architecture}.tar.zst$`, 'i').exec(asset.name))
  }

  if (platform === "windows") {
    return assets.find(asset => RegExp(`.*_windows_.*_${architecture}.tar.zst$`, 'i').exec(asset.name))
  }

  throw new Error(`Invalid platform: ${platform}`)
}
