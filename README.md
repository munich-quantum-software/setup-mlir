# setup-mlir

This repository provides an action for setting up MLIR in GitHub Actions and installation scripts for setting up MLIR locally.

The MLIR binaries are built and distributed in the [`portable-mlir-toolchain`](https://github.com/munich-quantum-software/portable-mlir-toolchain/) repository.

## GitHub Actions

```yaml
- name: Setup MLIR
  uses: munich-quantum-software/setup-mlir@v1.1.0
  with:
    llvm-version: 21.1.8
```

This extracts a pre-built MLIR installation, adds the binaries to `$PATH`, and defines `$LLVM_DIR` and `$MLIR_DIR`.

### Debug Builds (Windows Only)

On Windows, you can optionally install debug builds:

```yaml
- name: Setup MLIR (Debug)
  uses: munich-quantum-software/setup-mlir@v1.1.0
  with:
    llvm-version: 21.1.8
    debug: true
```

## Installation Scripts

If you want to use the pre-built MLIR installations locally, we also provide installation scripts.
The scripts require the LLVM version (e.g., `21.1.8`) and the desired installation directory to be passed.
The scripts automatically download and use a platform-specific `zstd` binary for decompression, so only `tar` needs to be installed on the host system.

On Linux and macOS, use the following Bash command:

```bash
curl -LsSf https://github.com/munich-quantum-software/setup-mlir/releases/latest/download/setup-mlir.sh | bash -s -- -v 21.1.8 -p /path/to/installation
```

On Windows, use the following PowerShell command:

```powershell
powershell -ExecutionPolicy ByPass -c "& ([scriptblock]::Create((irm https://github.com/munich-quantum-software/setup-mlir/releases/latest/download/setup-mlir.ps1))) -llvm_version 21.1.8 -install_prefix /path/to/installation"
```

### Debug Builds (Windows Only)

On Windows, you can optionally install debug builds by adding the `-debug` flag:

```powershell
powershell -ExecutionPolicy ByPass -c "& ([scriptblock]::Create((irm https://github.com/munich-quantum-software/setup-mlir/releases/latest/download/setup-mlir.ps1))) -llvm_version 21.1.8 -install_prefix /path/to/installation -debug"
```
