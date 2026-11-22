/** Quick start: setup tasks in groups, each done from the household's real data or marked done by hand. */
export interface QuickStartState {
  bankConnected: boolean;
  budgetSet: boolean;
  uncategorized: number | null;
  goals: number;
  trackers: number;
  tags: number;
  views: number;
  assets: number;
  /** Task ids marked done by hand (the household "activation" preference). */
  marked: string[];
}

export const QUICK_START = [
  { group: "start", tasks: [{ id: "connect", href: "/settings/bank" }, { id: "budget", href: "/budget" }] },
  { group: "organize", tasks: [{ id: "categorize", href: "/transactions?review=1" }, { id: "tag", href: "/transactions" }, { id: "view", href: "/transactions" }] },
  { group: "plan", tasks: [{ id: "goal", href: "/journey" }, { id: "tracker", href: "/trackers" }, { id: "asset", href: "/investments" }] },
  { group: "explore", tasks: [{ id: "analytics", href: "/overview" }, { id: "focus", href: "/focus" }] },
] as const;

export type QuickStartTaskId = (typeof QUICK_START)[number]["tasks"][number]["id"];

const AUTO: Partial<Record<QuickStartTaskId, (s: QuickStartState) => boolean>> = {
  connect: (s) => s.bankConnected,
  budget: (s) => s.budgetSet,
  categorize: (s) => s.uncategorized === 0,
  tag: (s) => s.tags > 0,
  view: (s) => s.views > 0,
  goal: (s) => s.goals > 0,
  tracker: (s) => s.trackers > 0,
  asset: (s) => s.assets > 0,
};

/** Every group with its tasks marked done or not, and the overall count. */
export function quickStart(s: QuickStartState) {
  const groups = QUICK_START.map((g) => {
    const tasks = g.tasks.map((t) => {
      const auto = AUTO[t.id]?.(s) ?? false;
      return { ...t, done: auto || s.marked.includes(t.id), auto };
    });
    return { group: g.group, tasks, done: tasks.filter((t) => t.done).length };
  });
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const done = groups.reduce((n, g) => n + g.done, 0);
  return { groups, total, done, remaining: total - done };
}
