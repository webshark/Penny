"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";
import { LayoutDashboard, CreditCard, Calculator, Plus, Grid2X2, FileUp, Landmark, WalletCards } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { NAVIGATION_GROUPS } from "./navigation-groups";

export function MobileDock() {
  const path = usePathname(); const t = useTranslations("nav"); const tShell = useTranslations("shell"); const tNav = useTranslations("navGroups");
  const { setOpenMobile } = useSidebar();
  const router = useRouter();
  const tTop = useTranslations("topBar");

  const activeHref = NAVIGATION_GROUPS.flatMap(group => group.items).find(item => item.match(path))?.href;
  // Same names as the menu; the last button opens the full menu.
  const items = [ { href: "/", name: tNav("pages.home"), Icon: LayoutDashboard }, { href: "/transactions", name: tNav("pages.transactions"), Icon: CreditCard }, { href: "/transactions?add=1", name: tShell("addTransaction"), Icon: Plus }, { href: "/budget", name: tNav("pages.budget"), Icon: Calculator }, { href: "/more", name: tShell("menu"), Icon: Grid2X2 } ];
  return <nav className="mobile-dock" aria-label={t("mobileNavigation")}>{items.map(({ href, name, Icon }) => href === "/more" ? <button key={href} type="button" onClick={() => setOpenMobile(true)} aria-label={tShell("openFullNavigation")} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-3 text-xs"><Icon size={21} aria-hidden /><span>{tShell("menu")}</span></button> : href.includes("add=1") ? (
    // The same + as the top bar: a transaction, or money in some other way.
    <DropdownMenu key={href}>
      <DropdownMenuTrigger aria-label={tTop("addMenu")} className="mobile-dock-add"><span><Icon size={24} aria-hidden /></span></DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" className="min-w-56 bg-popover">
        <DropdownMenuItem onClick={() => router.push("/transactions?add=1")}><Plus className="size-4" aria-hidden />{tShell("addTransaction")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings/data")}><FileUp className="size-4" aria-hidden />{tTop("importFile")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings/bank")}><Landmark className="size-4" aria-hidden />{tTop("connectBank")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/investments")}><WalletCards className="size-4" aria-hidden />{tTop("addAccount")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : <Link key={href} href={href} aria-current={activeHref === href ? "page" : undefined}><Icon size={21} aria-hidden /><span>{name}</span></Link>)}</nav>;
}
