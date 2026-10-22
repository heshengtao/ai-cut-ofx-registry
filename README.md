# AI Cut OFX Registry

A static, community-maintained registry of free and open-source OpenFX (OFX)
plugins for [AI Cut](https://github.com/heshengtao/ai-cut).

- Registry index: [`registry.json`](./registry.json)
- Schema: [`schema/registry.schema.json`](./schema/registry.schema.json)
- License: metadata is **CC0-1.0**; each plugin keeps its own license.

## What this repository distributes

Only metadata: names, descriptions, SPDX licenses, source/homepage URLs,
platform and architecture tags, and (for redistributable plugins) archive URLs
with SHA-256 hashes and sizes.

It does **not** contain plugin binaries. The AI Cut client downloads an archive
directly from the URL declared by the plugin author.

## Loading order in AI Cut

1. Fresh local cache (6 hour TTL)
2. Configured registry mirrors
3. `https://raw.githubusercontent.com/heshengtao/ai-cut-ofx-registry/main/registry.json`
4. `https://heshengtao.github.io/ai-cut-ofx-registry/registry.json`
5. Stale local cache
6. Registry snapshot bundled with the app

## Contributing a plugin

1. Pick a slug: `vendor/plugin-name` (lowercase, kebab-case).
2. Add `plugins/<vendor>/<plugin-name>/<version>.json`.
3. Declare the SPDX license, source URL, supported systems and architectures.
4. Use `"install": "archive"` only if you are the author or are allowed to
   redistribute the binary, and include the archive URL, SHA-256, and size.
5. Otherwise use `"install": "external"` and point `url` at the official
   download page. GPL/AGPL plugins **must** use `external`.
6. Run `node scripts/validate.mjs` and open a PR.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full rules.

## License policy

- Accepted: OSI-approved open-source licenses only (BSD, MIT, Apache, ISC,
  MPL, LGPL, GPL, AGPL, CC0, Unlicense).
- Paid, closed-source, and closed-source freeware plugins are not accepted.
- GPL/AGPL entries are metadata-only links. Do not commit or mirror their
  binaries in this repository.
- Plugin names and logos may be trademarks of their owners. This registry
  claims no ownership over them.
