import { getI18n } from "@/lib/i18n/server";

export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div aria-busy="true" aria-label={t("common.loading").replace(/…$/, "")} className="space-y-4">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="skeleton h-64" />
    </div>
  );
}
