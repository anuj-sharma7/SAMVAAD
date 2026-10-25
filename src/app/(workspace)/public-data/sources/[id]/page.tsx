import { notFound } from "next/navigation";
import { db, requireActor, safe } from "@/lib/server/context";
import { getSource } from "@/lib/services/public-context";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { Card, CardHeader, Chip, DefinitionRow, Notice, PageHeader } from "@/components/ui";
import { ExternalLinkText, PublicDataBadge } from "@/components/public-data";
import { STATUS, accessLabel, accessMeaning, geoLabel } from "@/lib/public-status";

export default async function SourceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireActor();
  const { t, locale } = await getI18n();
  const r = safe(() => getSource(db(), id));
  if (!r.ok) notFound();
  const s = r.value;
  const st = STATUS[s.access_status];
  const pedagogy = s.dataset_type.startsWith("pedagogy");
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/public-data", label: t("publicdata.title") }, { href: "/public-data/sources", label: t("publicdata.sources.crumb") }, { label: s.source_id }]}
        title={s.source_name}
        description={<span className="flex flex-wrap items-center gap-2"><PublicDataBadge /><Chip tone={st?.tone ?? "neutral"}>{accessLabel(t, s.access_status)}</Chip></span>}
      />
      {st && <Notice tone={s.is_active ? "success" : "warning"} className="mb-6" title={s.is_active ? (pedagogy ? t("publicdata.detail.inUsePedagogy") : t("publicdata.detail.inUsePublic")) : t("publicdata.detail.notInUse")}>{accessMeaning(t, s.access_status)} {s.access_detail}{pedagogy ? ` ${t("publicdata.detail.pedagogyNote")}` : ""}</Notice>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("publicdata.detail.provenance")} />
          <dl className="divide-y divide-line px-5">
            <DefinitionRow label={t("publicdata.detail.publisher")}>{s.publisher}</DefinitionRow>
            <DefinitionRow label={t("publicdata.detail.sourcePage")}><ExternalLinkText href={s.source_url}>{s.source_url}</ExternalLinkText></DefinitionRow>
            <DefinitionRow label={t("publicdata.detail.fileUrl")}>{s.download_url_or_api ? <span className="break-all text-[13px]">{s.download_url_or_api}</span> : t("publicdata.detail.pageOnly")}</DefinitionRow>
            <DefinitionRow label={t("publicdata.detail.referencePeriod")}>{s.reference_period}</DefinitionRow>
            <DefinitionRow label={t("publicdata.detail.retrieved")}>{s.retrieved_at_utc ? fmtDateTime(s.retrieved_at_utc, locale) : t("publicdata.detail.notRetrieved")}</DefinitionRow>
            <DefinitionRow label={t("publicdata.detail.geography")}>{geoLabel(t, s.geography_level)} · {s.geography_coverage}</DefinitionRow>
            <DefinitionRow label={t("publicdata.detail.datasetType")}>{s.dataset_type} ({s.format})</DefinitionRow>
            <DefinitionRow label={t("publicdata.detail.indicatorValues")}>{s.indicators ? fmtNumber(s.indicators, locale) : fmtNumber(0, locale)}</DefinitionRow>
            <DefinitionRow label={t("publicdata.detail.localFile")}>{s.file_path ? <span className="font-mono text-[12px]">{s.file_path}</span> : t("publicdata.detail.none")}</DefinitionRow>
            <DefinitionRow label="SHA-256">{s.sha256 ? <span className="break-all font-mono text-[11px]">{s.sha256}</span> : "—"}</DefinitionRow>
          </dl>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("publicdata.detail.licenceTitle")} />
            <div className="space-y-3 p-5 text-sm">
              <p><strong>{t("publicdata.detail.terms")}</strong> {s.licence_or_terms}</p>
              <p><strong>{t("publicdata.detail.citeAs")}</strong> {s.citation_or_attribution}</p>
            </div>
          </Card>
          <Card>
            <CardHeader title={t("publicdata.detail.limitations")} />
            <p className="p-5 text-sm">{s.known_limitations}</p>
            {s.transformation_notes && <p className="border-t border-line px-5 py-3 text-[13px] text-ink-600"><strong>{t("publicdata.detail.processing")}</strong> {s.transformation_notes}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
