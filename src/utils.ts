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

import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";

/**
 * Find an executable file recursively in a directory
 * @param dir - Directory to search in
 * @param executableName - Name of the executable to find
 * @returns Path to the executable or undefined if not found
 */
export function findExecutable(
  dir: string,
  executableName: string,
): string | undefined {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findExecutable(fullPath, executableName);
      if (found) return found;
    } else if (entry.isFile() && entry.name === executableName) {
      return fullPath;
    }
  }
  return undefined;
}

/**
 * Get the platform-specific architecture string for asset names
 * @param platform - Platform (linux, macOS, windows)
 * @param architecture - Architecture (X86, AArch64)
 * @returns Platform-specific architecture string
 */
export function getArchString(platform: string, architecture: string): string {
  if (platform === "linux") {
    return architecture === "X86" ? "x86_64" : "aarch64";
  }
  if (platform === "macOS") {
    return architecture === "X86" ? "x86_64" : "arm64";
  }
  if (platform === "windows") {
    return architecture === "X86" ? "X64" : "Arm64";
  }
  throw new Error(`Invalid platform: ${platform}`);
}

/**
 * Get the zstd executable name for the current platform
 * @returns zstd executable name
 */
export function getZstdExecutableName(): string {
  return process.platform === "win32" ? "zstd.exe" : "zstd";
}
