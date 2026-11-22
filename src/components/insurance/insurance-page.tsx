"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

import { CardShell } from "@/components/home/card-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteInsuranceDocument,
  deleteInsurancePolicy,
  fetchInsuranceDocument,
  getInsurance,
  saveInsurancePolicy,
  setInsuranceDocumentKind,
  uploadInsuranceDocument,
} from "@/lib/api";
import { daysUntil, HAR_HABITUACH_URL, insuranceOverlaps, renewalDay } from "@/lib/insurance";
import { shekels } from "@/lib/money";
import { formatDate } from "@/lib/formatters";
import { POLICY_KINDS, type InsuranceDocument, type InsurancePolicyView, type InsuranceUnlinkedCharge } from "@/lib/types";

const ANY_ACCOUNT = "__any";

interface Draft {
  id?: number;
  name: string;
  kind: string;
  provider: string;
  insured: string;
  monthlyPremium: string;
  renewalMonth: string;
  startDate: string;
  endDate: string;
  policyNumber: string;
  paymentAccount: string;
  matchPattern: string;
  coverage: string;
  deductible: string;
  agentName: string;
  agentPhone: string;
  notes: string;
  archived: boolean;
}

const EMPTY: Draft = {
  name: "",
  kind: "health",
  provider: "",
  insured: "",
  monthlyPremium: "",
  renewalMonth: "",
  startDate: "",
  endDate: "",
  policyNumber: "",
  paymentAccount: "",
  matchPattern: "",
  coverage: "",
  deductible: "",
  agentName: "",
  agentPhone: "",
  notes: "",
  archived: false,
};

function draftOf(p: InsurancePolicyView): Draft {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    provider: p.provider ?? "",
    insured: p.insured ?? "",
    monthlyPremium: String(p.monthlyPremium ?? ""),
    renewalMonth: p.renewalMonth ?? "",
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
    policyNumber: p.policyNumber ?? "",
    paymentAccount: p.paymentAccount ?? "",
    matchPattern: p.matchPattern ?? "",
    coverage: p.coverage == null ? "" : String(p.coverage),
    deductible: p.deductible == null ? "" : String(p.deductible),
    agentName: p.agentName ?? "",
    agentPhone: p.agentPhone ?? "",
    notes: p.notes ?? "",
    archived: !!p.archived,
  };
}

function fromCharge(c: InsuranceUnlinkedCharge): Draft {
  return {
    ...EMPTY,
    name: c.description,
    monthlyPremium: String(Math.max(0, Math.round(c.lastAmount))),
    paymentAccount: c.account,
    matchPattern: c.description,
  };
}

/** The API is the validator; this only turns a form draft into its body. */
function itemOf(d: Draft) {
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    provider: d.provider,
    insured: d.insured,
    monthlyPremium: d.monthlyPremium,
    renewalMonth: d.renewalMonth,
    startDate: d.startDate,
    endDate: d.endDate,
    policyNumber: d.policyNumber,
    paymentAccount: d.paymentAccount,
    matchPattern: d.matchPattern,
    coverage: d.coverage,
    deductible: d.deductible,
    agentName: d.agentName,
    agentPhone: d.agentPhone,
    notes: d.notes,
    archived: d.archived,
  };
}

export function InsurancePage() {
  const t = useTranslations("insurance");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["insurance"], queryFn: getInsurance });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<InsurancePolicyView | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["insurance"] });

  const save = useMutation({
    mutationFn: (d: Draft) => saveInsurancePolicy(itemOf(d)),
    onSuccess: (_r, d) => {
      refresh();
      setDraft(null);
      toast.success(d.id ? t("updated") : t("added"));
    },
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });
  const archive = useMutation({
    mutationFn: (p: InsurancePolicyView) => saveInsurancePolicy({ ...itemOf(draftOf(p)), archived: !p.archived }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });
  const remove = useMutation({
    mutationFn: (p: InsurancePolicyView) => deleteInsurancePolicy(p.id),
    onSuccess: () => {
      refresh();
      setDeleting(null);
      toast.success(t("deleted"));
    },
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });

  const data = query.data;
  const active = data?.policies.filter((p) => !p.archived) ?? [];
  const archived = data?.policies.filter((p) => p.archived) ?? [];
  const overlaps = insuranceOverlaps(active);

  return (
    <div className="space-y-5">
      <p className="text-footnote text-pretty text-muted-foreground">{t("subtitle")}</p>

      {query.isLoading && <Skeleton className="h-32 w-full rounded-2xl" />}
      {query.isError && (
        <CardShell>
          <div className="flex items-center justify-between gap-3 py-4">
            <span className="text-footnote text-muted-foreground">{t("loadFailed")}</span>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>{t("retry")}</Button>
          </div>
        </CardShell>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("monthly")} value={shekels(data.totals.monthly, locale)} />
            <Stat label={t("paidLast12")} value={shekels(data.totals.paidLast12, locale)} />
            <Stat label={t("renewalsSoon")} value={String(data.totals.renewalsSoon)} />
            <Stat label={t("documentsCount")} value={String(data.totals.documents)} />
          </div>

          {overlaps.length > 0 && (
            <CardShell label={t("overlapTitle")}>
              <ul className="space-y-2 py-2 text-footnote">
                {overlaps.map((o) => (
                  <li key={`${o.kind}-${o.who}-${o.policyKind}`} className="flex gap-2 text-pretty">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-heads-up" aria-hidden />
                    <span>
                      {o.who || t("household")}: {o.names.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
              <a
                href={HAR_HABITUACH_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("harLink")}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </CardShell>
          )}

          {data.unlinked.length > 0 && (
            <CardShell label={t("unlinkedTitle")}>
              <p className="pb-2 text-caption text-pretty text-muted-foreground">{t("unlinkedHint")}</p>
              <ul className="row-grid">
                {data.unlinked.map((c) => (
                  <li key={`${c.description}-${c.account}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-footnote font-medium">{c.description}</span>
                      <span className="block text-caption text-muted-foreground tabular-nums">
                        {t("chargeLine", { count: c.count, account: c.account })} · {formatDate(c.lastDate)} · {shekels(c.lastAmount, locale)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-footnote font-semibold tabular-nums">{shekels(c.total, locale)}</span>
                      <Button variant="outline" size="sm" onClick={() => setDraft(fromCharge(c))}>
                        <Plus className="size-4" aria-hidden />
                        {t("createFromCharge")}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </CardShell>
          )}

          <CardShell
            label={t("policies")}
            action={
              <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
                <Plus className="size-4" aria-hidden />
                {t("addPolicy")}
              </Button>
            }
          >
            {active.length === 0 ? (
              <div className="py-8 text-center">
                <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
                <p className="mt-2 text-footnote font-medium">{t("noPolicies")}</p>
                <p className="mt-1 text-caption text-muted-foreground">{t("noPoliciesHint")}</p>
              </div>
            ) : (
              <ul className="row-grid">
                {active.map((p) => (
                  <PolicyRow
                    key={p.id}
                    policy={p}
                    onEdit={() => setDraft(draftOf(p))}
                    onArchive={() => archive.mutate(p)}
                    onDelete={() => setDeleting(p)}
                  />
                ))}
              </ul>
            )}
          </CardShell>

          {archived.length > 0 && (
            <CardShell label={t("archivedTitle")}>
              <ul className="row-grid">
                {archived.map((p) => (
                  <PolicyRow
                    key={p.id}
                    policy={p}
                    onEdit={() => setDraft(draftOf(p))}
                    onArchive={() => archive.mutate(p)}
                    onDelete={() => setDeleting(p)}
                  />
                ))}
              </ul>
            </CardShell>
          )}

          {draft && (
            <PolicyDialog
              key={draft.id ?? "new"}
              draft={draft}
              accounts={data.accounts}
              saving={save.isPending}
              onSave={(d) => save.mutate(d)}
              onClose={() => setDraft(null)}
            />
          )}

          <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("delete")}</DialogTitle>
                <DialogDescription>{deleting ? `${deleting.name}: ${t("deleteHint")}` : ""}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
                <Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
                  {t("delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-surface px-4 py-3">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="mt-1 text-title font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PolicyRow({
  policy,
  onEdit,
  onArchive,
  onDelete,
}: {
  policy: InsurancePolicyView;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("insurance");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["insurance"] });
  const upload = useMutation({
    mutationFn: ({ file }: { file: File }) => uploadInsuranceDocument(policy.id, file, "policy"),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });
  const dropDoc = useMutation({
    mutationFn: (docId: number) => deleteInsuranceDocument(docId),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });
  const changeKind = useMutation({
    mutationFn: ({ docId, kind }: { docId: number; kind: string }) => setInsuranceDocumentKind(docId, kind),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });

  const day = renewalDay(policy);
  const left = day ? daysUntil(day, new Date()) : null;

  async function openDoc(doc: InsuranceDocument) {
    try {
      const blob = await fetchInsuranceDocument(doc.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("saveFailed"));
    }
  }

  return (
    <li className={policy.archived ? "py-3 opacity-60" : "py-3"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-footnote font-semibold">
            {policy.name}
            <span className="rounded-full bg-accent px-2 py-0.5 text-caption font-medium text-accent-foreground">{t(`policy_${policy.kind}`)}</span>
            {policy.archived && <span className="text-caption text-muted-foreground">{t("archived")}</span>}
          </p>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {[policy.provider, policy.insured, policy.policyNumber && `#${policy.policyNumber}`].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            {policy.matchPattern ? (
              <>
                <span dir="auto">{policy.matchPattern}</span>
                {policy.paymentAccount ? ` · ${policy.paymentAccount}` : ` · ${t("anyAccount")}`}
              </>
            ) : (
              <span className="text-status-heads-up">{t("noMatch")}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={t("editPolicy")} onClick={onEdit}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label={policy.archived ? t("unarchive") : t("archive")} onClick={onArchive}>
            {policy.archived ? <RotateCcw className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("delete")} onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-caption">
        <span className="tabular-nums">
          <span className="text-muted-foreground">{t("monthly")}: </span>
          <span className="font-semibold">{shekels(policy.monthlyPremium, locale)}</span>
        </span>
        <span className="tabular-nums">
          <span className="text-muted-foreground">{t("payments")}: </span>
          {policy.payments.last12 > 0 ? (
            <span className="font-semibold">{shekels(policy.payments.last12, locale)}</span>
          ) : (
            <span className="text-muted-foreground">{t("noPayments")}</span>
          )}
        </span>
        <span className={left != null && left >= 0 && left <= 60 ? "font-semibold text-status-heads-up" : "text-muted-foreground"}>
          {day ? t("renewsOn", { date: formatDate(day) }) : t("noRenewal")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {policy.documents.map((doc) => (
          <span key={doc.id} className="flex items-center gap-1 rounded-full border border-border py-0.5 pe-1 ps-2 text-caption">
            <FileText className="size-3.5 text-muted-foreground" aria-hidden />
            <button type="button" onClick={() => openDoc(doc)} className="max-w-40 truncate hover:underline focus-visible:outline-2 focus-visible:outline-ring" title={`${doc.originalName} · ${t(`docKind_${doc.kind}`)}`}>
              {doc.originalName}
            </button>
            <Select value={doc.kind} onValueChange={(v) => v && changeKind.mutate({ docId: doc.id, kind: v })}>
              <SelectTrigger className="h-6 w-auto gap-1 border-0 bg-transparent px-1 text-caption" aria-label={t("documents")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["policy", "appendix", "renewal", "claim", "other"] as const).map((k) => (
                  <SelectItem key={k} value={k}>{t(`docKind_${k}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="size-6" aria-label={t("removeDoc")} onClick={() => dropDoc.mutate(doc.id)}>
              <Trash2 className="size-3" aria-hidden />
            </Button>
          </span>
        ))}
        <label className={buttonVariants({ variant: "outline", size: "sm" }) + " cursor-pointer"}>
          <Upload className="size-3.5" aria-hidden />
          {upload.isPending ? t("uploading") : t("upload")}
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate({ file });
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {policy.documents.length === 0 && <p className="mt-1 text-caption text-muted-foreground">{t("noDocuments")}</p>}
    </li>
  );
}

function PolicyDialog({
  draft,
  accounts,
  saving,
  onSave,
  onClose,
}: {
  draft: Draft;
  accounts: string[];
  saving: boolean;
  onSave: (d: Draft) => void;
  onClose: () => void;
}) {
  const t = useTranslations("insurance");
  // Mounted with a key per policy (see the parent), so the form starts from this draft.
  const [form, setForm] = useState<Draft>(draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? t("editPolicy") : t("addPolicy")}</DialogTitle>
        </DialogHeader>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(form);
          }}
        >
          <Field label={t("name")} htmlFor="ins-name">
            <Input id="ins-name" required maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={t("kind")}>
            <Select value={form.kind} onValueChange={(v) => v && set("kind", v)}>
              <SelectTrigger aria-label={t("kind")} className="w-full"><SelectValue>{(v: string) => t(`policy_${v}`)}</SelectValue></SelectTrigger>
              <SelectContent>
                {POLICY_KINDS.map((k) => <SelectItem key={k} value={k}>{t(`policy_${k}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("provider")} htmlFor="ins-provider">
            <Input id="ins-provider" maxLength={60} value={form.provider} onChange={(e) => set("provider", e.target.value)} />
          </Field>
          <Field label={t("insured")} htmlFor="ins-insured">
            <Input id="ins-insured" maxLength={40} placeholder={t("insuredHint")} value={form.insured} onChange={(e) => set("insured", e.target.value)} />
          </Field>
          <Field label={t("premium")} htmlFor="ins-premium" hint={t("monthlyHint")}>
            <Input id="ins-premium" required type="number" min="0" step="any" dir="ltr" value={form.monthlyPremium} onChange={(e) => set("monthlyPremium", e.target.value)} />
          </Field>
          <Field label={t("policyNumber")} htmlFor="ins-number">
            <Input id="ins-number" maxLength={40} dir="ltr" value={form.policyNumber} onChange={(e) => set("policyNumber", e.target.value)} />
          </Field>
          <Field label={t("startDate")} htmlFor="ins-start">
            <Input id="ins-start" type="date" dir="ltr" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label={t("endDate")} htmlFor="ins-end">
            <Input id="ins-end" type="date" dir="ltr" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
          <Field label={t("renewalMonth")} htmlFor="ins-renew">
            <Input id="ins-renew" type="month" dir="ltr" value={form.renewalMonth} onChange={(e) => set("renewalMonth", e.target.value)} />
          </Field>
          <Field label={t("paymentAccount")}>
            <Select value={form.paymentAccount || ANY_ACCOUNT} onValueChange={(v) => set("paymentAccount", v === ANY_ACCOUNT ? "" : (v ?? ""))}>
              <SelectTrigger aria-label={t("paymentAccount")} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_ACCOUNT}>{t("anyAccount")}</SelectItem>
                {accounts.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("matchPattern")} htmlFor="ins-match" hint={t("matchHint")} className="sm:col-span-2">
            <Input id="ins-match" maxLength={60} value={form.matchPattern} onChange={(e) => set("matchPattern", e.target.value)} />
          </Field>
          <Field label={t("coverage")} htmlFor="ins-coverage">
            <Input id="ins-coverage" type="number" min="0" step="any" dir="ltr" value={form.coverage} onChange={(e) => set("coverage", e.target.value)} />
          </Field>
          <Field label={t("deductible")} htmlFor="ins-deductible">
            <Input id="ins-deductible" type="number" min="0" step="any" dir="ltr" value={form.deductible} onChange={(e) => set("deductible", e.target.value)} />
          </Field>
          <Field label={t("agentName")} htmlFor="ins-agent">
            <Input id="ins-agent" maxLength={60} value={form.agentName} onChange={(e) => set("agentName", e.target.value)} />
          </Field>
          <Field label={t("agentPhone")} htmlFor="ins-phone">
            <Input id="ins-phone" type="tel" dir="ltr" maxLength={40} value={form.agentPhone} onChange={(e) => set("agentPhone", e.target.value)} />
          </Field>
          <Field label={t("notes")} htmlFor="ins-notes" className="sm:col-span-2">
            <textarea
              id="ins-notes"
              rows={2}
              maxLength={500}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-footnote outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-footnote sm:col-span-2">
            <input type="checkbox" checked={form.archived} onChange={(e) => set("archived", e.target.checked)} className="size-4 accent-primary" />
            {t("archive")}
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" disabled={saving}>{saving ? t("saving") : t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-caption text-pretty text-muted-foreground">{hint}</p>}
    </div>
  );
}
