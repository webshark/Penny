/** One event in the bell: something that happened, not advice (advice is Pip's, in the side rail). */
export type AppNotification =
  | { key: string; kind: "syncDone"; at: string; provider: string; count: number; href: string }
  | { key: string; kind: "syncFailed"; at: string; provider: string; href: string }
  | { key: string; kind: "goalReached"; at: null; name: string; amount: number; href: string };

/** Keys not yet marked as read. */
export const unread = (items: AppNotification[], read: readonly string[]) => items.filter((n) => !read.includes(n.key));

/** Marking all as read keeps only keys still on the list, so the stored set never grows past it. */
export const markAllRead = (items: AppNotification[]) => items.map((n) => n.key);
