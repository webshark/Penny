import { getTranslations } from "next-intl/server";
import { Tag } from "lucide-react";
import { SectionShell } from "@/components/settings/section-shell";
import { TagsManager } from "@/components/settings/tags-manager";

export default async function TagsSettingsPage() {
  const t = await getTranslations("settings.tagsAdmin");
  return (
    <SectionShell title={t("title")} description={t("description")} icon={<Tag aria-hidden />}>
      <TagsManager />
    </SectionShell>
  );
}
