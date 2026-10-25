import type { Tone } from "@/components/ui";

/** Visual tone of each source access status. Labels and meanings are translated: see accessLabelKey / accessMeaningKey. */
export const STATUS: Record<string, { tone: Tone }> = {
  downloaded_and_validated: { tone: "teal" },
  report_downloaded: { tone: "neutral" },
  public_page_only: { tone: "neutral" },
  manual_download_needed: { tone: "amber" },
  registration_or_request_required: { tone: "amber" },
  captcha_or_interaction_blocked: { tone: "amber" },
  unavailable: { tone: "red" },
  rejected_due_to_license_or_privacy: { tone: "red" },
};

export const accessLabelKey = (s: string) => `publicdata.status.${s}.label`;
export const accessMeaningKey = (s: string) => `publicdata.status.${s}.meaning`;

type T = (key: string) => string;

/** Translated access-status label; unknown statuses fall back to the raw value. */
export const accessLabel = (t: T, s: string) => (s in STATUS ? t(accessLabelKey(s)) : s);
export const accessMeaning = (t: T, s: string) => (s in STATUS ? t(accessMeaningKey(s)) : undefined);

const GEO = new Set(["national", "state", "division", "district"]);
/** Translated geography level; free-text levels from the registry stay as data. */
export const geoLabel = (t: T, level: string) => (GEO.has(level) ? t(`publicdata.geo.${level}`) : level);

const INGEST = new Set(["imported", "rejected", "failed"]);
export const ingestLabel = (t: T, status: string) => (INGEST.has(status) ? t(`publicdata.ingest.${status}`) : status);
