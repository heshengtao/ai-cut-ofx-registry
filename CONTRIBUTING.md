# Contributing

Thanks for adding an OFX plugin. Every entry is reviewed by CI and a human.

## Rules

1. **Metadata only.** Never commit a plugin binary, installer, source archive,
   logo, or screenshot you do not have the right to redistribute.
2. **Open source only.** The plugin must have an OSI-approved license and a
   public source URL. Paid and closed-source freeware entries are rejected.
3. **SPDX license.** Use a valid SPDX identifier. If a plugin is dual-licensed,
   pick the license under which you are submitting it and mention the other in
   the description.
4. **GPL/AGPL.** Set `"redistributable": false`. You may use
   `"install": "archive"` only when `url` points to the author's upstream
   release. Never host GPL/AGPL binaries in this repository or its releases.
5. **Archive entries.** `"install": "archive"` requires `url`, `sha256`, and
   `size`. The URL must be HTTPS and immutable (a versioned release asset,
   not a moving `latest` link). You must have the right to redistribute it.
6. **Platforms.** `systems` is one or more of `mac`, `win`, `linux`.
   `arch` is one or more of `arm64`, `x64`, `x86`, `arm64ec`, `universal`.
7. **Versions.** Use SemVer. One file per version:
   `plugins/<vendor>/<slug>/<version>.json`.
8. **Types and contexts.** Declare every context the bundle actually registers:
   `filter`, `general`, `generator`, `transition`, `paint`, `retimer`.
   `plugin_types` and `contexts` must include all of them, not just `filter`;
   a bundle that ships several plugins should list the union. Probe the bundle
   or read its `addSupportedContext` calls instead of guessing.
9. **DCO.** By submitting a PR you agree that your metadata contribution is
   licensed under CC0-1.0 and that you have the right to submit it.

## Validate locally

```bash
node scripts/validate.mjs
# verify archive URLs, SHA-256, and sizes:
node scripts/validate.mjs --verify-files
```

The script regenerates `registry.json`. Commit the result together with your
plugin file.

## Example

See `plugins/loilo/smooth-ofx/1.6.0.json` for an external entry, and the
schema for an archive entry with `sha256` and `size`.
