# Security policy

Please do not report security vulnerabilities in a public issue. Use GitHub's **Report a vulnerability** action on the repository's Security tab to send a private advisory to the maintainers. Do not include PoB codes, account credentials, session cookies, or private stash data in a report.

Until a trusted signing service is configured, Windows executables are unsigned. Check release notes and published SHA-256 hashes before running a downloaded build.

See [dependency patches](docs/dependency-patches.md) for the build-time `http-cache-semantics` security override and its regression check.

Supported version: the latest published release.
