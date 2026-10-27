# Setup MLIR Agent Guide

Read the relevant parts of [README.md](README.md) and the affected action,
installer, or workflow before editing. This repository installs SDKs published
by
[portable-mlir-toolchain](https://github.com/munich-quantum-software/portable-mlir-toolchain).

## Repository layout

- `action.yml` defines the public action inputs; `src/` implements the Node.js
  action, download selection, and known-version updater.
- `installation/` contains the Bash and PowerShell installers.
- `version-manifest.json` maps LLVM versions and targets to published assets.
  The updater generates it and the marked version list in `README.md`.
- `dist/` contains the checked-in action and updater bundles, including the
  bundled manifest. `__tests__/` contains Jest tests; `.github/workflows/` runs
  integration tests, checks the bundles, updates known versions, and drafts
  releases.

## Working principles

- Inspect the working tree first and preserve existing changes. Keep the diff
  focused on the assigned task.
- Trace changes through published SDK assets, the manifest, action inputs,
  installers, tool-cache paths, documentation, and downstream consumers. Keep
  Bash, PowerShell, and the action consistent where they share a contract.
- Match dotted LLVM versions exactly and accept commit hashes by unambiguous
  prefix. Preserve platform and architecture checks, including Apple Silicon
  only on macOS and Release builds on every platform.
- Keep assertion-enabled and assertion-free assets distinct. Select the
  manifest's explicit URL for the requested variant, fail clearly if it is
  unavailable, and keep action tool caches separate. Preserve optional
  assertion-free fields for older manifest consumers.
- The action reads its bundled manifest and falls back to `main` for absent
  versions. Installers use the adjacent manifest in a checkout or source archive
  and otherwise read `main`. Preserve these lookup paths and report remote
  failures without silently choosing another SDK.
- Keep failures visible through downloads, decompression, extraction, and cache
  creation. Do not cache or report a successful install until the payload is
  usable. Keep credentials and downloaded archives out of commits.
- Document current behavior and non-obvious reasons in short, direct prose.

## Validation

- Use Node.js 24 and `npm ci`. Run `npm test` while changing TypeScript, then
  `npm run test:coverage` for the final code change. Run `uvx prek run -a`
  before a PR and rerun checks after any formatter changes.
- After changing `src/` or `version-manifest.json`, run `npm run build` and
  commit the regenerated `dist/` files. Never edit the bundles by hand. Check
  that a subsequent build leaves `dist/` unchanged.
- For installer or SDK-selection changes, use the hosted matrix to check Linux,
  macOS, and Windows on supported architectures, with both assertion modes.
  Verify the installed CMake files and `mlir-opt`, not only the download result.
  A documentation-only change does not need SDK downloads locally.
- Inspect the final diff and working-tree status. Report local checks, skipped
  checks, infrastructure failures, and hosted CI separately. Check the final PR
  head before calling it green.

## SDK updates and action releases

- Distinguish an upstream LLVM version, a dated portable-toolchain release, and
  this action's `vX.Y.Z` tag. A new SDK can become available through the
  manifest without a new action release.
- Before adding an SDK, verify the published portable-toolchain release and its
  asset URLs for every supported target and requested assertion mode. Use the
  `Update known versions` workflow and review its PR. Keep the generated
  manifest and marked README version list together; do not hand-edit that list
  or invent asset URLs. Update current examples and the installer test matrix
  when they should use the new SDK; preserve historical release notes.
- Prepare an action release in a dedicated PR based on current `main`. Review
  merged user-facing changes and the Release Drafter draft. Add a dated
  `CHANGELOG.md` section under `Unreleased`, with one entry per independent
  change, relevant PR links, and contributor credits. Update the comparison and
  release links. Align `package.json`, `package-lock.json`, and the README
  action ref with the intended action version.
- Run tests, pre-commit checks, and the bundle comparison on the final PR head.
  After merge, create and verify a signed annotated `vX.Y.Z` tag at the release
  commit before publishing. Confirm the draft notes and attached Bash and
  PowerShell installers, then verify the published release and its assets.

## Git and pull requests

- Follow the repository's gitmoji subject style. Sign commits and annotated
  tags, and verify signatures before pushing. Record AI help with `Assisted-by`,
  never an AI `Co-authored-by` trailer.
- Assign submitted PRs to `@burgholzer` and apply appropriate existing labels.
  Describe the change and its validation without claiming pending CI has passed.
