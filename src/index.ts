/*
 * Copyright (c) 2025 - 2026 Munich Quantum Software Company GmbH
 * Copyright (c) 2025 - 2026 Chair for Design Automation, TUM
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
import path from "node:path";
import process from "node:process";
import { getDownloadUrl } from "./utils/download.js";
import { installSdk } from "./utils/install.js";

/** Install the selected SDK into the Actions tool cache and export its paths. */
async function run(): Promise<void> {
  const version = core.getInput("llvm-version", { required: true });
  const assertions = core.getBooleanInput("assertions");
  const url = await getDownloadUrl(
    version,
    core.getInput("platform", { required: true }),
    core.getInput("architecture", { required: true }),
    assertions,
  );
  if (!process.env.RUNNER_TOOL_CACHE) {
    throw new Error("RUNNER_TOOL_CACHE is not set.");
  }
  const cachedPath = await installSdk(
    url,
    path.join(
      process.env.RUNNER_TOOL_CACHE,
      assertions ? "mlir-toolchain" : "mlir-toolchain-noassert",
    ),
  );
  core.addPath(path.join(cachedPath, "bin"));
  core.exportVariable(
    "LLVM_DIR",
    path.join(cachedPath, "lib", "cmake", "llvm"),
  );
  core.exportVariable(
    "MLIR_DIR",
    path.join(cachedPath, "lib", "cmake", "mlir"),
  );
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
