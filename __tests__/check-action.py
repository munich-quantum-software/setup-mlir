# Copyright (c) 2025 - 2026 Munich Quantum Software Company GmbH
# Copyright (c) 2025 - 2026 Chair for Design Automation, TUM
# All rights reserved.
#
# Licensed under the Apache License v2.0 with LLVM Exceptions (the "License"); you
# may not use this file except in compliance with the License. You may obtain a
# copy of the License at https://llvm.org/LICENSE.txt
#
# Unless required by applicable law or agreed to in writing, software distributed
# under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
# CONDITIONS OF ANY KIND, either express or implied. See the License for the
# specific language governing permissions and limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception

import os
import pathlib
import shutil
import subprocess

root = pathlib.Path(os.environ["LLVM_DIR"]).parents[2]
executable = "mlir-opt.exe" if os.name == "nt" else "mlir-opt"
assert pathlib.Path(os.environ["MLIR_DIR"]) == root / "lib/cmake/mlir"
assert pathlib.Path(shutil.which("mlir-opt") or "").resolve() == (
    root / "bin" / executable
).resolve()
installed = [(root, os.environ["ASSERTIONS"])]
if previous := os.environ.get("ASSERTIONS_ROOT"):
    assert root != pathlib.Path(previous)
    installed.append((pathlib.Path(previous), "ON"))
for directory, assertions in installed:
    config = (directory / "lib/cmake/llvm/LLVMConfig.cmake").read_text()
    assert f"set(LLVM_ENABLE_ASSERTIONS {assertions})" in config
    assert (directory / "lib/cmake/mlir/MLIRConfig.cmake").is_file()
    version = subprocess.check_output([directory / "bin" / executable, "--version"], text=True)
    assert "LLVM version 23.1.4" in version
with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
    print(f"root={root}", file=output)
