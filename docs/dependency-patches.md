# Dependency patches

## `http-cache-semantics` max-stale handling

GitHub tracks [GHSA-ch52-4w7c-c8xp / CVE-2026-93748](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) for `http-cache-semantics` versions through 4.2.0. The upstream [security report](https://github.com/kornelski/http-cache-semantics/issues/56) describes the same `max-stale` bypass for shared `Set-Cookie` and `proxy-revalidate` responses and is closed without a planned fix. NPM's audit feed reports 4.3.0 as outside the affected range, but the maintainer's [4.3.0 publishing commit](https://github.com/kornelski/http-cache-semantics/commit/b1d4bd682fbab0252985de45219f4e7497c0067c) changes only package metadata; the relevant `max-stale` reuse logic remains unchanged there. The project therefore keeps a narrow local patch instead of trusting the version bump alone.

`pnpm-workspace.yaml` overrides the transitive build dependency to 4.3.0 and applies [`patches/http-cache-semantics@4.3.0.patch`](../patches/http-cache-semantics@4.3.0.patch). The patch requires revalidation for response `no-cache`, `Vary: *`, shared `proxy-revalidate`, and shared `Set-Cookie` responses without explicit `public` or `immutable` permission. It leaves ordinary stale responses eligible for `max-stale`.

This package is a development dependency used by the Electron packaging toolchain; it is not included in the app's runtime bundle. The regression script run by `pnpm test` exercises the restricted cases and confirms ordinary stale reuse still works. Keep the patch until an upstream code change fixes these cases and both `pnpm audit` and the GitHub advisory data confirm the dependency is clear.

## `sprintf-js` bounded precision

The GitHub advisory for [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) covers `sprintf-js` through 1.1.3, which forwards unbounded precision values to JavaScript number-formatting methods. The dependency is pulled into the Electron packaging toolchain through `@electron/get`; it is development-only and is not bundled into the application runtime.

The project applies [`patches/sprintf-js@1.1.3.patch`](../patches/sprintf-js@1.1.3.patch), based on the proposed upstream [fix PR #238](https://github.com/alexei/sprintf.js/pull/238). It parses precision once, rejects values outside 0–100 before number formatting, and handles `%.0g` as one significant digit. The proposal is not a released upstream fix, so keep this local patch until a fixed upstream package is available. `scripts/check-sprintf-js-security.cjs`, run by `pnpm test`, verifies rejection occurs in the parser and the valid boundary formats work.

`pnpm audit` may continue to report the registry version as affected because the advisory has no published patched version; the local patch does not change the locked upstream version. Confirm the applied patch and regression check in addition to the audit report, and remove the patch only after the upstream package and advisory data are clear.
