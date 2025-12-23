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

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('Version Validation', () => {
  it('should recognize valid version tags', () => {
    const versionRegex = /^\d+\.\d+\.\d+$/;
    expect(versionRegex.test('21.1.8')).toBe(true);
    expect(versionRegex.test('1.0.0')).toBe(true);
    expect(versionRegex.test('100.200.300')).toBe(true);
  });

  it('should recognize invalid version tags', () => {
    const versionRegex = /^\d+\.\d+\.\d+$/;
    expect(versionRegex.test('21.1')).toBe(false);
    expect(versionRegex.test('21.1.8.9')).toBe(false);
    expect(versionRegex.test('v21.1.8')).toBe(false);
    expect(versionRegex.test('invalid-version-123')).toBe(false);
  });

  it('should recognize valid commit hashes', () => {
    const commitRegex = /^[0-9a-f]{7,40}$/i;
    expect(commitRegex.test('f8cb798')).toBe(true);
    expect(commitRegex.test('a832a52')).toBe(true);
    expect(commitRegex.test('abcdef1234567890')).toBe(true);
    expect(commitRegex.test('ABCDEF1234567890')).toBe(true);
  });

  it('should recognize invalid commit hashes', () => {
    const commitRegex = /^[0-9a-f]{7,40}$/i;
    expect(commitRegex.test('f8cb79')).toBe(false); // too short
    expect(commitRegex.test('f8cb798g')).toBe(false); // invalid character
    expect(commitRegex.test('12345678901234567890123456789012345678901')).toBe(false); // too long
  });
});

describe('Platform Detection', () => {
  it('should validate platform values', () => {
    const validPlatforms = ['host', 'linux', 'macOS', 'windows'];
    expect(validPlatforms).toContain('linux');
    expect(validPlatforms).toContain('macOS');
    expect(validPlatforms).toContain('windows');
    expect(validPlatforms).toContain('host');
  });
});

describe('Architecture Detection', () => {
  it('should validate architecture values', () => {
    const validArchitectures = ['host', 'X86', 'AArch64'];
    expect(validArchitectures).toContain('X86');
    expect(validArchitectures).toContain('AArch64');
    expect(validArchitectures).toContain('host');
  });
});

describe('Asset Name Pattern Matching', () => {
  it('should match asset names for version tags', () => {
    const version = '21.1.8';
    const pattern = `llvm-mlir_llvmorg-${version}_`;
    const assetName = 'llvm-mlir_llvmorg-21.1.8_linux_ubuntu-24.04_X86.tar.zst';
    expect(assetName).toContain(pattern);
  });

  it('should match asset names for commit hashes', () => {
    const commitHash = 'f8cb798';
    const assetName = 'llvm-mlir_f8cb798_macos_macos-14_AArch64.tar.zst';
    const hashMatch = assetName.match(/llvm-mlir_([0-9a-f]{7,40})_/i);
    expect(hashMatch).not.toBeNull();
    expect(hashMatch![1]).toBe(commitHash);
  });

  it('should match platform-specific asset patterns', () => {
    // Linux X86
    expect(/.*_linux_.*_X86\.tar\.zst$/i.test('llvm-mlir_llvmorg-21.1.8_linux_ubuntu-24.04_X86.tar.zst')).toBe(true);
    // Linux ARM
    expect(/.*_linux_.*_AArch64\.tar\.zst$/i.test('llvm-mlir_llvmorg-21.1.8_linux_ubuntu-24.04_AArch64.tar.zst')).toBe(true);
    // macOS X86
    expect(/.*_macos_.*_X86\.tar\.zst$/i.test('llvm-mlir_llvmorg-21.1.8_macos_macos-15_X86.tar.zst')).toBe(true);
    // macOS ARM
    expect(/.*_macos_.*_AArch64\.tar\.zst$/i.test('llvm-mlir_llvmorg-21.1.8_macos_macos-14_AArch64.tar.zst')).toBe(true);
    // Windows X86
    expect(/.*_windows_.*_X86\.tar\.zst$/i.test('llvm-mlir_llvmorg-21.1.8_windows_windows-2022_X86.tar.zst')).toBe(true);
    // Windows ARM
    expect(/.*_windows_.*_AArch64\.tar\.zst$/i.test('llvm-mlir_llvmorg-21.1.8_windows_windows-11_AArch64.tar.zst')).toBe(true);
  });
});
