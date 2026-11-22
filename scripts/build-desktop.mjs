// Builds the Penny desktop installer: a standalone Next.js server inside an Electron shell.
// Usage: npm run desktop:build  (output in dist-desktop/)
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });

console.log("1/4 Building the app (standalone)…");
fs.rmSync(standalone, { recursive: true, force: true });
run("npx next build", { PENNY_STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1" });
if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error("No .next/standalone/server.js: is output: 'standalone' set?");

console.log("2/4 Copying static files and migrations…");
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
// Migrations are read from disk at runtime, which file tracing cannot see.
fs.cpSync(path.join(root, "src", "server", "db", "migrations"), path.join(standalone, "src", "server", "db", "migrations"), { recursive: true });

// Tracing can miss data files the server-external packages load at runtime (e.g. playwright-core/browsers.json),
// so copy those packages and their dependencies in full. Everything else keeps Next's trimmed copy.
const nm = path.join(standalone, "node_modules");
const EXTERNALS = ["better-sqlite3", "israeli-bank-scrapers", "@sergienko4/israeli-bank-scrapers", "israeli-pension-scrapers"];
const closure = new Set();
const visit = (pkg) => {
  if (closure.has(pkg)) return;
  const manifest = path.join(root, "node_modules", pkg, "package.json");
  if (!fs.existsSync(manifest)) return;
  closure.add(pkg);
  const { dependencies = {}, optionalDependencies = {} } = JSON.parse(fs.readFileSync(manifest, "utf8"));
  for (const dep of Object.keys({ ...dependencies, ...optionalDependencies })) visit(dep);
};
EXTERNALS.forEach(visit);
for (const pkg of closure) fs.cpSync(path.join(root, "node_modules", pkg), path.join(nm, pkg), { recursive: true, dereference: true });
// Never needed at runtime (the shell already is Electron).
for (const junk of ["electron", "electron-builder", "@electron", "typescript", "@types"]) fs.rmSync(path.join(nm, junk), { recursive: true, force: true });
for (const junk of ["deps", "src", "build"]) fs.rmSync(path.join(nm, "better-sqlite3", junk), { recursive: true, force: true });

// On Windows Next links .next/node_modules/<pkg>-<hash> to absolute build paths; turn them into real copies so the app is relocatable.
const links = path.join(standalone, ".next", "node_modules");
const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isSymbolicLink() ? [p] : e.isDirectory() && e.name.startsWith("@") ? walk(p) : [];
}) : [];
for (const link of walk(links)) {
  const target = fs.realpathSync(link);
  fs.rmSync(link, { recursive: true, force: true });
  fs.cpSync(target, link, { recursive: true, dereference: true });
}

console.log("3/4 Checking the package holds no user data…");
// Tracing follows reads relative to the project folder and can copy the whole repo into the build: user data, docs,
// tests, the website, an earlier installer. Keep only what the server runs on; this is the build copy, never the user's folder.
const KEEP = new Set(["server.js", "package.json", "node_modules", ".next", "public", "src"]);
for (const entry of fs.readdirSync(standalone)) {
  if (!KEEP.has(entry)) fs.rmSync(path.join(standalone, entry), { recursive: true, force: true });
}
// better-sqlite3 ships an N-API prebuild that loads in Electron as is, so nothing is rebuilt.
for (const bad of ["data", "reports", "research_notes", ".claude"]) {
  if (fs.existsSync(path.join(standalone, bad))) throw new Error(`Refusing to package: .next/standalone/${bad} exists (may hold personal data).`);
}

console.log("4/4 Packaging the installer…");
// --publish never: the release workflow uploads the installers itself; a tag alone would make electron-builder try to.
run("npx electron-builder --config desktop/electron-builder.yml --publish never");
console.log("Done: see dist-desktop/");
