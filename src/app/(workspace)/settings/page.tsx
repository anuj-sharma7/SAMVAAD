import { db, requireActor, aiStatus } from "@/lib/server/context";
import { demoModeEnabled } from "@/lib/auth/session";
import { getPriorityRules } from "@/lib/services/settings";
import { listAudit } from "@/lib/services/audit";
import { can, MIN_GROUP_SIZE } from "@/lib/auth/policy";
import { auditKey, fmtDateTime, roleKey } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { Card, CardHeader, Chip, DefinitionRow, Notice, PageHeader } from "@/components/ui";
import { PreferencesForm, PriorityRulesForm } from "./forms";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.metaTitle") };
}

const CAN: Record<string, { can: number; cannot: number }> = {
  mentor: { can: 5, cannot: 3 },
  supervisor: { can: 4, cannot: 3 },
  diet_admin: { can: 2, cannot: 2 },
};
const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export default async function SettingsPage() {
  const actor = await requireActor();
  const { t, locale } = await getI18n();
  const ai = aiStatus();
  const rules = getPriorityRules(db());
  const audit = listAudit(db(), actor, { limit: 15 });
  const canEditRules = can(actor, "settings:write_rules");
  const roleInfo = CAN[actor.role];
  const roleText = t(roleKey(actor.role));
  const min = String(MIN_GROUP_SIZE);

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("settings.profile.title")} description={t("settings.profile.description")} action={<Chip tone="amber">{t("common.ui.demoTag")}</Chip>} />
            <dl className="divide-y divide-line px-5">
              <DefinitionRow label={t("settings.profile.name")}>{actor.displayName}</DefinitionRow>
              <DefinitionRow label={t("settings.profile.role")}>{roleText}</DefinitionRow>
            </dl>
            <div className="border-t border-line p-5"><PreferencesForm initial={actor.preferredLanguage} /></div>
            {locale === "hi" && <p lang="hi" className="border-t border-line px-5 py-3 text-xs text-ink-600">{t("common.language.draftNotice")}</p>}
          </Card>

          <Card>
            <CardHeader title={t("settings.role.title", { role: roleText.toLowerCase() })} description={t("settings.role.description")} />
            <div className="grid gap-5 p-5 text-sm sm:grid-cols-2">
              <div><h3 className="mb-1.5 font-semibold text-teal-700">{t("settings.role.can")}</h3><ul className="list-disc space-y-1 pl-5">{seq(roleInfo.can).map((i) => <li key={i}>{t(`settings.role.${actor.role}.can${i}`, { min })}</li>)}</ul></div>
              <div><h3 className="mb-1.5 font-semibold text-red-700">{t("settings.role.cannot")}</h3><ul className="list-disc space-y-1 pl-5">{seq(roleInfo.cannot).map((i) => <li key={i}>{t(`settings.role.${actor.role}.cannot${i}`, { min })}</li>)}</ul></div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t("settings.ai.title")} />
            <dl className="divide-y divide-line px-5">
              <DefinitionRow label={t("settings.ai.demoMode")}>{demoModeEnabled() ? <Chip tone="amber">{t("settings.ai.demoOn")}</Chip> : <Chip>{t("settings.ai.demoOff")}</Chip>}</DefinitionRow>
              <DefinitionRow label={t("settings.ai.provider")}><strong>{ai.label}</strong> {ai.simulated && <Chip tone="amber">{t("settings.ai.simulated")}</Chip>}</DefinitionRow>
              <DefinitionRow label={t("settings.ai.status")}>{ai.mode === "demo" ? t("settings.ai.note.demo") : ai.configured ? t("settings.ai.note.anthropic") : t("settings.ai.note.notConfigured")}</DefinitionRow>
              <DefinitionRow label={t("settings.ai.apiKey")}>{t("settings.ai.apiKeyNote")}</DefinitionRow>
            </dl>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-600">{t("settings.ai.envHelpBefore")} <code>.env.local</code> {t("settings.ai.envHelpAfter")}</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("settings.privacy.title")} />
            <ul className="list-disc space-y-2 px-9 py-5 text-sm marker:text-ink-500">
              <li>{t("settings.privacy.p1")}</li>
              <li><strong>{t("settings.privacy.p2Bold")}</strong> {t("settings.privacy.p2")}</li>
              <li>{t("settings.privacy.p3")}</li>
              <li>{t("settings.privacy.p4", { min })}</li>
              <li>{t("settings.privacy.p5")}</li>
              <li>{t("settings.privacy.p6")}</li>
            </ul>
            <Notice className="m-5 mt-0" tone="warning" title={t("settings.privacy.legalTitle")}>{t("settings.privacy.legalBody")}</Notice>
          </Card>

          <Card>
            <CardHeader title={t("settings.rules.title")} description={t("settings.rules.description")} />
            <div className="p-5"><PriorityRulesForm rules={rules} canEdit={canEditRules} /></div>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title={actor.role === "mentor" ? t("settings.audit.titleMentor") : actor.role === "supervisor" ? t("settings.audit.titleSupervisor") : t("settings.audit.titleAdmin")} description={t("settings.audit.description")} />
        {audit.length === 0 ? <p className="p-5 text-sm text-ink-600">{t("settings.audit.empty")}</p> : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50 text-[12px] uppercase tracking-wide text-ink-600"><tr><th scope="col" className="px-5 py-2.5 font-medium">{t("settings.audit.when")}</th><th scope="col" className="px-4 py-2.5 font-medium">{t("settings.audit.event")}</th><th scope="col" className="px-4 py-2.5 font-medium">{t("settings.audit.record")}</th><th scope="col" className="px-4 py-2.5 font-medium">{t("settings.audit.role")}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {audit.map((a) => <tr key={a.id}><td className="whitespace-nowrap px-5 py-2.5 text-ink-600">{fmtDateTime(a.at, locale)}</td><td className="px-4 py-2.5">{t(auditKey(a.action))}</td><td className="px-4 py-2.5 font-mono text-[12px] text-ink-600">{a.resource_type}</td><td className="px-4 py-2.5 text-ink-600">{a.actor_role ? t(roleKey(a.actor_role)) : t("settings.audit.system")}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
