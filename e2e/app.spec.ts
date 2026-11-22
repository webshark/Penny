import { expect, test } from "@playwright/test";

// The empty test install would otherwise start at first-run onboarding.
test.beforeAll(async ({ playwright }) => {
  const base = "http://127.0.0.1:3100"; // playwright.config.ts PORT; the API wants a same-origin header
  const api = await playwright.request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  await api.put("/api/setup/onboarding", { data: { step: "complete" } });
  await api.dispose();
});

test.describe("core screens", () => {
  test("no page scrolls sideways", async ({ page }) => {
    for (const path of ["/", "/learn", "/learn/electric-car", "/calculators", "/car", "/discounted-home", "/calculators/mortgage", "/calculators/debt", "/optimizations", "/groups", "/loans", "/control", "/tips", "/budget", "/accounts", "/insurance"]) {
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("navigation", () => {
  test("the sidebar reaches the calculators hub through Analytics", async ({ page, isMobile }) => {
    test.skip(isMobile, "the phone layout uses the bottom dock");
    await page.goto("/");
    // Analytics is one link in the side menu; its pages have their own menu card.
    await page.getByRole("link", { name: "ניתוח" }).first().click();
    await expect(page).toHaveURL(/\/overview$/);
    await page.getByRole("navigation", { name: "ניתוח" }).getByRole("link", { name: /^מחשבונים/ }).click();
    await expect(page).toHaveURL(/\/calculators$/);
    await expect(page.getByRole("link", { name: /משכנתא/ })).toBeVisible();
  });
});

test.describe("calculators", () => {
  test("car: switching car B to petrol makes both cars cost the same", async ({ page }) => {
    await page.goto("/car");
    await expect(page.getByText(/זול יותר ב/)).toBeVisible();
    const carB = page.getByRole("region", { name: "רכב ב׳" });
    await carB.getByRole("radio", { name: "בנזין" }).click();
    await carB.getByLabel("מחיר, ₪").fill("140000");
    await expect(page.getByText("שני הרכבים עולים בערך אותו דבר.")).toBeVisible();
  });

  test("mortgage: warns when everything is on prime", async ({ page }) => {
    await page.goto("/calculators/mortgage");
    await expect(page.getByText(/החזר חודשי ראשון/)).toBeVisible();
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "הסרה" }).last().click();
    await expect(page.getByLabel("חלק, %")).toHaveCount(1);
    await page.getByLabel("חלק, %").fill("100");
    await expect(page.getByText(/לפחות 33% מהמשכנתא/)).toBeVisible();
  });

  test("debt: a budget below the minimums asks for more", async ({ page }) => {
    await page.goto("/calculators/debt");
    await page.getByLabel(/כמה אפשר לשלם בחודש/).fill("500");
    await expect(page.getByText(/צריך להעלות את התקציב החודשי/)).toBeVisible();
  });

  test("discounted home shows a verdict", async ({ page }) => {
    await page.goto("/discounted-home");
    await expect(page.getByText(/משאירה אתכם במצב טוב יותר|בערך לאותו מקום/)).toBeVisible();
  });
});

test.describe("knowledge center", () => {
  test("search narrows the guides and a guide leads to its calculator", async ({ page }) => {
    await page.goto("/learn");
    await page.getByRole("searchbox", { name: "חיפוש מדריכים" }).fill("משכנתא");
    await expect(page.getByRole("link", { name: /תמהיל משכנתא/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /לצאת מהמינוס/ })).toHaveCount(0);
    await page.getByRole("link", { name: /תמהיל משכנתא/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "תמהיל משכנתא בלי כאב ראש" })).toBeVisible();
    await page.getByRole("link", { name: "מחשבון משכנתא" }).click();
    await expect(page).toHaveURL(/\/calculators\/mortgage$/);
  });
});

test.describe("money features", () => {
  // Shared data: one project is enough, and these run before the profiles test adds a second profile.
  test.skip(({ isMobile }) => isMobile, "shared data; desktop runs it");

  test("money on the table explains an empty result instead of a blank card", async ({ page }) => {
    await page.goto("/optimizations");
    const card = page.getByRole("region", { name: "כסף על השולחן" });
    await expect(card).toBeVisible();
    await expect(card.getByText("לא מצאנו כרגע כסף שאפשר לחסוך")).toBeVisible();
  });

  test("credit score: add, delete, undo", async ({ page }) => {
    await page.goto("/loans");
    const card = page.getByRole("region", { name: "דירוג אשראי" });
    await card.getByRole("button", { name: "הוספת דירוג" }).click();
    await card.getByLabel("ציון").fill("742");
    await card.getByRole("button", { name: "שמירה" }).click();
    await expect(card.getByText("742").first()).toBeVisible();
    await card.getByRole("button", { name: /מחיקת הדירוג/ }).click();
    await expect(card.getByText("742")).toHaveCount(0);
    await page.getByRole("button", { name: "ביטול" }).click();
    await expect(card.getByText("742").first()).toBeVisible();
  });

  test("who owes me: a split shows per person, paid back can be undone", async ({ page, request, baseURL }) => {
    const headers = { origin: baseURL! };
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const tx = await (await request.post("/api/transactions/manual", { headers, data: { kind: "expense", amount: 300, date: day, description: "ארוחה משותפת" } })).json();
    expect((await request.post(`/api/transactions/${tx.id}/shares`, { headers, data: { person: "דנה", amount: 400 } })).status()).toBe(400); // more than the expense
    expect((await request.post(`/api/transactions/${tx.id}/shares`, { headers, data: { person: "דנה", amount: 150 } })).ok()).toBe(true);

    await page.goto("/groups");
    const card = page.getByRole("region", { name: "מי חייב לי" });
    await expect(card.getByText("דנה")).toBeVisible();
    await card.getByRole("button", { name: "דנה החזיר/ה הכל" }).click();
    await expect(card.getByText("דנה")).toHaveCount(0);
    await page.getByRole("button", { name: "ביטול" }).click();
    await expect(card.getByText("דנה")).toBeVisible();
  });

  test("a split added from the transaction sheet saves with Enter, without submitting the sheet", async ({ page, request, baseURL }) => {
    const headers = { origin: baseURL! };
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    await request.post("/api/transactions/manual", { headers, data: { kind: "expense", amount: 200, date: day, description: "פיצה QA", tags: ["חופשה"] } });
    await page.goto("/transactions?search=QA");
    await page.getByRole("button", { name: "עריכת פיצה QA" }).click();
    const sheet = page.getByRole("dialog");
    const more = sheet.locator("details").first();
    if (!(await more.evaluate((d) => (d as HTMLDetailsElement).open))) await more.locator("summary").click();
    await sheet.getByRole("button", { name: "מישהו חייב לי חלק" }).click();
    await sheet.getByPlaceholder("למשל: דנה").fill("רון");
    await sheet.getByPlaceholder("למשל: דנה").press("Enter");
    await expect(sheet.getByText("רון חייב/ת")).toBeVisible();
    await expect(sheet).toBeVisible();
  });

  test("Groups with data fit a phone", async ({ browser, baseURL }) => {
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: "he-IL", baseURL });
    const page = await phone.newPage();
    await page.goto("/groups");
    await page.getByRole("heading", { level: 1 }).waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
    await phone.close();
  });

  test("English pages show English titles", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
    await page.goto("/control");
    await expect(page.getByRole("heading", { level: 1, name: "Money Center" })).toBeVisible();
    await page.goto("/tips");
    await expect(page.getByRole("heading", { level: 1, name: "Money tips" })).toBeVisible();
  });
});

test.describe("profiles", () => {
  test("with two profiles, a new session starts at who's using, and picking one goes home", async ({ page, browser, isMobile }) => {
    test.skip(isMobile, "profiles are shared data; one project is enough");
    await page.goto("/profiles");
    await page.getByRole("button", { name: "הוספת פרופיל" }).click();
    await page.getByLabel("שם").fill("נועה");
    await page.getByRole("button", { name: /שמירה/ }).click();
    await expect(page.getByRole("button", { name: "נועה" })).toBeVisible();

    const fresh = await browser.newPage();
    await fresh.goto("/");
    await expect(fresh).toHaveURL(/\/profiles$/);
    await fresh.getByRole("button", { name: "נועה" }).click();
    await expect(fresh).toHaveURL(/\/$/);
    await fresh.close();
  });
});

test.describe("PWA", () => {
  test("serves an installable manifest and the offline page", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.name).toBe("Penny");
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    expect((await request.get("/offline.html")).ok()).toBe(true);
    expect((await request.get("/sw.js")).headers()["cache-control"]).toContain("no-cache");
  });
});
