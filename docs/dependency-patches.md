# Dependency patches

## `http-cache-semantics` max-stale handling

GitHub tracks [GHSA-ch52-4w7c-c8xp / CVE-2026-93748](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) for `http-cache-semantics` versions through 4.2.0. The upstream [security report](https://github.com/kornelski/http-cache-semantics/issues/56) describes the same `max-stale` bypass for shared `Set-Cookie` and `proxy-revalidate` responses and is closed without a planned fix. NPM's audit feed reports 4.3.0 as outside the affected range, but the maintainer's [4.3.0 publishing commit](https://github.com/kornelski/http-cache-semantics/commit/b1d4bd682fbab0252985de45219f4e7497c0067c) changes only package metadata; the relevant `max-stale` reuse logic remains unchanged there. The project therefore keeps a narrow local patch instead of trusting the version bump alone.

`pnpm-workspace.yaml` overrides the transitive build dependency to 4.3.0 and applies [`patches/http-cache-semantics@4.3.0.patch`](../patches/http-cache-semantics@4.3.0.patch). The patch requires revalidation for response `no-cache`, `Vary: *`, shared `proxy-revalidate`, and shared `Set-Cookie` responses without explicit `public` or `immutable` permission. It leaves ordinary stale responses eligible for `max-stale`.

This package is a development dependency used by the Electron packaging toolchain; it is not included in the app's runtime bundle. The regression script run by `pnpm test` exercises the restricted cases and confirms ordinary stale reuse still works. Keep the patch until an upstream code change fixes these cases and both `pnpm audit` and the GitHub advisory data confirm the dependency is clear.
