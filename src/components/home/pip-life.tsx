"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pip } from "@/lib/pip-bus";

const IDLE_MS = 60_000;

/**
 * Gives Pip a life: it waits while something saves or syncs, nods when a save lands, droops when one fails,
 * shows a text cursor while you type, looks surprised at news and gets bored when nothing happens. Renders nothing.
 */
export function PipLife() {
  const qc = useQueryClient();
  const busy = useRef(0);

  // Saves and syncs: a mutation in flight is waiting; how it ends is the reaction.
  useEffect(() => qc.getMutationCache().subscribe((e) => {
    if (e.type !== "updated") return;
    const status = e.mutation.state.status;
    if (e.action.type === "pending") { if (busy.current++ === 0) pip({ kind: "waiting", on: true }); return; }
    if (status !== "success" && status !== "error") return;
    busy.current = Math.max(0, busy.current - 1);
    if (busy.current === 0) pip({ kind: "waiting", on: false });
    pip({ kind: "play", action: status === "success" ? "affirm" : "failure" });
  }), [qc]);

  // News: when the notifications list grows, a surprised look.
  useEffect(() => {
    let last = -1;
    let syncing = false;
    return qc.getQueryCache().subscribe((e) => {
      if (e.type !== "updated") return;
      // Bank sync runs on the server; its activity poll tells when it starts and ends.
      if (e.query.queryKey[0] === "activity") {
        const active = !!(e.query.state.data as { sync?: { active?: boolean } } | undefined)?.sync?.active;
        if (active !== syncing) { syncing = active; pip({ kind: "waiting", on: active }); if (!active) pip({ kind: "play", action: "success" }); }
        return;
      }
      if (e.query.queryKey[0] !== "notifications") return;
      const n = (e.query.state.data as { items?: unknown[] } | undefined)?.items?.length ?? 0;
      if (last >= 0 && n > last) pip({ kind: "play", action: "surprise" });
      last = n;
    });
  }, [qc]);

  // Typing in any field: the eyes become text cursors; leaving the field brings them back.
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName));
    let typing = false;
    let stop: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (!isField(e.target) || e.ctrlKey || e.metaKey || e.key.length !== 1) return;
      if (!typing) { typing = true; pip({ kind: "typing", on: true }); }
      clearTimeout(stop);
      stop = setTimeout(() => { typing = false; pip({ kind: "typing", on: false }); }, 1500);
    };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(stop); window.removeEventListener("keydown", onKey); };
  }, []);

  // A minute with no pointer or key: bored glances, until something happens again.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => pip({ kind: "play", action: "bored" }), IDLE_MS); };
    const events = ["pointermove", "keydown", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, arm, { passive: true }));
    arm();
    return () => { clearTimeout(timer); events.forEach((ev) => window.removeEventListener(ev, arm)); };
  }, []);

  return null;
}
