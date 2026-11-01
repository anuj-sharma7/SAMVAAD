import { getI18n } from "@/lib/i18n/server";
import { SessionPage } from "../session-page";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("mhelp.q.title") };
}

export default function QuestionsPage({ searchParams }: { searchParams: Promise<{ s?: string | string[]; grade?: string | string[]; subject?: string | string[]; visit?: string | string[] }> }) {
  return <SessionPage mode="subject" searchParams={searchParams} />;
}
