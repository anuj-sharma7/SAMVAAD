# SAMVAAD data directory

Everything here is **real public data or its provenance**, kept apart from the fictional demo records in the app database. Nothing in this folder describes mentor visits, teachers or classrooms.

```
data/
  source_registry.csv        one row per source attempted: status, URL, checksum, reference period, licence note, limitations
  metadata/
    download_log.json        the true outcome of every download attempt (HTTP status, content type, signature check)
    parse_outputs.json       rows parsed per source
    dataset_manifest.json    checksums of processed files + validation summary (the importer refuses mismatches)
  raw/                       downloaded third-party files. GIT-IGNORED: kept locally, never republished. Immutable.
  processed/                 validated, normalised outputs (tracked)
    indicators_long.csv      4,844 indicator values with provenance (see schema below; full dictionary in docs/DATA_DICTIONARY.md)
    indicator_definitions.csv  label, description, unit, domain, caveat for each indicator
    geographies.csv          every geography seen, with the label exactly as printed in the source
  knowledge/                 teaching-practice knowledge base (NOT statistics)
    chunk_manifest.json      curated page + anchor-text pointers
    kb_chunks.json           19 verbatim excerpts extracted from the NIPUN Bharat Guidelines PDF
    kb_cards.json            9 source-backed card DRAFTS built from those excerpts
  reports/
    data_quality.json        53 validation checks, coverage, completeness per source
    ingestion_report.md      human-readable summary of what worked, what was blocked, and why
```

## Refresh everything

```powershell
npm run data:refresh      # download → normalize → validate → kb:extract → registry → ingest → kb:ingest
```

Individual steps: `data:download` (add `--force` to re-download, `--only=<source_id>`), `data:normalize`, `data:validate`, `kb:extract`, `data:registry`, `data:ingest`, `kb:ingest`.

- Re-running is safe. Existing raw files are re-hashed, not re-downloaded; processed files are regenerated deterministically; the importer replaces rather than appends (no double counting) and reports `UNCHANGED` when nothing changed.
- `data:validate` exits non-zero on any failed check, and `data:ingest` refuses to activate data whose validation report has a failure or whose processed file no longer matches the manifest checksum.
- The app also imports the validated data automatically on first start when its tables are empty (`SAMVAAD_AUTO_PUBLIC_INGEST=false` disables this).

## `indicators_long.csv` schema (`indicators_long/1`)

| Column | Meaning |
|---|---|
| `indicator_id` | Defined in `indicator_definitions.csv` |
| `source_id` | Row in `source_registry.csv` the value came from |
| `geography_level` | `national`, `state`, `division` or `district` |
| `state` | Canonical UDISE+ spelling; empty for the national row |
| `area` | District/division exactly as printed in the source (never silently merged) |
| `reference_period` | e.g. `UDISE+ 2024-25`, `ASER 2024`, `ASER 2018` |
| `value` | Number, or empty when the source did not publish it |
| `ci95_half_width` | Published ± (twice the standard error) where the source gives it |
| `value_status` | `reported`, `derived` (computed from published columns, formula in `notes`) or `suppressed` (never zero-filled) |
| `source_locator` | Page / table the value was read from |
| `notes` | Source markers such as "Data insufficient" |

## What cannot be automated (and why)

| Need | Why not automated | Manual step |
|---|---|---|
| data.gov.in CSV files | The file host returns HTTP 403 to scripted requests | Download in a browser, or register for the portal's API key; see `docs/data_access_requests.md` |
| UDISE+ report module / row-level microdata | Report page returned 503; microdata needs registration and an approved request | Request through the portal; none submitted |
| Rajasthan Shala Darpan aggregates | Report and search pages require a CAPTCHA | Ask the Rajasthan Council of School Education for an aggregate export |
| NCERT files and NAS 2021 report PDFs | `ncert.nic.in` resets/times out from this network | Download manually when reachable |
| Hindi guidance text for official cards | Would be machine translation | Needs expert-written Hindi |

No login, CAPTCHA or access control was bypassed, TLS verification was never disabled, and no data-sharing request or agreement was submitted on anyone's behalf.
