"use client";

import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setTransactionTags } from "@/lib/api";
import { normalizeTag } from "@/lib/tags";
import { cn } from "@/lib/utils";

const chip = "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring";

/** Tag chips on a transaction row: click a tag to filter, × to remove (with undo), + to add (autocomplete). */
export function TagChips({ id, tags, allTags, onFilter, className, addClassName }: { id: number; tags: string[]; allTags: string[]; onFilter: (tag: string) => void; className?: string; addClassName?: string }) {
  const t = useTranslations("tags");
  const queryClient = useQueryClient();
  const listId = useId();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const refocus = useRef(false); // after Enter/Esc, return focus to the add button instead of losing it

  const save = async (next: string[], undo?: string[]) => {
    try {
      await setTransactionTags(id, next);
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      if (undo) toast.success(t("removed"), { action: { label: t("undo"), onClick: () => void save(undo) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed"));
    }
  };

  const add = () => {
    const tag = normalizeTag(draft);
    setDraft("");
    setAdding(false);
    if (tag && !tags.includes(tag)) void save([...tags, tag]);
  };

  return (
    <div className={cn("mt-1 flex flex-wrap items-center gap-1", className)}>
      {tags.map((tag) => (
        <span key={tag} className={chip}>
          <button type="button" className="rounded-full focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onFilter(tag)} aria-label={t("filterBy", { tag })}>
            #{tag}
          </button>
          <button type="button" className="-m-1.5 grid size-6 place-items-center rounded-full hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={() => void save(tags.filter((x) => x !== tag), tags)} aria-label={t("remove", { tag })}>
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      {adding ? (
        <>
          <input
            autoFocus
            list={listId}
            value={draft}
            maxLength={40}
            aria-label={t("add")}
            placeholder={t("placeholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); refocus.current = true; add(); }
              if (e.key === "Escape") { refocus.current = true; setDraft(""); setAdding(false); }
            }}
            onBlur={add}
            className="h-6 w-32 rounded-full border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
          />
          <datalist id={listId}>
            {allTags.filter((x) => !tags.includes(x)).map((x) => <option key={x} value={x} />)}
          </datalist>
        </>
      ) : (
        <Button ref={(el) => { if (el && refocus.current) { refocus.current = false; el.focus(); } }} variant="ghost" size="sm" className={cn("h-6 gap-1 px-2 text-xs text-muted-foreground", addClassName)} onClick={() => setAdding(true)}>
          <Plus className="size-3" aria-hidden />
          {t("add")}
        </Button>
      )}
    </div>
  );
}
