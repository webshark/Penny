"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Last-resort boundary: the root layout itself failed, so nothing here may rely on the
 * app's providers - no i18n, no theme, not even globals.css. That is why this file
 * carries its own <html>, its own styles and both languages' copy.
 */
const COPY = {
  he: {
    title: "Penny לא הצליחה לעלות",
    hint: "האפליקציה עצמה לא נטענה. הנתונים שלכם שמורים בכונן. נסו לרענן, ואם זה חוזר — הפעילו את Penny מחדש.",
    retry: "ניסיון נוסף",
    reload: "רענון הדף",
  },
  en: {
    title: "Penny couldn't start",
    hint: "The app itself failed to load. Your data is still saved on disk. Try again, and if it keeps happening, restart Penny.",
    retry: "Try again",
    reload: "Reload",
  },
} as const;

const subscribeToNothing = () => () => {};
// navigator.language is client-only, so it is read as an external store: the server (and
// the hydration pass) get Hebrew, the app's default, and the client re-renders in its own.
const prefersEnglish = () => !!navigator.language && !/^he/i.test(navigator.language);
const serverSaysHebrew = () => false;

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[ui] root layout failed:", error);
  }, [error]);

  // The root layout no longer carries the app's lang attribute, so ask the browser instead.
  const en = useSyncExternalStore(subscribeToNothing, prefersEnglish, serverSaysHebrew);
  const lang = en ? "en" : "he";
  const t = COPY[lang];

  return (
    <html lang={lang} dir={lang === "he" ? "rtl" : "ltr"}>
      <head>
        <title>Penny</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,-apple-system,"Segoe UI",Rubik,sans-serif;background:#f4f3fb;color:#171326}
.card{width:100%;max-width:32rem;border:1px solid #dcd8ee;border-radius:20px;background:#fff;padding:32px}
h1{margin:0 0 12px;font-size:1.25rem}
p{margin:0;line-height:1.6;color:#4b4566}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}
button{font:inherit;border-radius:999px;padding:0 20px;min-height:44px;cursor:pointer;border:1px solid #dcd8ee;background:#fff;color:inherit}
button.primary{border-color:#6c5ce7;background:#6c5ce7;color:#fff}
@media (prefers-color-scheme:dark){body{background:#0b0a1a;color:#f2f0fa}.card{border-color:#2c2750;background:#171430}p{color:#b6b0d0}button{border-color:#2c2750;background:#171430;color:#f2f0fa}button.primary{border-color:#8b7cf7;background:#8b7cf7;color:#0b0a1a}}`,
          }}
        />
      </head>
      <body>
        <main className="card" role="alert">
          <h1>{t.title}</h1>
          <p>{t.hint}</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => retry()}>
              {t.retry}
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              {t.reload}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
