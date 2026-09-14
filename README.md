![OS](https://img.shields.io/badge/os-linux%20%7C%20macos%20%7C%20windows-blue?style=flat-square)
[![License: Apache-2.0 WITH LLVM-exception](https://img.shields.io/badge/license-Apache--2.0%20WITH%20LLVM--exception-blue.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/munich-quantum-software/setup-mlir/test.yml?branch=main&style=flat-square&logo=github&label=ci)](https://github.com/munich-quantum-software/setup-mlir/actions/workflows/test.yml)
[![codecov](https://img.shields.io/codecov/c/github/munich-quantum-software/setup-mlir?style=flat-square&logo=codecov)](https://codecov.io/gh/munich-quantum-software/setup-mlir)

# setup-mlir

This repository provides an action for setting up MLIR in GitHub Actions and
installation scripts for setting up MLIR locally. Only Release builds are
supported. macOS requires Apple silicon (`arm64`).

The MLIR binaries are built and distributed in the
[`portable-mlir-toolchain`](https://github.com/munich-quantum-software/portable-mlir-toolchain/)
repository.

<!-- rumdl-disable -->

<!--- BEGIN: AUTO-GENERATED LIST. DO NOT EDIT. -->

List of available LLVM versions:

- `21.1.8`
- `22.1.0`
- `22.1.1`
- `22.1.2`
- `22.1.3`
- `22.1.4`
- `22.1.5`
- `22.1.6`
- `22.1.7`
- `22.1.8`
- `23.1.0`
- `23.1.1`

List of available LLVM commit hashes:

- `8f264586d7521b0e305ca7bb78825aa3382ffef7`
- `113f01aa82d055410f22a9d03b3468fa68600589`
- `f8cb7987c64dcffb72414a40560055cb717dbf74`

<!--- END: AUTO-GENERATED LIST. DO NOT EDIT. -->

<!-- rumdl-enable -->

For more information on the available LLVM versions and commit hashes, see
[`version-manifest.json`](./version-manifest.json).

## GitHub Actions

```yaml
- name: Set up MLIR
  uses: munich-quantum-software/setup-mlir@v1.4.2
  with:
    llvm-version: 22.1.8
```

This extracts a pre-built MLIR installation, adds the binaries to `$PATH`, and
defines `$LLVM_DIR` and `$MLIR_DIR`.

## Installation Scripts

If you want to use the pre-built MLIR installations locally, we also provide
installation scripts. The scripts require the LLVM version or commit hash (e.g.,
`22.1.0` or `f8cb798`) and the desired installation directory to be passed. The
scripts automatically download and use a platform-specific `zstd` binary for
decompression, so only `tar` needs to be installed on the host system.

> [!NOTE]
>
> `tar` is included by default in Windows 10 and Windows 11. If you're using an
> older version, you can install it, for example, via
> [Chocolatey](https://chocolatey.org/): `choco install tar`.

On Linux and macOS, use the following Bash command:

```bash
curl -LsSf https://github.com/munich-quantum-software/setup-mlir/releases/latest/download/setup-mlir.sh | bash -s -- -v 22.1.0 -p /path/to/installation
```

On Windows, use the following PowerShell command:

```powershell
powershell -ExecutionPolicy ByPass -c "& ([scriptblock]::Create((irm https://github.com/munich-quantum-software/setup-mlir/releases/latest/download/setup-mlir.ps1))) -llvm_version 22.1.0 -install_prefix /path/to/installation"
```

## Assertion-free release SDKs

Set `assertions: false` to select the native assertion-free SDK:

```yaml
- uses: munich-quantum-software/setup-mlir@v1
  with:
    llvm-version: 23.1.1
    assertions: false
```

The standalone installers accept `-a OFF` in Bash and `-no_assertions` in
PowerShell. Defaults retain assertions. The `_noassert.tar.zst` companion
archive must exist in the same release; installation fails if it is unavailable.
Tool-cache directories separate the two variants. Use headers and libraries from
the same variant because LLVM's assertion mode affects its ABI checks.

These SDKs contain native object code with portable CPU targets. They do not
require the producer's exact compiler version. Consumers must still satisfy
LLVM's compiler requirements and the SDK's deployment and C++ ABI constraints.
The version manifest retains one default archive per platform so older pinned
actions continue to work.
