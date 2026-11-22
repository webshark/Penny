"use client";

import { Fragment, useId, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Plus, AlertCircle, MoreVertical, SlidersHorizontal, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MonthNav, MonthStrip, monthKey, shiftMonth } from "@/components/ui/month-nav";
import { translateCategoryName } from "@/lib/i18n-data";
import { toast } from "sonner";
import {
  getAssets, getBudgets, getCashAhead, getCategories, getHome, getOverview, getTransactions,
  updateBudget, updateCategoryBudgetMode,
} from "@/lib/api";
import { usePlan } from "@/hooks/use-plan";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shekels } from "@/lib/money";
import { wealthGroups, type WealthGroup } from "@/lib/wealth-growth";
import { buildCashflow, cashflowMonth, type Week } from "@/lib/simple-cashflow";

/**
 * Simple mode: one scrolling page, one card per cash-flow line, newest month first.
 * Order: month bar, end-of-month forecast, variable spending by week, each tracked category,
 * savings deposits, fixed costs, total, income (with savings growth), off-cash-flow.
 */
/** `cardOnly`: just this month's forecast card , for Advanced mode's Home. */
export function SimpleHome({ name, cardOnly, extra, heroAside }: { name?: string | null; cardOnly?: boolean; /** Shown under the bank balance (Advanced mode puts its next step here). */ extra?: React.ReactNode; /** Beside the forecast figure, at the end side (visual left in Hebrew); shrinks on phones. */ heroAside?: React.ReactNode }) {
  const formatCurrency = useMoney();
  const t = useTranslations("home.simple");
  const locale = useLocale();
  const [offset, setOffset] = useState(0);
  // Desktop: which line the detail panel shows, and how the chart is ordered and narrowed.
  const [selected, setSelected] = useState("variable");
  const [chartSort, setChartSort] = useState<"amount" | "name">("amount");
  const [chartDesc, setChartDesc] = useState(true);
  const [chartFilter, setChartFilter] = useState<"all" | "over" | "active">("all");

  const queryClient = useQueryClient();
  const tCat = useTranslations("categoriesSeeded");
  const tManual = useTranslations("manualTxn");
  const catName = (n: string) => translateCategoryName(n, tCat);
  // One month start for the whole app: the plan's, which the overview API also uses.
  const { plan, loaded: planLoaded, failed: planFailed } = usePlan();
  const { from: first, to: last } = cashflowMonth(plan.monthStartDay, offset);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // Named after the month most of the range falls in.
  const monthName = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 14).toLocaleDateString(locale, { month: "long", year: "numeric" });
  // The month picker speaks "YYYY-MM"; this page counts months back from the current one.
  const month = monthKey(new Date(first.getFullYear(), first.getMonth(), first.getDate() + 14));
  const thisMonth = shiftMonth(month, offset);
  const goMonth = (m: string) => { const [y, mo] = m.split("-").map(Number), [cy, cm] = thisMonth.split("-").map(Number); setOffset(Math.max(0, (cy - y) * 12 + cm - mo)); };
  const monthNav = <MonthNav value={month} onChange={goMonth} max={thisMonth} />;

  const txns = useQuery({
    queryKey: ["simple-txns", iso(first), iso(last)],
    queryFn: () => getAllTransactions(iso(first), iso(last)),
    // Wait for the plan, so the range never jumps from the 1st to the start day mid-load.
    enabled: planLoaded || planFailed,
  });
  // The whole previous month is the baseline for "expected" (the API's own `previous` stops at today's day).
  const overview = useQuery({ queryKey: ["overview", "month", offset + 1], queryFn: () => getOverview("month", offset + 1) });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => getCategories() });
  const budgets = useQuery({ queryKey: ["budgets"], queryFn: getBudgets });
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets, enabled: offset === 0 });
  const cash = useQuery({ queryKey: ["cash-ahead"], queryFn: getCashAhead, enabled: offset === 0 });
  // Freshness from the per-bank health Home already loads: the newest sync, or a failure if any bank failed.
  const banks = useQuery({ queryKey: ["home"], queryFn: () => getHome() }).data?.bankHealth ?? [];
  const lastAt = banks.map((b) => b.lastSyncAt).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const run: Run = banks.some((b) => b.status === "error") ? { failed: true, at: lastAt } : lastAt ? { failed: false, at: lastAt } : null;
  const refresh = () => {
    for (const key of ["budgets", "categories", "home", "overview", "simple-txns", "cash-ahead"]) void queryClient.invalidateQueries({ queryKey: [key] });
  };
  const act = (p: Promise<unknown>) => p.then(refresh, (e: unknown) => { toast.error(t("saveFailed")); throw e; });
  const queries = [txns, overview, cats, budgets];
  const failed = queries.some((q) => q.isError);
  const retry = () => { for (const q of queries) if (q.isError) void q.refetch(); };

  const ready = txns.data && overview.data && cats.data && budgets.data;
  const cf = ready ? buildCashflow(txns.data!, cats.data!, budgets.data!, overview.data!, { from: first, to: last }) : null;
  // Anything that isn't a fixed bill or savings can be tracked (variable and unplanned alike); parents roll up their children.
  // Only top-level categories can be tracked: sub-category spending rolls into its parent, so the list stays short.
  const trackable = (cats.data ?? []).filter((c) => c.kind === "expense" && c.costType !== "fixed" && c.needType !== "saving" && c.parentId == null);
  const groups = assets.data ? wealthGroups(assets.data.assets) : null;
  const wealth = groups ? (Object.keys(groups) as WealthGroup[]).filter((g) => groups[g].value > 0) : [];

  return (
    <div className={cardOnly ? "" : "mx-auto w-full max-w-md md:max-w-2xl lg:max-w-6xl"}>
      {/* One quick-add line; the menu itself lives in the page's top corner, so nothing more sits above the card. */}
      {!cardOnly && (
        <div className="mb-1 flex items-center justify-end md:hidden">
          <Link href="/transactions?add=1" className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-footnote font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><Plus className="size-4" aria-hidden />{tManual("addTitle")}</Link>
        </div>
      )}
      {failed ? (
        <Card>
          <div role="alert" className="flex flex-col items-start gap-3 p-5 sm:p-6">
            <p className="text-headline font-semibold">{t("loadFailed")}</p>
            <button type="button" onClick={retry} className="min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">{t("tryAgain")}</button>
          </div>
        </Card>
      ) : !cf ? (
        <div className="wallet h-64 rounded-3xl px-5 pt-[22px] min-[600px]:rounded-[28px] min-[600px]:px-[30px] min-[600px]:pt-7"><div className="flex justify-end">{monthNav}</div><div role="status" className="mt-6 h-24 animate-pulse rounded-2xl bg-white/10"><span className="sr-only">{t("loading")}</span></div></div>
      ) : (() => {
        const growthTotal = wealth.reduce((sum, g) => sum + groups![g].growth, 0);
        const growthList = (
          <>
            <ul className="divide-y divide-border text-sm">
              {wealth.map((g) => (
                <li key={g} className="flex items-center justify-between py-2.5">
                  <span>{t(g)}<span className="block text-xs text-muted-foreground">{t("worth", { value: formatCurrency(groups![g].value) })}</span></span>
                  <span className="font-medium tabular-nums text-status-on-track">{groups![g].estimated ? <Signed n={groups![g].growth} /> : "—"}</span>
                </li>
              ))}
            </ul>
            <p className="pb-2 text-xs text-muted-foreground">{t("estimateNote")}</p>
          </>
        );

        // Categories are a heat map, not a list: the shape of the month at a glance, one tap for the detail.
        // Every picked category stays (₪0 included), so nothing vanishes silently.
        const tracked: LineView[] = cf.tracked.map((c) => ({
            key: `cat-${c.id}`, title: catName(c.name), tone: c.color, spent: c.spent, expected: c.expected,
            spentLabel: t("spent"), expectedLabel: t("expected"), showLeft: true,
            menu: (
              <CardMenu
                label={catName(c.name)}
                expected={c.expected}
                onSave={(v) => act(updateBudget(c.id, v))}
                onStop={() => void act(updateBudget(c.id, null).then(() => updateCategoryBudgetMode(c.id, "tracking"))).catch(() => {})}
              />
            ),
            sections: [
              { label: t("byWeek"), content: <WeeksList weeks={c.weeks} /> },
              ...(c.items.length ? [{ label: t("details"), content: <Items items={c.items} /> }] : []),
            ],
          }));
        const variableLine: LineView = {
          key: "variable", title: t("variable"), tone: "var(--chart-1)", spent: cf.variable.spent, expected: cf.variable.expected,
          spentLabel: t("spent"), expectedLabel: t("recommended"), sections: [{ label: t("byWeek"), content: <WeeksList weeks={cf.weeks} /> }],
        };
        const savingsLine: LineView = {
          key: "savings", title: t("savingsDeposits"), tone: RING.savings, spent: cf.savings.spent, expected: cf.savings.expected,
          spentLabel: t("deposited"), expectedLabel: t("expected"),
          sections: cf.savings.items.length ? [{ label: t("details"), content: <Items items={cf.savings.items} /> }] : [],
        };
        const fixedLine: LineView = {
          key: "fixed", title: t("fixed"), tone: "var(--chart-5)", spent: cf.fixed.spent, expected: cf.fixed.expected,
          spentLabel: t("spent"), expectedLabel: t("expected"),
          sections: cf.fixed.items.length ? [{ label: t("details"), content: <Items items={cf.fixed.items} /> }] : [],
        };
        const incomeLine: LineView = {
          key: "income", title: t("income"), tone: RING.income, spent: cf.income.received, expected: cf.income.expected,
          spentLabel: t("received"), expectedLabel: t("expectedIn"),
          sections: [
            { label: t("incomeFixed"), content: <Items items={cf.income.fixed} /> },
            { label: t("incomeVariable"), content: <Items items={cf.income.variable} /> },
            ...(offset === 0 && wealth.length > 0 ? [{ label: t("wealthGrowth"), total: growthTotal, content: growthList }] : []),
          ],
        };
        const offLine: LineView = {
          key: "off", title: t("offCashflow"), tone: "var(--chart-2)", spent: cf.off.expenseTotal, expected: 0,
          spentLabel: t("spent"), expectedLabel: t("expected"), noMeter: true,
          sections: [
            { label: t("offIncome"), total: cf.off.incomeTotal, content: <Items items={cf.off.income} /> },
            { label: t("offExpenses"), total: cf.off.expenseTotal, content: <Items items={cf.off.expenses} /> },
          ],
        };
        // The map sorts biggest first and can be narrowed, so a household with many categories still finds one.
        const overLine = (l: LineView) => !!l.showLeft && l.expected > 0 && l.spent > l.expected;
        const visible = (list: LineView[]) =>
          list
            .filter((l) => (chartFilter === "all" ? true : chartFilter === "over" ? overLine(l) : l.spent > 0))
            .sort((a, b) => (chartSort === "name" ? a.title.localeCompare(b.title, locale) : chartDesc ? b.spent - a.spent : a.spent - b.spent));
        // One map for every kind of line: the categories, then the month's flows (variable, savings, fixed, income, off).
        const categoryLines = visible(tracked);
        const flowLines = [variableLine, savingsLine, fixedLine, incomeLine, offLine]
          .filter((l) => (chartFilter === "all" ? true : chartFilter === "over" ? overLine(l) : l.spent > 0));
        const heatLines = [...categoryLines, ...flowLines];
        const current = heatLines.find((l) => l.key === selected) ?? heatLines[0] ?? null;

        const spentPct = cf.totalExpected > 0 ? Math.min(100, (cf.totalSpent / cf.totalExpected) * 100) : cf.totalSpent > 0 ? 100 : 0;
        const hero = (
          // Same frame as the Budget and Overview heroes (.studio-overview): 28/30px padding, 28px corners, month on the end side.
          <section className="wallet shrink-0 overflow-hidden rounded-3xl px-5 pb-4 pt-[22px] shadow-sm min-[600px]:rounded-[28px] min-[600px]:px-[30px] min-[600px]:pb-5 min-[600px]:pt-7">
            {/* Wide screens: the figure on one side, this month's detail on the other, split by a hairline. */}
            {/* Two columns only when there is a second one to fill: Simple mode keeps the figure across the card. */}
            <div className={cn("lg:items-start", cardOnly && extra ? "lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-x-12" : "")}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-footnote text-muted-foreground">
                  <span className="min-w-0 truncate">{name && !cardOnly ? t("hi", { name }) : <SyncLine run={run} />}</span>
                  {monthNav}
                </div>
                {name && !cardOnly && <div className="mt-1 text-footnote text-muted-foreground"><SyncLine run={run} /></div>}
                {/* Wide screens in Simple mode: the figure on one side, this month's meter on the other. Advanced keeps the figure whole beside its next step. */}
                <div className={cn("lg:items-end", !cardOnly && "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-10")}>
                <div className="hero-with-aside"><div className="min-w-0 flex-1">
                <h2 className="mt-4 text-sm font-medium text-pretty">{t(offset === 0 ? "forecastTitle" : "endedTitle", { month: monthName })}</h2>
                {cf.forecast < 0 && <p className="mt-2 flex items-center gap-1 text-footnote font-medium text-status-heads-up"><AlertCircle className="size-4 shrink-0" aria-hidden />{t("forecastShort")}</p>}
                <p className={`studio-amount figure ${cf.forecast < 0 ? "text-status-heads-up" : ""}`}>
                  <Signed n={cf.forecast} />
                </p>
                {offset === 0 && <BalancePill bank={cash.data?.bank ?? null} accounts={cash.data?.accounts ?? []} />}
                </div>{heroAside && <div className="hero-aside">{heroAside}</div>}</div>
                <div className="mt-5 lg:mt-0 lg:pb-1">
                  <div className="flex items-baseline justify-between gap-3 text-footnote">
                    <span className="text-muted-foreground">{t("spentSoFar")}</span>
                    <span className="tabular-nums"><bdi className="font-semibold">{formatCurrency(cf.totalSpent)}</bdi> / <bdi className="text-muted-foreground">{formatCurrency(cf.totalExpected)}</bdi></span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar"
                    aria-valuenow={Math.round(spentPct)} aria-valuemin={0} aria-valuemax={100} aria-label={t("spentSoFar")}
                    aria-valuetext={t("meterText", { spent: formatCurrency(cf.totalSpent), expected: formatCurrency(cf.totalExpected) })}>
                    <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${spentPct}%`, background: `linear-gradient(90deg, ${RING.spending}, #ffb38a)` }} />
                  </div>
                </div>
                </div>
              </div>
              {/* Simple mode keeps the purple card to the numbers alone; Advanced borrows it with its next step. */}
              {cardOnly && extra && (
                <div className="mt-5 lg:mt-1 lg:border-s lg:border-white/15 lg:ps-8">
                  {extra}
                </div>
              )}
            </div>
            {/* Full width under both columns: twelve months need the room. */}
            <MonthStrip value={month} onChange={goMonth} max={thisMonth} />
          </section>
        );
        const trackButton = (
          <TrackPicker
            compact
            options={trackable.map((c) => ({ id: c.id, name: catName(c.name), on: c.budgetMode === "budgeted" }))}
            onChange={(ids, on) => {
              if (on && ids.length === 1) setSelected(`cat-${ids[0]}`);
              void act(Promise.all(ids.map((id) => updateCategoryBudgetMode(id, on ? "budgeted" : "tracking")))).catch(() => {});
            }}
          />
        );
        // Every section, weeks included, stays closed until it is asked for.
        const panel = (l: LineView, openFirst = false) => (
          <>
            <Head title={l.title}>{l.menu}</Head>
            {!l.noMeter && <Meter title={l.title} spent={l.spent} expected={l.expected} spentLabel={l.spentLabel} expectedLabel={l.expectedLabel} tone={l.tone} showLeft={l.showLeft} />}
            {l.noMeter && <div className="h-3" />}
            {l.sections.map((s, i) => <Expand key={s.label} id={`home.${l.key}.${s.label}`} label={s.label} total={s.total} defaultOpen={openFirst && i === 0}>{s.content}</Expand>)}
          </>
        );
        // Advanced mode borrows just the forecast card.
        if (cardOnly) return <div className="mb-6 md:mb-8">{hero}</div>;

        return (
          <>
            {hero}
            {/* One heat map for the whole month: categories, then this month's flows. Tapping a tile opens its detail. */}
            <div className="mt-2.5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] lg:items-start lg:gap-3">
              <div className="rounded-2xl border border-border/60 bg-card p-2">
                <div className="flex items-center justify-between gap-2 px-0.5 pb-1.5">
                  <h2 className="text-footnote font-medium text-muted-foreground">{t("linesTitle")}</h2>
                  <div className="flex items-center gap-0.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label={t("filterLabel")} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                        <SlidersHorizontal className="size-4" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuRadioGroup value={chartFilter} onValueChange={(v) => setChartFilter(v as typeof chartFilter)}>
                          <DropdownMenuRadioItem value="all">{t("filterAll")}</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="over">{t("filterOver")}</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="active">{t("filterActive")}</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup value={chartSort === "name" ? "name" : chartDesc ? "desc" : "asc"} onValueChange={(v) => { if (v === "name") setChartSort("name"); else { setChartSort("amount"); setChartDesc(v === "desc"); } }}>
                          <DropdownMenuRadioItem value="desc">{t("sortAmountDesc")}</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="asc">{t("sortAmountAsc")}</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="name">{t("sortName")}</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {trackButton}
                  </div>
                </div>
                {heatLines.length === 0 ? (
                  <p className="px-2 py-6 text-center text-footnote text-muted-foreground">{t("noLines")}</p>
                ) : (
                  <HeatMap lines={heatLines} split={categoryLines.length} selected={current?.key ?? ""} onSelect={setSelected} label={t("linesTitle")} />
                )}
              </div>
              {current && (
                <section aria-live="polite" aria-label={current.title} className="mt-2.5 rounded-2xl border border-border/60 bg-card pb-1 lg:sticky lg:top-3 lg:mt-0">
                  <div key={current.key}>{panel(current)}</div>
                </section>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}

type LineView = {
  key: string; title: string; tone: string; spent: number; expected: number;
  spentLabel: string; expectedLabel: string; showLeft?: boolean; noMeter?: boolean;
  menu?: React.ReactNode;
  sections: { label: string; total?: number; content: React.ReactNode }[];
};

/**
 * Spend as a heat map: every category is a tile, tinted by how much of the biggest spend it carries, so a
 * household with twenty categories sees the shape of the month at once and opens one with a tap.
 */
function HeatMap({ lines, split = 0, selected, onSelect, label }: { lines: LineView[]; split?: number; selected: string; onSelect: (k: string) => void; label: string }) {
  const formatCurrency = useMoney();
  // Categories first, then the month's flows; the hairline keeps the two kinds apart without another heading.
  const groups = split > 0 && split < lines.length ? [lines.slice(0, split), lines.slice(split)] : [lines];
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {groups.map((group, gi) => {
        // Intensity is scaled per group: income is always the biggest number, and one shared scale washed every category tile out.
        const top = Math.max(...group.map((g) => g.spent), 1);
        return (
        <Fragment key={gi}>
          {gi > 0 && <div aria-hidden className="col-span-full my-0.5 h-px bg-border/70" />}
          {group.map((l) => {
            const sel = l.key === selected;
            const share = Math.max(0, Math.min(1, l.spent / top));
            const over = !!l.showLeft && l.expected > 0 && l.spent > l.expected;
            const tint = over ? "var(--status-over)" : l.tone;
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={sel}
                aria-label={l.title + ": " + formatCurrency(l.spent)}
                onClick={() => onSelect(l.key)}
                className={cn(
                  "flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-start transition-transform duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ring",
                  sel ? "ring-2 ring-primary" : "",
                )}
                style={{ background: "color-mix(in oklab, " + tint + " " + (6 + Math.round(share * 34)) + "%, var(--card))" }}
              >
                <span className="truncate text-[11px] leading-4 text-foreground/85">{l.title}</span>
                <bdi className="truncate text-xs font-semibold tabular-nums">{formatCurrency(l.spent)}</bdi>
              </button>
            );
          })}
        </Fragment>
        );
      })}
    </div>
  );
}

/** Which categories get their own row: searchable checklist with select/clear all and a count. */
function TrackPicker({ options, onChange, compact }: { options: { id: number; name: string; on: boolean }[]; onChange: (ids: number[], on: boolean) => void; compact?: boolean }) {
  const t = useTranslations("home.simple");
  const [q, setQ] = useState("");
  const count = options.filter((o) => o.on).length;
  const shown = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const bulk = (on: boolean) => { const ids = shown.filter((o) => o.on !== on).map((o) => o.id); if (ids.length) onChange(ids, on); };
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("trackCategory")}
        className={compact
          ? "relative grid size-9 place-items-center rounded-full text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          : "flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/40 px-4 text-sm font-medium text-primary hover:bg-accent disabled:opacity-50 max-lg:min-h-14"}
        disabled={options.length === 0}>
        <Plus className="size-4" aria-hidden /> {!compact && t("trackCategory")}
        {count > 0 && (compact
          ? <span aria-hidden className="absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground tabular-nums">{count}</span>
          : <span className="rounded-full bg-primary/10 px-2 text-xs tabular-nums">{count}</span>)}
      </PopoverTrigger>
      <PopoverContent className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchCategories") + "…"} aria-label={t("searchCategories")}
            className="min-h-11 w-full rounded-lg border border-border bg-background ps-8 pe-2 text-sm" />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground" aria-live="polite">{t("selectedCount", { count, total: options.length })}</span>
          <span className="flex gap-1">
            <button type="button" className="min-h-9 rounded-md px-2 font-medium text-primary hover:bg-accent" onClick={() => bulk(true)}>{t("selectAll")}</button>
            <button type="button" className="min-h-9 rounded-md px-2 font-medium text-primary hover:bg-accent" onClick={() => bulk(false)}>{t("clearAll")}</button>
          </span>
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {shown.map((o) => (
            <li key={o.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-accent">
                <input type="checkbox" checked={o.on} onChange={(e) => onChange([o.id], e.target.checked)} className="size-4 accent-[var(--primary)]" />
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">{t("noMatches")}</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Bank balance, with the accounts behind it, without leaving Simple mode. */
function BalancePill({ bank, accounts }: { bank: number | null; accounts: { provider: string; accountNumber: string; balance: number; updatedAt: string }[] }) {
  const t = useTranslations("home.simple");
  const formatCurrency = useMoney();
  return (
    <Popover>
      <PopoverTrigger className="-ms-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-footnote text-muted-foreground hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        {t("bankBalance")}
        <span className="font-medium tabular-nums">{bank != null ? <Signed n={bank} /> : "—"}</span>
        <ChevronDown className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-72">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBalance")}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {accounts.map((a) => (
              <li key={`${a.provider}-${a.accountNumber}`} className="flex items-center justify-between gap-3 py-2">
                <bdi className="truncate">{a.provider} · ••••{a.accountNumber.slice(-4)}</bdi>
                <span className="tabular-nums">{a.balance < 0 ? <Signed n={a.balance} /> : <bdi>{formatCurrency(a.balance)}</bdi>}</span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Ring colors: lavender, gold and sky, readable on the dark hero in every theme. */
const RING = { income: "var(--ring-income)", spending: "var(--ring-spending)", savings: "var(--ring-savings)" } as const;

/** Signed amount; shekels() keeps the minus with the number inside an isolate, so it never flips in RTL. */
function Signed({ n }: { n: number }) {
  return <>{shekels(n, useLocale())}</>;
}

/** Every transaction in the range, page by page (the API caps a page at 200). */
async function getAllTransactions(from: string, to: string) {
  const PAGE = 200;
  const all: Awaited<ReturnType<typeof getTransactions>>["transactions"] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await getTransactions({ from, to, kind: "all", limit: PAGE, offset });
    all.push(...page.transactions);
    if (page.transactions.length < PAGE || all.length >= page.total) break;
  }
  return all;
}

/** Amounts as the rest of the app shows them: whole shekels, sign handled by the caller. */
function useMoney() {
  const locale = useLocale();
  return (n: number) => shekels(Math.abs(n), locale);
}

/** Same surface as Advanced's CardShell, so Appearance settings (theme, glass, density) apply here too. */
function Card({ children }: { children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-border/60 bg-card">{children}</section>;
}

function Head({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 px-5 pt-5 sm:px-6">
      <h2 className="card-title">{title}</h2>
      {children}
    </div>
  );
}

/** ⋮ on a tracked category: change what is expected this month, or stop tracking it. */
function CardMenu({ label, expected, onSave, onStop }: { label: string; expected: number; onSave: (v: number) => Promise<unknown>; onStop: () => void }) {
  const t = useTranslations("home.simple");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(value);
          if (value === "" || !Number.isFinite(v) || v < 0) return;
          onSave(Math.round(v)).then(() => setEditing(false), () => {});
        }}
      >
        <input
          autoFocus
          type="number"
          min={0}
          inputMode="numeric"
          aria-label={t("expectedFor", { name: label })}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-11 w-24 rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
        />
        <button type="submit" className="min-h-11 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">{t("save")}</button>
        <button type="button" className="min-h-11 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent" onClick={() => setEditing(false)}>{t("cancel")}</button>
      </form>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="-me-2 -mt-2 grid size-11 place-items-center rounded-full hover:bg-accent" aria-label={t("cardMenu", { name: label })}>
        <MoreVertical className="h-5 w-5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => { setValue(String(Math.round(expected))); setEditing(true); }}>{t("editExpected")}</DropdownMenuItem>
        <DropdownMenuItem onClick={onStop}>{t("stopTracking")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Run = { failed: boolean; at: string | null } | null;

/** When the data last synced; a failed sync links to the bank settings. */
function SyncLine({ run }: { run: Run }) {
  const t = useTranslations("home.simple");
  const locale = useLocale();
  if (!run) return null;
  if (run.failed) {
    return (
      <Link href="/settings/bank" className="flex items-center gap-1 text-[var(--status-over)]">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />{t("syncFailed")}
      </Link>
    );
  }
  if (!run.at) return null;
  const at = new Date(run.at);
  return <span>{t("updated", { when: at.toLocaleString(locale, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) })}</span>;
}

function Meter({ title, spent, expected, spentLabel, expectedLabel, tone, showLeft }: {
  title: string; spent: number; expected: number; spentLabel: string; expectedLabel: string; tone: string; showLeft?: boolean;
}) {
  const t = useTranslations("home.simple");
  const formatCurrency = useMoney();
  const pct = expected > 0 ? Math.min(100, (spent / expected) * 100) : spent > 0 ? 100 : 0;
  const over = spent - expected;
  const isOver = showLeft && over > 0;
  const bar = isOver ? "var(--status-over)" : tone;
  return (
    <div className="px-5 pb-5 pt-3 sm:px-6">
      <div className="flex justify-between text-xs text-muted-foreground"><span>{spentLabel}</span><span>{expectedLabel}</span></div>
      <div className="flex justify-between text-lg tabular-nums">
        {/* The ring tones are pale (made for the dark hero); pulled toward the text color so they stay readable on light cards. */}
        <bdi className="font-semibold" style={{ color: `color-mix(in oklab, ${tone} 55%, var(--foreground))` }}>{formatCurrency(spent)}</bdi>
        <bdi className="text-muted-foreground">{formatCurrency(expected)}</bdi>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: `color-mix(in oklab, ${bar} 18%, transparent)` }} role="progressbar"
        aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={title}
        aria-valuetext={t("meterText", { spent: formatCurrency(spent), expected: formatCurrency(expected) })}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bar }} />
      </div>
      {showLeft && (
        <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${isOver ? "text-status-over" : ""}`}>
          {isOver && <AlertCircle className="size-3.5" aria-hidden />}
          {isOver ? t("overBy", { amount: formatCurrency(over) }) : t("leftAmount", { amount: formatCurrency(-over) })}
        </p>
      )}
    </div>
  );
}

/** A line's month by weeks: per week what was spent of its budget, a bar, and what is left or over. This week stands out. */
function WeeksList({ weeks }: { weeks: Week[] }) {
  const t = useTranslations("home.simple");
  const formatCurrency = useMoney();
  const dates = new Intl.DateTimeFormat(useLocale(), { day: "numeric", month: "numeric" });
  return (
    <div className="pb-3">
      <p className="flex justify-end pb-1 text-xs text-muted-foreground">{t("spent")} / {t("weekBudget")}</p>
      <ol className="-mx-3 space-y-1">
        {weeks.map((w, i) => {
          const over = w.left < 0;
          const pct = w.share > 0 ? Math.min(100, (w.spent / w.share) * 100) : w.spent > 0 ? 100 : 0;
          const tone = over ? "var(--expense)" : "var(--status-on-track)";
          return (
            <li key={i} aria-current={w.current ? "date" : undefined}
              className={`rounded-xl px-3 py-2.5 ${w.current ? "bg-accent ring-1 ring-primary/30" : ""} ${w.future ? "text-muted-foreground" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  {t("week", { n: i + 1 })}
                  {w.current && <span className="rounded-full bg-primary px-2 py-px text-[11px] font-semibold text-primary-foreground">{t("thisWeek")}</span>}
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  <bdi className="font-semibold">{formatCurrency(w.spent)}</bdi>
                  <span className="text-muted-foreground"> / <bdi>{formatCurrency(w.share)}</bdi></span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar"
                aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={t("week", { n: i + 1 })}
                aria-valuetext={t("meterText", { spent: formatCurrency(w.spent), expected: formatCurrency(w.share) })}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
                <bdi className="tabular-nums text-muted-foreground">{dates.formatRange(w.from, w.to)}</bdi>
                <span className={`flex items-center gap-1 font-medium tabular-nums ${w.future ? "" : over ? "text-expense" : "text-status-on-track"}`}>
                  {over && <AlertCircle className="size-3.5" aria-hidden />}
                  {over ? t("overBy", { amount: formatCurrency(w.left) }) : t("leftAmount", { amount: formatCurrency(w.left) })}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A card's section: a label row that opens it, so a long page stays a list of headlines. */
function Expand({ label, total, defaultOpen, children }: { id: string; label: string; total?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const formatCurrency = useMoney();
  const [open, setOpen] = useState(!!defaultOpen);
  const id = useId();
  return (
    <section className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-5 text-sm font-medium transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring sm:px-6"
      >
        <span className="flex items-center gap-1.5">
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden />
          {label}
        </span>
        {total != null && <bdi className="font-normal tabular-nums">{formatCurrency(total)}</bdi>}
      </button>
      {open && <div id={id} className="px-5 sm:px-6">{children}</div>}
    </section>
  );
}

function Items({ items }: { items: { id: number; date: string; description: string; amount: number }[] }) {
  const formatCurrency = useMoney();
  const locale = useLocale();
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  if (items.length === 0) return <p className="pb-3 text-sm text-muted-foreground">—</p>;
  return (
    <ul className="divide-y divide-border pb-1 text-sm">
      {items.map((x) => (
        <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="min-w-0">
            <bdi className="block truncate">{x.description}</bdi>
            <span className="text-xs text-muted-foreground">{day.format(new Date(x.date.slice(0, 10) + "T00:00:00"))}</span>
          </span>
          <bdi className="tabular-nums">{formatCurrency(Math.abs(x.amount))}</bdi>
        </li>
      ))}
    </ul>
  );
}
