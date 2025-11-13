"use strict";
// Copyright (c) 2025 Lukas Burgholzer
// All rights reserved.
//
// SPDX-License-Identifier: MIT
//
// Licensed under the MIT License
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const tc = __importStar(require("@actions/tool-cache"));
const get_download_link_js_1 = __importDefault(require("./get-download-link.js"));
const node_path_1 = __importDefault(require("node:path"));
/**
 * Setup LLVM/MLIR toolchain
 * @returns {Promise<void>}
 */
async function run() {
    const tag = core.getInput("tag", { required: true });
    const platform = core.getInput("platform", { required: true });
    const architecture = core.getInput("architecture", { required: true });
    const token = core.getInput("token", { required: true });
    core.debug("==> Determining asset URL");
    const asset = await (0, get_download_link_js_1.default)(token, tag, platform, architecture);
    core.debug(`==> Downloading asset: ${asset.url}`);
    const file = await tc.downloadTool(asset.url);
    core.debug("==> Extracting asset");
    const dir = await tc.extractTar(node_path_1.default.resolve(file), undefined, ["--zstd"]);
    core.debug("==> Adding LLVM/MLIR toolchain to tool cache");
    const cachedPath = await tc.cacheDir(dir, "llvm-mlir-toolchain", tag);
    const llvmMlirRoot = node_path_1.default.join(cachedPath, asset.name.replace(/\.tar\.zst$/, ""));
    core.setOutput("llvm-mlir-root", llvmMlirRoot);
    core.debug("==> Adding LLVM/MLIR toolchain to PATH");
    core.addPath(node_path_1.default.join(llvmMlirRoot, "bin"));
    core.debug("==> Exporting LLVM_DIR");
    core.exportVariable("LLVM_DIR", node_path_1.default.join(llvmMlirRoot, "lib", "cmake", "llvm"));
    core.debug("==> Exporting MLIR_DIR");
    core.exportVariable("MLIR_DIR", node_path_1.default.join(llvmMlirRoot, "lib", "cmake", "mlir"));
}
try {
    core.debug("==> Starting LLVM/MLIR toolchain setup");
    run();
    core.debug("==> Finished LLVM/MLIR toolchain setup");
}
catch (error) {
    if (typeof error === "string") {
        core.setFailed(error);
    }
    else if (error instanceof Error) {
        core.setFailed(error.message);
    }
}
//# sourceMappingURL=index.js.map