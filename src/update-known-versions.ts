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

import * as core from "@actions/core";
import type { components } from "@octokit/openapi-types";
import { createOctokit } from "./utils/create-oktokit.js";
import { REPO_OWNER, REPO_NAME } from "./utils/constants.js";
import { updateManifest } from "./utils/manifest.js";

type Release = components["schemas"]["release"];

/**
 * Main function to update the version manifest
 */
async function run(): Promise<void> {
  await updateManifest();

  const token = process.env.GITHUB_TOKEN || "";
  const octokit = createOctokit(token);
  const latestRelease = await octokit.request(
    "GET /repos/{owner}/{repo}/releases/latest",
    {
      owner: REPO_OWNER,
      repo: REPO_NAME,
    },
  );
  core.setOutput("latest-tag", latestRelease.data.tag_name);
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
