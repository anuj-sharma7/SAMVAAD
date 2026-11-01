import { getI18n } from "@/lib/i18n/server";
import { SessionPage } from "../session-page";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("mhelp.meal.title") };
}

export default function MealPage({ searchParams }: { searchParams: Promise<{ s?: string | string[] }> }) {
  return <SessionPage mode="place" searchParams={searchParams} />;
}
