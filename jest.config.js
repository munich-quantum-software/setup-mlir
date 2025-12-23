// Copyright (c) 2025 Munich Quantum Software Company GmbH
// Copyright (c) 2025 Chair for Design Automation, TUM
// All rights reserved.
//
// Licensed under the Apache License v2.0 with LLVM Exceptions (the "License"); you
// may not use this file except in compliance with the License. You may obtain a
// copy of the License at https://llvm.org/LICENSE.txt
//
// Unless required by applicable law or agreed to in writing, software distributed
// under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
// CONDITIONS OF ANY KIND, either express or implied. See the License for the
// specific language governing permissions and limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception

export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "json"],
};
