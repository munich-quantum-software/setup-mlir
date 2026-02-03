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

/**
 * Verify and normalize a platform string
 * @param platform The platform string to verify
 * @returns The normalized platform string
 */
export function getPlatform(platform: string): string {
  if (
    platform !== "host" &&
    platform !== "linux" &&
    platform !== "macOS" &&
    platform !== "windows"
  ) {
    throw new Error(
      `Invalid platform: ${platform}. Expected linux, macOS, or windows.`,
    );
  }

  if (platform === "host") {
    platform = determinePlatform();
  }

  return platform;
}

/**
 * Verify and normalize an architecture string
 * @param architecture The architecture string to verify
 * @returns The normalized architecture string
 */
export function getArchitecture(architecture: string): string {
  if (
    architecture !== "host" &&
    architecture !== "X86" &&
    architecture !== "AArch64"
  ) {
    throw new Error(
      `Invalid architecture: ${architecture}. Expected X86 or AArch64.`,
    );
  }

  if (architecture === "host") {
    architecture = determineArchitecture();
  }

  return architecture;
}

/**
 * Determine the platform of the current host.
 * @returns {string} - platform of the current host (either linux, macOS, or windows)
 */
function determinePlatform(): string {
  if (process.platform === "linux") {
    return "linux";
  } else if (process.platform === "darwin") {
    return "macOS";
  } else if (process.platform === "win32") {
    return "windows";
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

/**
 * Determine the architecture of the current host.
 * @returns {string} - architecture of the current host (either X86 or AArch64)
 */
function determineArchitecture(): string {
  if (process.arch === "x64") {
    return "X86";
  } else if (process.arch === "arm64") {
    return "AArch64";
  } else {
    throw new Error(`Unsupported architecture: ${process.arch}`);
  }
}
