// The clickable demo. Screens are real screenshots of the demo household (scripts/capture-demo-tour.mjs);
// the app's own links on each screen are buttons that open the screen they lead to.
const COPY = {
  he: {
    url: "127.0.0.1 · Penny", of: "מתוך", prev: "הקודם", next: "הבא", goto: "מעבר אל", alt: "מסך {t} ב-Penny, עם נתוני דוגמה",
    steps: {
      home: ["לוח הבקרה", "כל הבית במבט אחד: יתרה צפויה, כסף על השולחן, תזרים, מבנה ההוצאות ומי הוציא מה.", ["כל אריח אפשר להסתיר או להחזיר", "תצוגה לפי בן משפחה", "צעדים ראשונים שמסמנים את עצמם"]],
      savings: ["כסף על השולחן", "כל הבדיקות במספר אחד לשנה, וליד כל סעיף הצעד שמביא את הכסף. מה שסימנתם כבוצע נספר כחיסכון.", ["דמי ניהול גבוהים בפנסיה ובקרן השתלמות", "ביטוחים חופפים, עמלות וריבית על מינוס", "כסף שיושב בעו\"ש"]],
      budget: ["תקציב", "תקציב לפי קטגוריה עם קצב מול הזמן שעבר, ומבט מעטפות: כמה מההכנסה כבר קיבל תפקיד.", ["טבלה או כרטיסים", "חודש שמתחיל ביום המשכורת", "העברות בין קטגוריות"]],
      transactions: ["תנועות", "כל התנועות מכל הבנקים והכרטיסים, מסודרות לפי שבועות.", ["תגיות, פיצול ובעלים", "חיובים קרובים מעל הרשימה", "מישהו חייב לכם חלק? מסמנים מתוך התנועה"]],
      accounts: ["חשבונות", "כל חשבון, כרטיס, השקעה והלוואה ברשימה אחת עם סכומים לפי קבוצה, ודף לכל חשבון.", ["יתרות מהבנק אוטומטית", "בדיקה שהיתרה מסתדרת עם התנועות"]],
      loans: ["הלוואות ודירוג אשראי", "כמה נשאר, כמה זה עולה בחודש ומתי זה נגמר, ודירוג האשראי שלכם לאורך זמן.", ["תזכורת לדוח החינמי פעם בשנה"]],
      investments: ["השקעות", "כרטיס לכל אחזקה עם שווי, רווח ועלות, וכל הקניות והמכירות.", ["רווח מחיר מול רווח שער", "קרן השתלמות שיודעת מתי היא נזילה"]],
      groups: ["קבוצות ואירועים", "טיול, חתונה או שיפוץ: כל התנועות של אירוע, וכמה הוא באמת עלה. וגם מי חייב לכם כסף.", ["החזיר/ה הכל בלחיצה, עם ביטול"]],
      overview: ["סקירה", "לאן הכסף הלך: תזרים, תרשים זרימה, קטגוריות לאורך זמן ומה הזיז את השווי הנקי."],
      fi: ["עצמאות כלכלית", "כמה צריך כדי שהעבודה תהיה בחירה, ומתי תגיעו לשם, בכמה גרסאות."],
      insurance: ["ביטוחים", "כל הפוליסות, התשלומים שלהן מהדף, חידושים וכפילויות."],
    },
    end: "זה דמו עם נתוני דוגמה. באפליקציה הכול שלכם, על המחשב שלכם.", download: "הורדה בחינם",
  },
  en: {
    url: "127.0.0.1 · Penny", of: "of", prev: "Previous", next: "Next", goto: "Go to", alt: "Penny's {t} screen, with sample data",
    steps: {
      home: ["Dashboard", "The whole household at a glance: expected balance, money on the table, cash flow, spending and who spent what.", ["Show or hide any tile", "View by household member", "A quick start that ticks itself"]],
      savings: ["Money on the table", "Every check in one yearly figure, each with the step that gets the money. Done items count as saved.", ["Pension and study-fund fees above the market", "Overlapping insurance, fees and overdraft interest", "Cash sitting idle"]],
      budget: ["Budget", "A budget per category with pace against the month, and an envelope view: how much of your income already has a job.", ["Table or cards", "A month that starts on payday", "Moves between categories"]],
      transactions: ["Transactions", "Every transaction from every bank and card, grouped by week.", ["Tags, splits and owners", "Upcoming charges above the list", "Someone owes you part? Mark it on the transaction"]],
      accounts: ["Accounts", "Every account, card, holding and loan in one list with group totals, and a page for each.", ["Bank balances arrive by themselves", "A check that the balance matches the transactions"]],
      loans: ["Loans and credit score", "What's left, what it costs a month and when it ends, plus your credit score over time.", ["A yearly reminder for the free report"]],
      investments: ["Investments", "A card per holding with value, gain and cost, and every buy and sell.", ["Price gain versus exchange-rate gain", "A study fund that knows when it's liquid"]],
      groups: ["Groups and events", "A trip, a wedding or a renovation: every transaction of an event and what it really cost. And who owes you money.", ["Paid it all back in one tap, with undo"]],
      overview: ["Overview", "Where the money went: cash flow, a money-flow chart, categories over time and what moved your net worth."],
      fi: ["Financial independence", "How much you need for work to be a choice, and when you'll get there, in several versions."],
      insurance: ["Insurance", "Every policy, its payments from your statement, renewals and overlaps."],
    },
    end: "This is a demo with sample data. In the app it's all yours, on your computer.", download: "Download free",
  },
};

const root = document.getElementById("tour");
const lang = document.documentElement.lang === "he" ? "he" : "en";
const t = COPY[lang];
const base = root.dataset.base; // where the screenshots live, relative to this page
const ids = Object.keys(t.steps);
const spots = (window.PENNY_TOUR_HOTSPOTS ?? {})[lang] ?? {};
const $ = (s) => root.querySelector(s);
const img = $(".screen img"), stepsList = $(".tour-steps"), layer = $(".hotspots");

stepsList.innerHTML = ids.map((id, i) => `<li><button type="button" data-id="${id}"><span class="n">${i + 1}</span>${t.steps[id][0]}</button></li>`).join("");
// Preload the rest once the first screen is up, so moving around feels like the app.
addEventListener("load", () => ids.forEach((id) => { new Image().src = `${base}/${lang}/${id}.webp`; }));

function show(id, focus) {
  const i = ids.indexOf(id);
  if (i < 0) return show(ids[0], focus);
  const [title, body, bullets] = t.steps[id];
  img.src = `${base}/${lang}/${id}.webp`;
  img.alt = t.alt.replace("{t}", title);
  img.classList.remove("fade"); void img.offsetWidth; img.classList.add("fade");
  $(".tour-copy h2").textContent = title;
  $(".tour-copy p").textContent = body;
  $(".tour-copy ul").innerHTML = (bullets ?? []).map((b) => `<li>${b}</li>`).join("");
  $(".count").textContent = `${i + 1} ${t.of} ${ids.length}`;
  $("[data-go=prev]").disabled = i === 0;
  $("[data-go=next]").disabled = i === ids.length - 1;
  $(".tour-end").hidden = i !== ids.length - 1;
  for (const b of stepsList.querySelectorAll("button")) {
    if (b.dataset.id === id) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
  }
  // Keep the chosen chip in view on phones, without scrolling the page on first load.
  if (focus) stepsList.querySelector(`[data-id="${id}"]`).scrollIntoView({ block: "nearest", inline: "nearest" });
  // The real links on this screen that lead to another tour screen.
  layer.innerHTML = (spots[id] ?? []).filter((s) => s.to !== id).map((s) =>
    `<button type="button" class="hot" data-id="${s.to}" style="left:${s.x}%;top:${s.y}%;width:${s.w}%;height:${s.h}%" aria-label="${t.goto} ${t.steps[s.to][0]}"></button>`).join("");
  if (location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
  if (focus) $(".tour-copy h2").focus({ preventScroll: true });
}

root.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.id) show(b.dataset.id, true);
  const cur = ids.indexOf(location.hash.slice(1));
  if (b.dataset.go === "next") show(ids[Math.min(ids.length - 1, cur + 1)], true);
  if (b.dataset.go === "prev") show(ids[Math.max(0, cur - 1)], true);
});
// Arrow keys move through the tour (in reading direction), unless typing somewhere.
addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea") || e.altKey || e.ctrlKey || e.metaKey) return;
  const forward = lang === "he" ? "ArrowLeft" : "ArrowRight", back = lang === "he" ? "ArrowRight" : "ArrowLeft";
  if (e.key !== forward && e.key !== back) return;
  const cur = ids.indexOf(location.hash.slice(1));
  show(ids[Math.max(0, Math.min(ids.length - 1, cur + (e.key === forward ? 1 : -1)))]);
});
$(".hint-toggle input").addEventListener("change", (e) => $(".screen").classList.toggle("hints", e.target.checked));
addEventListener("hashchange", () => show(location.hash.slice(1)));
show(location.hash.slice(1) || ids[0]);
