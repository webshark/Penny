import { Bitcoin, Briefcase, Building2, Car, Coins, CreditCard, GraduationCap, HandCoins, House, Landmark, Layers, PiggyBank, Shield, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import type { AccountGroupKey } from "@/lib/account-groups";
import type { AssetType } from "@/lib/types";

/** One line icon per account group, used wherever accounts are grouped (side menu, accounts page). */
export const GROUP_ICON: Record<AccountGroupKey, LucideIcon> = {
  bank: Layers, investments: TrendingUp, property: House, vehicles: Car, other: Briefcase, liabilities: HandCoins,
};

/** One per account type, so a list of accounts reads at a glance. */
export const TYPE_ICON: Record<AssetType, LucideIcon> = {
  cash: Wallet, deposit: PiggyBank, bond: Landmark, stock: TrendingUp, fund: TrendingUp, study_fund: GraduationCap,
  provident: Shield, pension: Shield, real_estate: House, business: Building2, metal: Coins, crypto: Bitcoin,
  vehicle: Car, other: Briefcase, mortgage: House, loan: HandCoins, credit: CreditCard, other_liability: HandCoins,
};
