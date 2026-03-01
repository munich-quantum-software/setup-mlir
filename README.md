# setup-mlir

This repository provides an action for setting up MLIR in GitHub Actions and installation scripts for setting up MLIR locally.

The MLIR binaries are built and distributed in the [`portable-mlir-toolchain`](https://github.com/munich-quantum-software/portable-mlir-toolchain/) repository.

<!--- BEGIN: AUTO-GENERATED LIST. DO NOT EDIT. -->

List of available LLVM versions:

- `21.1.8`
- `22.1.0`

List of available LLVM commit hashes:

- `113f01aa82d055410f22a9d03b3468fa68600589`
- `f8cb7987c64dcffb72414a40560055cb717dbf74`

<!--- END: AUTO-GENERATED LIST. DO NOT EDIT. -->

For more information on the available LLVM versions and commit hashes, see [`version-manifest.json`](./version-manifest.json).

## GitHub Actions

```yaml
- name: Set up MLIR
  uses: munich-quantum-software/setup-mlir@v1.2.1
  with:
    llvm-version: 22.1.0
```

This extracts a pre-built MLIR installation, adds the binaries to `$PATH`, and defines `$LLVM_DIR` and `$MLIR_DIR`.

## Installation Scripts

If you want to use the pre-built MLIR installations locally, we also provide installation scripts.
The scripts require the LLVM version or commit hash (e.g., `22.1.0` or `f8cb798`) and the desired installation directory to be passed.
The scripts automatically download and use a platform-specific `zstd` binary for decompression, so only `tar` needs to be installed on the host system.

> [!NOTE]
>
> `tar` is included by default in Windows 10 and Windows 11.
> If you're using an older version, you can install it, for example, via [Chocolatey](https://chocolatey.org/): `choco install tar`.

On Linux and macOS, use the following Bash command:

```bash
curl -LsSf https://github.com/munich-quantum-software/setup-mlir/releases/latest/download/setup-mlir.sh | bash -s -- -v 22.1.0 -p /path/to/installation
```

On Windows, use the following PowerShell command:

```powershell
powershell -ExecutionPolicy ByPass -c "& ([scriptblock]::Create((irm https://github.com/munich-quantum-software/setup-mlir/releases/latest/download/setup-mlir.ps1))) -llvm_version 22.1.0 -install_prefix /path/to/installation"
```
