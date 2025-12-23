<!-- Entries in each category are sorted by merge time, with the latest PRs appearing first. -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on a mixture of [Keep a Changelog] and [Common Changelog].
This project adheres to [Semantic Versioning], with the exception that minor releases may include breaking changes.

## [Unreleased]

### Added

- 👷 Add GitHub Actions CI ([#51]) ([**@burgholzer**])

### Changed

- 🚸 Remove dependency on `jq` in UNIX installer ([#47]) ([**@burgholzer**])
- 🚸 Use tar-native zstd support in installers when available ([#49]) ([**@burgholzer**])
- 🚸 Create the installation directory if it does not exist ([#46]) ([**@denialhaag**])

### Fixed

- 🐛 Fix installation scripts to also accept commit SHAs ([#43]) ([**@denialhaag**])

## [1.0.0] - 2025-12-23

_This is the initial release of the `setup-mlir` project._

### Added

- ✨ Add action and installation scripts ([#1], [#3], [#6], [#14], [#23], [#25], [#29], [#30], [#32], [#41]) ([**@burgholzer**], [**@denialhaag**], [**@flowerthrower**])

<!-- Version links -->

[unreleased]: https://github.com/munich-quantum-software/setup-mlir/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/munich-quantum-software/setup-mlir/releases/tag/v1.0.0

<!-- PR links -->

[#51]: https://github.com/munich-quantum-software/setup-mlir/pull/51
[#49]: https://github.com/munich-quantum-software/setup-mlir/pull/49
[#47]: https://github.com/munich-quantum-software/setup-mlir/pull/47
[#46]: https://github.com/munich-quantum-software/setup-mlir/pull/46
[#43]: https://github.com/munich-quantum-software/setup-mlir/pull/43
[#41]: https://github.com/munich-quantum-software/setup-mlir/pull/41
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
