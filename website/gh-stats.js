// Live GitHub numbers for the hero: stars, total installer downloads and the latest version.
// Cached for an hour per visitor (GitHub allows 60 unauthenticated calls an hour); hidden if GitHub can't be reached.
const REPO = "Sergey-Bar/Penny";
const KEY = "penny-gh-stats";
const box = document.querySelector("[data-gh-stats]");

async function load() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (cached && Date.now() - cached.at < 3_600_000) return cached;
  } catch {}
  const get = (path) => fetch(`https://api.github.com/repos/${REPO}${path}`, { headers: { Accept: "application/vnd.github+json" } }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
  const [repo, releases] = await Promise.all([get(""), get("/releases?per_page=100")]);
  const stats = {
    at: Date.now(),
    stars: repo.stargazers_count,
    downloads: releases.reduce((s, r) => s + r.assets.filter((a) => !/sha256sums/i.test(a.name)).reduce((t, a) => t + a.download_count, 0), 0),
    version: releases.find((r) => !r.draft && !r.prerelease)?.tag_name ?? null,
  };
  try { sessionStorage.setItem(KEY, JSON.stringify(stats)); } catch {}
  return stats;
}

if (box) {
  load()
    .then((s) => {
      const fmt = new Intl.NumberFormat(document.documentElement.lang, { notation: s.downloads >= 10_000 ? "compact" : "standard" });
      for (const el of box.querySelectorAll("[data-gh]")) {
        const v = s[el.dataset.gh];
        if (v == null) el.closest("li")?.remove();
        else el.textContent = typeof v === "number" ? fmt.format(v) : v;
      }
      box.hidden = false;
    })
    .catch(() => {}); // no numbers beats wrong numbers
}
