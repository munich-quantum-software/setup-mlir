# Portable MLIR Toolchain

This repository aims to streamline the setup of the MLIR toolchain.

## GitHub Action

We provide a GitHub Action.

```yaml
- name: Setup MLIR
  uses: munich-quantum-software/setup-mlir@2025.12.12
  with:
    llvm-version: 21.1.7
```

This extracts a pre-built MLIR installation, adds the binaries to `$PATH`, and defines `$LLVM_DIR` and `$MLIR_DIR`.
The pre-built MLIR installation can be found in the release assets on GitHub.
We are using calendar versioning for our releases.
Refer to the release notes of the respective release for information on the LLVM version and the build settings.

## Installation Scripts

If you want to use the pre-built MLIR installations locally, we also provide installation scripts.
The scripts require the LLVM version (e.g., `21.1.7`) and the desired installation directory to be passed.

On Linux and macOS, use the following to run the installation script:

```bash
curl -LsSf https://github.com/munich-quantum-software/setup-mlir/releases/latest/download/setup-mlir.sh | bash -s -- -v 21.1.7 -p /path/to/installation
```

On Windows, use this PowerShell command:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://github.com/munich-quantum-software/setup-mlir/releases/latest/download/setup-mlir.ps1 | iex; setup-mlir.ps1 -llvm_version 21.1.7 -install_prefix /path/to/installation"
```

## Build Scripts

If desired, you can also use our build scripts directly.
Refer to

- [`scripts/toolchain/linux/build.sh`](./scripts/toolchain/linux/build.sh) for Linux,
- [`scripts/toolchain/macos/build.sh`](./scripts/toolchain/macos/build.sh) for macOS, and
- [`scripts/toolchain/windows/build.ps1`](./scripts/toolchain/windows/build.ps1) for Windows.

The usage is detailed in the scripts.
Note that the Linux script requires Docker to be installed on the host system.
