import { notFound } from "next/navigation";
import { db, requireActor, safe } from "@/lib/server/context";
import { getCard } from "@/lib/services/practice-cards";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui";
import { CardEditor } from "../../card-editor";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("library.meta.edit") };
}

export default async function EditCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(["diet_admin"]);
  const { t } = await getI18n();
  const r = safe(() => getCard(db(), actor, id));
  if (!r.ok) notFound();
  const c = r.value;
  return (
    <>
      <PageHeader crumbs={[{ href: "/practice-library", label: t("library.title") }, { href: `/practice-library/${id}`, label: id }, { label: t("common.edit") }]} title={t("library.edit.title", { title: c.title })} />
      <CardEditor mode="revise" initial={{ ...c }} />
    </>
  );
}
