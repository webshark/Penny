import "server-only";

export interface UpdateInfo {
  /** Version this build runs, e.g. "0.2.0". */
  current: string;
  /** Newest published release, e.g. "0.3.0". */
  latest: string;
  /** The release page (notes and the installer download). */
  url: string;
}

// GitHub owners are letters, digits and hyphens; repo names may also use dots and underscores.
const OWNER = /^[A-Za-z0-9-]+$/;
const NAME = /^[A-Za-z0-9._-]+$/;

/** "v1.2.10" -> [1, 2, 10]; null for anything that is not a plain release version (pre-releases are skipped). */
export function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? m.slice(1).map(Number) : null;
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * Compares the running version with the newest GitHub release of the repo.
 * Only reads public release metadata; nothing about the user is sent. Returns null when up to date or unknown.
 */
export async function checkForUpdate(opts: { repo: string; current: string; fetchFn?: typeof fetch }): Promise<UpdateInfo | null> {
  const [owner, name, ...rest] = opts.repo.split("/");
  if (rest.length || !owner || !name || !OWNER.test(owner) || !NAME.test(name) || !parseVersion(opts.current)) return null;
  try {
    const res = await (opts.fetchFn ?? fetch)(`https://api.github.com/repos/${owner}/${name}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const tag = ((await res.json()) as { tag_name?: string }).tag_name ?? "";
    if (!isNewer(tag, opts.current)) return null;
    const latest = tag.replace(/^v/, "");
    return { current: opts.current, latest, url: `https://github.com/${owner}/${name}/releases/tag/${encodeURIComponent(tag)}` };
  } catch {
    return null;
  }
}

/** Sends one message per new version; a later check that finds the same version stays quiet. */
export function createUpdateNotifier(send: (text: string) => Promise<void>, howTo: string) {
  let notified: string | null = null;
  return async (info: UpdateInfo) => {
    if (info.latest === notified) return;
    notified = info.latest;
    await send(`A new version of Penny is available (${info.current} -> ${info.latest}).\nWhat's new: ${info.url}\n${howTo}`);
  };
}

/** How this copy was installed, set by the desktop shell and the Docker image. */
export type InstallKind = "desktop" | "docker" | "source";
export const installKind = (v: string | undefined): InstallKind => (v === "desktop" || v === "docker" ? v : "source");

export const HOW_TO_UPDATE: Record<InstallKind, string> = {
  desktop: "On Windows, Penny downloads the update itself and asks to restart. On Mac, download the new .dmg from the release page and open it. Your data stays.",
  docker: "To update, run Penny-update.bat (Windows) or ./Penny-update.sh (Mac, Linux). It backs up your data first and keeps the current version if the new one fails its tests.",
  source: "To update, run git pull and restart Penny.",
};
