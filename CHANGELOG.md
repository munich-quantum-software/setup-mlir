<!-- Entries in each category are sorted by merge time, with the latest PRs appearing first. -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on a mixture of [Keep a Changelog] and [Common Changelog].
This project adheres to [Semantic Versioning], with the exception that minor releases may include breaking changes.

## [Unreleased]

## [1.0.0] - 2025-12-23

_This is the initial release of the `setup-mlir` project._

### Added

- 🔧 Enable (short- and long-form) commit hash values as an alternative to version tags ([#30]) ([**@flowerthrower**])
- ✨ Add build and installation scripts as well as Action ([#1], [#3], [#6], [#14]) ([**@burgholzer**], [**@denialhaag**])

### Changed

- 🔧🍎 Disable LTO on macOS arm64 builds ([#29]) ([**@burgholzer**])
- ✨ Restructure installation scripts and Action to accept LLVM version instead of `setup-mlir` tag ([#25]) ([**@denialhaag**])
- 📌 Pin `manylinux` images used for Linux builds ([#23]) ([**@denialhaag**])

### Fixed

- 🚑 Fix commit-hash handling in Action ([#32]) ([**@flowerthrower**])
- 👷 Fix workflow that checks Action distribution ([#32]) ([**@denialhaag**])

<!-- Version links -->

[unreleased]: https://github.com/munich-quantum-software/setup-mlir/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/munich-quantum-software/setup-mlir/releases/tag/v1.0.0

<!-- PR links -->

[#32]: https://github.com/munich-quantum-software/setup-mlir/pull/32
[#30]: https://github.com/munich-quantum-software/setup-mlir/pull/30
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
[**@flowerthrower**]: https://github.com/flowerthrower

<!-- General links -->

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[Common Changelog]: https://common-changelog.org
[Semantic Versioning]: https://semver.org/spec/v2.0.0.html
