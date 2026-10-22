#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PLUGINS_DIR = path.join(ROOT, "plugins");
const REGISTRY = path.join(ROOT, "registry.json");
const VERIFY_FILES = process.argv.includes("--verify-files");
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";

const SPDX = new Set([
  "0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC0-1.0",
  "ISC", "MIT", "MPL-2.0", "Unlicense",
  "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later",
  "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0-only", "LGPL-3.0-or-later",
  "AGPL-3.0-only", "AGPL-3.0-or-later",
]);
const SYSTEMS = new Set(["mac", "win", "linux"]);
const ARCH = new Set(["arm64", "x64", "x86", "arm64ec", "universal"]);
const TYPES = new Set(["filter", "generator", "transition", "general"]);
const INSTALL = new Set(["archive", "external"]);
const SLUG = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const SEMVER = /^\d+\.\d+\.\d+([-+].*)?$/;
const SHA256 = /^[a-f0-9]{64}$/;

const errors = [];
const warnings = [];

function fail(file, message) {
  errors.push(`${path.relative(ROOT, file)}: ${message}`);
}

function warn(file, message) {
  warnings.push(`${path.relative(ROOT, file)}: ${message}`);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function isGpl(license) {
  return /^(A?GPL)-/.test(license);
}

function validatePlugin(file, plugin) {
  const required = ["slug", "name", "version", "license", "source", "files"];
  for (const key of required) {
    if (plugin[key] == null || plugin[key] === "") fail(file, `missing required field "${key}"`);
  }
  if (typeof plugin.slug !== "string" || !SLUG.test(plugin.slug)) {
    fail(file, `invalid slug "${plugin.slug}" (expected vendor/plugin-name)`);
  }
  if (typeof plugin.version !== "string" || !SEMVER.test(plugin.version)) {
    fail(file, `invalid semver "${plugin.version}"`);
  }
  if (typeof plugin.license !== "string" || !SPDX.has(plugin.license)) {
    fail(file, `license "${plugin.license}" is not in the allowed SPDX list`);
  }
  for (const key of ["source", "homepage"]) {
    if (plugin[key] && !/^https:\/\//.test(plugin[key])) {
      fail(file, `${key} must be https://`);
    }
  }
  for (const key of ["plugin_types", "contexts"]) {
    if (plugin[key] && (!Array.isArray(plugin[key]) || plugin[key].some((v) => !TYPES.has(v)))) {
      fail(file, `${key} contains an unknown value`);
    }
  }
  if (!Array.isArray(plugin.files) || plugin.files.length === 0) {
    fail(file, "files must be a non-empty array");
    return;
  }
  const gpl = typeof plugin.license === "string" && isGpl(plugin.license);
  if (gpl && plugin.redistributable === true) {
    fail(file, "GPL/AGPL entries must set redistributable: false");
  }
  for (const [index, fileEntry] of plugin.files.entries()) {
    const where = `files[${index}]`;
    if (typeof fileEntry.url !== "string" || !/^https:\/\//.test(fileEntry.url)) {
      fail(file, `${where}.url must be https://`);
    }
    if (!INSTALL.has(fileEntry.install)) {
      fail(file, `${where}.install must be "archive" or "external"`);
    }
    if (!Array.isArray(fileEntry.systems) || fileEntry.systems.length === 0 ||
        fileEntry.systems.some((v) => !SYSTEMS.has(v))) {
      fail(file, `${where}.systems must contain mac/win/linux`);
    }
    if (fileEntry.arch && (!Array.isArray(fileEntry.arch) || fileEntry.arch.some((v) => !ARCH.has(v)))) {
      fail(file, `${where}.arch contains an unknown value`);
    }
    if (fileEntry.contains && (!Array.isArray(fileEntry.contains) || fileEntry.contains.some((v) => v !== "ofx"))) {
      fail(file, `${where}.contains may only contain "ofx"`);
    }
    if (gpl && fileEntry.install !== "external") {
      fail(file, `${where}: GPL/AGPL entries must use install: "external"`);
    }
    if (fileEntry.install === "archive") {
      if (plugin.redistributable !== true) {
        fail(file, `${where}: archive entries require redistributable: true`);
      }
      if (typeof fileEntry.sha256 !== "string" || !SHA256.test(fileEntry.sha256)) {
        fail(file, `${where}: archive entries require a 64-hex sha256`);
      }
      if (!Number.isInteger(fileEntry.size) || fileEntry.size <= 0) {
        fail(file, `${where}: archive entries require a positive size`);
      }
    }
  }
}

function semverParts(version) {
  const [main, pre = ""] = version.split("+")[0].split("-");
  return { nums: main.split(".").map(Number), pre };
}

function compareSemver(a, b) {
  const pa = semverParts(a);
  const pb = semverParts(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre.localeCompare(pb.pre);
}

function download(url, dest) {
  if (PROXY) {
    execFileSync("curl", ["--proxy", PROXY, "-fsSL", url, "-o", dest], { stdio: "inherit" });
  } else {
    execFileSync("curl", ["-fsSL", url, "-o", dest], { stdio: "inherit" });
  }
}

function archiveHasOfx(file) {
  try {
    if (file.endsWith(".zip")) {
      const out = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" });
      return out.split("\n").some((line) => line.includes(".ofx"));
    }
    if (/\.(tar\.gz|tgz)$/.test(file)) {
      const out = execFileSync("tar", ["-tzf", file], { encoding: "utf8" });
      return out.split("\n").some((line) => line.includes(".ofx"));
    }
    return file.endsWith(".ofx");
  } catch (error) {
    warnings.push(`${path.basename(file)}: could not inspect archive (${error.message})`);
    return true;
  }
}

function verifyArchive(file, plugin, entry) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ofx-registry-"));
  const dest = path.join(tmp, "download");
  try {
    console.log(`  fetching ${plugin.slug} ${entry.url}`);
    download(entry.url, dest);
    const bytes = fs.statSync(dest).size;
    if (bytes !== entry.size) {
      fail(file, `size mismatch: expected ${entry.size}, got ${bytes}`);
    }
    const hash = createHash("sha256").update(fs.readFileSync(dest)).digest("hex");
    if (hash !== entry.sha256) {
      fail(file, `sha256 mismatch: expected ${entry.sha256}, got ${hash}`);
    }
    if (!archiveHasOfx(dest)) {
      fail(file, "archive does not contain a .ofx file");
    }
  } catch (error) {
    fail(file, `download failed: ${error.message}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const files = walk(PLUGINS_DIR);
if (files.length === 0) {
  errors.push("plugins/: no plugin entries found");
}

const bySlug = new Map();
for (const file of files) {
  let plugin;
  try {
    plugin = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(file, `invalid JSON: ${error.message}`);
    continue;
  }
  validatePlugin(file, plugin);
  if (typeof plugin.slug === "string" && typeof plugin.version === "string") {
    const key = `${plugin.slug}@${plugin.version}`;
    if (bySlug.has(key)) fail(file, `duplicate entry ${key}`);
    const list = bySlug.get(plugin.slug) || [];
    list.push({ file, plugin });
    bySlug.set(plugin.slug, list);
  }
  if (VERIFY_FILES && Array.isArray(plugin.files)) {
    for (const entry of plugin.files) {
      if (entry.install === "archive") verifyArchive(file, plugin, entry);
    }
  }
}

const latest = [];
for (const [slug, list] of bySlug) {
  list.sort((a, b) => compareSemver(a.plugin.version, b.plugin.version));
  const winner = list[list.length - 1];
  if (list.length > 1) {
    warn(winner.file, `${slug}: ${list.length} versions found; registry uses ${winner.plugin.version}`);
  }
  latest.push(winner.plugin);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const line of errors) console.error(`  ✗ ${line}`);
  if (warnings.length > 0) {
    console.error(`\n${warnings.length} warning(s):`);
    for (const line of warnings) console.error(`  ! ${line}`);
  }
  process.exit(1);
}

latest.sort((a, b) => a.name.localeCompare(b.name));
const registry = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  plugins: latest,
};
fs.writeFileSync(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`);

console.log(`✓ ${latest.length} plugin(s) validated`);
for (const line of warnings) console.log(`  ! ${line}`);
console.log(`✓ wrote ${path.relative(ROOT, REGISTRY)}`);
