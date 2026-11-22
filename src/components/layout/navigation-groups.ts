import { LayoutDashboard, Wallet, PieChart, Layers, Flag, CalendarDays, ShieldCheck, Calculator, GraduationCap, Building2, HeartPulse, Flame, Car, MessageCircleQuestion, ScrollText, Zap, ListChecks, Target, Focus, HandCoins, Rocket, Group, Repeat, Wrench, TrendingUp, CreditCard, CalendarClock, ChartColumn, Milestone, SquareFunction, Table2, LineChart } from "lucide-react";

const item = (href: string, key: string, Icon: typeof Wallet) => ({ href, key, Icon, match: (path: string) => href === "/" ? path === "/" : path === href || path.startsWith(href + "/") });

/**
 * Labels live in messages under navGroups.groups / navGroups.pages. Shared information architecture for desktop and the mobile menu.
 * Each group has its own icon, and no two pages share one.
 * Focus (the calm one-page home), Dashboard, then Accounts, Transactions, Planning, Analytics, in their order. A group with one page shows as a plain link.
 */
export const NAVIGATION_GROUPS = [
  { key: "focus", Icon: Focus, items: [item("/focus", "focus", Focus)] },
  { key: "dashboard", Icon: LayoutDashboard, items: [item("/", "home", LayoutDashboard)] },
  // The core pages first; Penny's own pages follow at the end of each group.
  { key: "accounts", Icon: Layers, items: [
    item("/accounts", "accounts", Wallet),
    item("/loans", "loans", HandCoins),
    item("/investments", "investments", TrendingUp),
    item("/ventures", "ventures", Rocket),
    item("/car", "car", Car),
    item("/insurance", "insurance", ShieldCheck),
    item("/business", "business", Building2),
  ] },
  { key: "transactions", Icon: CreditCard, items: [
    item("/transactions", "transactions", CreditCard),
    item("/groups", "groups", Group),
    item("/optimizations", "optimizations", Wrench),
    item("/settings/rules", "rules", Zap),
    item("/reviews", "reviews", ListChecks),
  ] },
  { key: "planning", Icon: CalendarClock, items: [
    item("/budget", "budget", Calculator),
    item("/journey", "journey", Flag),
    item("/trackers", "trackers", Target),
    item("/recurring", "recurring", Repeat),
    item("/planned", "planned", CalendarDays),
    item("/life", "life", Milestone),
  ] },
  // Settings sit behind the gear in the sidebar footer; Help closes the settings menu.
  // A hub: one link in the side menu; its pages have their own menu card beside them.
  { key: "analytics", Icon: ChartColumn, hub: true, items: [
    item("/overview", "overview", PieChart),
    item("/pivot", "pivot", Table2),
    item("/net-worth", "netWorth", LineChart),
    item("/fi", "fi", Flame),
    item("/recap", "recap", ScrollText),
    item("/wellbeing", "wellbeing", HeartPulse),
    item("/ask", "ask", MessageCircleQuestion),
    item("/calculators", "calculators", SquareFunction),
    item("/learn", "learn", GraduationCap),
  ] },
];
