import { requireActor } from "@/lib/server/context";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui";
import { CardEditor, EMPTY_CARD } from "../card-editor";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("library.meta.new") };
}

export default async function NewCardPage() {
  await requireActor(["diet_admin"]);
  const { t } = await getI18n();
  return (
    <>
      <PageHeader crumbs={[{ href: "/practice-library", label: t("library.title") }, { label: t("library.newCard") }]} title={t("library.new.title")} description={t("library.new.description")} />
      <CardEditor mode="create" initial={EMPTY_CARD} />
    </>
  );
}
