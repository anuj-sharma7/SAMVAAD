import { SearchX } from "lucide-react";
import { EmptyState, LinkButton } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <EmptyState
      icon={<SearchX size={28} />}
      title={t("errors.notFound.title")}
      description={t("errors.notFound.description")}
      action={<LinkButton href="/dashboard" variant="secondary">{t("errors.notFound.back")}</LinkButton>}
    />
  );
}
