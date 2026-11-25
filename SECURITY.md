# Security Policy

## Supported Versions

Neuroverse is currently in active `0.x` development. Security fixes are applied to the `main` branch.

## Scope

Neuroverse is designed to run **locally** (`127.0.0.1` by default) and reads/writes semantic state JSON files under `~/.neuroverse/state/`. Please avoid binding the local server to public network interfaces (`0.0.0.0`) on untrusted networks.

## Reporting a Vulnerability

If you discover a security vulnerability (such as path traversal in node IDs, arbitrary file read/write, or XSS in the dashboard UI), please **do not** open a public issue with exploit details.

Instead, please report it privately via [GitHub Security Advisories](https://github.com/andrewzhang1996/Neuroverse/security/advisories/new). We will acknowledge receipt and work on a fix promptly.
