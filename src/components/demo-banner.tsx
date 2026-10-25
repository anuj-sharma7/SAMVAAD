import { FlaskConical } from "lucide-react";
import { providerStatus } from "@/lib/ai";
import { getI18n } from "@/lib/i18n/server";

/** Persistent on every workspace page: data is fictional and the AI mode is stated plainly. */
export async function DemoBanner() {
  const ai = providerStatus();
  const { t } = await getI18n();
  return (
    <div className="no-print border-b border-amber-100 bg-amber-50 text-amber-800">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[13px] sm:px-6">
        <span className="inline-flex items-center gap-1.5 font-semibold tracking-wide">
          <FlaskConical size={14} aria-hidden /> {t("common.demo.banner")}
        </span>
        <span>{t("common.demo.noRealData")}</span>
        <span className="sm:ml-auto">
          {t("common.demo.aiLabel")} <strong>{ai.simulated ? t("common.demo.simulated") : ai.label}</strong>
        </span>
      </div>
    </div>
  );
}
