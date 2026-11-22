// Windows self-update for the desktop shell, with Node built-ins only (the shell ships no node_modules).
// A newer GitHub release's installer is downloaded, checked against the release's SHA256SUMS.txt, and run
// silently (/S) when the user agrees or the app quits. Mac needs a signed app to update itself, so it keeps the banner.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/** True when version a is newer than b ("1.10.0" > "1.9.3"); pre-release tags are never offered. */
function isNewer(a, b) {
  if (!/^\d+\.\d+\.\d+$/.test(a)) return false;
  const pa = a.split(".").map(Number);
  const pb = String(b).split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== (pb[i] || 0)) return pa[i] > (pb[i] || 0);
  return false;
}

/** The hex SHA-256 for `file` in a `sha256sum` listing ("<hash>  <name>" or "<hash> *<name>"), or null. */
function checksumFor(listing, file) {
  for (const line of String(listing).split(/\r?\n/)) {
    const m = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (m && m[2] === file) return m[1].toLowerCase();
  }
  return null;
}

/** Downloads the installer of a newer release into `dir`; resolves to its path, or null when there is nothing to install. */
async function downloadUpdate({ repo, current, dir, log = () => {} }) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "Penny-desktop" };
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const rel = await res.json();
  const version = String(rel.tag_name || "").replace(/^v/, "");
  if (rel.draft || rel.prerelease || !isNewer(version, current)) return null;
  const name = `Penny-Setup-${version}.exe`;
  const asset = (rel.assets || []).find((a) => a.name === name);
  const sums = (rel.assets || []).find((a) => a.name === "SHA256SUMS.txt");
  // No published checksum, no silent install: the banner still offers the manual download.
  if (!asset || !sums) return null;
  const expected = checksumFor(await (await fetch(sums.browser_download_url, { headers, signal: AbortSignal.timeout(15000) })).text(), name);
  if (!expected) return null;

  const file = path.join(dir, name);
  const bin = await fetch(asset.browser_download_url, { headers, signal: AbortSignal.timeout(10 * 60_000) });
  if (!bin.ok) return null;
  const buf = Buffer.from(await bin.arrayBuffer());
  const actual = crypto.createHash("sha256").update(buf).digest("hex");
  if (actual !== expected) {
    log(`[update] checksum mismatch for ${name}; not installing`);
    return null;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, buf);
  return { file, version };
}

module.exports = { isNewer, checksumFor, downloadUpdate };
