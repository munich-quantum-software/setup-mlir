<!-- Entries in each category are sorted by merge time, with the latest PRs appearing first. -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on a mixture of [Keep a Changelog] and [Common Changelog].

## [Unreleased]

## [2025.12.06]

### Distribution

- LLVM tag: `llvmorg-21.1.7`

### Changed

- 🔧🍎 Disable LTO on macOS arm64 builds ([#29]) ([**@burgholzer**])

## [2025.12.05]

### Distribution

- LLVM tag: `llvmorg-21.1.7`

### Changed

- ✨ Restructure installation scripts and GitHub Action to accept LLVM version instead of `setup-mlir` tag ([#25]) ([**@denialhaag**])
- 📌 Pin `manylinux` images used for Linux builds ([#23]) ([**@denialhaag**])

## [2025.11.25]

_This is the initial release of the `setup-mlir` project._

### Distribution

- LLVM tag: `llvmorg-21.1.6`

### Added

- ✨ Add build and installation scripts as well as GitHub Action ([#1], [#3], [#6], [#14]) ([**@burgholzer**], [**@denialhaag**])

<!-- Version links -->

[unreleased]: https://github.com/munich-quantum-software/setup-mlir/compare/2025.12.06...HEAD
[2025.12.06]: https://github.com/munich-quantum-software/setup-mlir/releases/tag/2025.12.06
[2025.12.05]: https://github.com/munich-quantum-software/setup-mlir/releases/tag/2025.12.05
[2025.11.25]: https://github.com/munich-quantum-software/setup-mlir/releases/tag/2025.11.25

<!-- PR links -->

[#29]: https://github.com/munich-quantum-software/setup-mlir/pull/29
[#25]: https://github.com/munich-quantum-software/setup-mlir/pull/25
[#23]: https://github.com/munich-quantum-software/setup-mlir/pull/23
[#14]: https://github.com/munich-quantum-software/setup-mlir/pull/14
[#6]: https://github.com/munich-quantum-software/setup-mlir/pull/6
[#3]: https://github.com/munich-quantum-software/setup-mlir/pull/3
[#1]: https://github.com/munich-quantum-software/setup-mlir/pull/1

<!-- Contributor -->

[**@burgholzer**]: https://github.com/burgholzer
[**@denialhaag**]: https://github.com/denialhaag

<!-- General links -->

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[Common Changelog]: https://common-changelog.org
