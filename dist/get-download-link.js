"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = getDownloadLink;
const node_process_1 = __importDefault(require("node:process"));
const core_1 = require("@octokit/core");
/**
 * Determine the URL of the release asset for the given platform and architecture.
 * @param {string} token - GitHub token
 * @param {string} tag - toolchain tag
 * @param {string} platform - platform to look for (either host, linux, macOS, or windows)
 * @param {string} architecture - architecture to look for (either host, X86, or AArch64)
 * @returns {{url: string, name: string}} - Download URL for the release asset and the asset name
 */
async function getDownloadLink(token, tag, platform = "host", architecture = "host") {
    const assets = await getAssets(token, tag);
    if (platform === "host") {
        platform = determinePlatform();
    }
    if (architecture === "host") {
        architecture = determineArchitecture();
    }
    // Determine the file name of the asset
    const asset = findAsset(assets, platform, architecture);
    if (asset) {
        return { url: asset.browser_download_url, name: asset.name };
    }
    else {
        throw new Error(`No ${architecture} ${platform} archive found for tag ${tag}.`);
    }
}
/**
 * Determine the platform of the current host.
 * @returns {string} - platform of the current host (either linux, macOS, or windows)
 */
function determinePlatform() {
    if (node_process_1.default.platform === "linux") {
        return "linux";
    }
    else if (node_process_1.default.platform === "darwin") {
        return "macOS";
    }
    else if (node_process_1.default.platform === "win32") {
        return "windows";
    }
    else {
        throw new Error(`Unsupported platform: ${node_process_1.default.platform}`);
    }
}
/**
 * Determine the architecture of the current host.
 * @returns {string} - architecture of the current host (either x64 or arm64)
 */
function determineArchitecture() {
    if (node_process_1.default.arch === "x64") {
        return "X86";
    }
    else if (node_process_1.default.arch === "arm64") {
        return "AArch64";
    }
    else {
        throw new Error(`Unsupported architecture: ${node_process_1.default.arch}`);
    }
}
/**
 * Get the release assets for the given tag from GitHub.
 * @param {string} token - GitHub token
 * @param tag - toolchain tag
 * @returns {Promise<ReleaseAsset[]>} - list of release assets
 */
async function getAssets(token, tag) {
    const options = {};
    if (token) {
        options.auth = token;
    }
    const octokit = new core_1.Octokit(options);
    const response = await octokit.request("GET /repos/{owner}/{repo}/releases/tags/{tag}", {
        owner: "burgholzer",
        repo: "portable-mlir-toolchain",
        tag: tag
    });
    return response.data.assets;
}
/**s
 * Find the release asset for the given platform and architecture.
 * @param {ReleaseAsset[]} assets - list of release assets
 * @param {string} platform - platform to look for (either linux, macOS, or windows)
 * @param {string} architecture - architecture to look for (either X86 or AArch64)
 * @returns {(ReleaseAsset | undefined)} - release asset or undefined if not found
 */
function findAsset(assets, platform, architecture) {
    if (platform === "linux") {
        return assets.find(asset => RegExp(`.*_linux_.*_${architecture}.tar.zst$`, 'i').exec(asset.name));
    }
    if (platform === "macOS") {
        return assets.find(asset => RegExp(`.*_macos_.*_${architecture}.tar.zst$`, 'i').exec(asset.name));
    }
    if (platform === "windows") {
        return assets.find(asset => RegExp(`.*_windows_.*_${architecture}.tar.zst$`, 'i').exec(asset.name));
    }
    throw new Error(`Invalid platform: ${platform}`);
}
//# sourceMappingURL=get-download-link.js.map