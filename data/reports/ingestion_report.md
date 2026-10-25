# Public data ingestion report

Generated 2026-10-25T17:23:09.333Z by `npm run data:registry`. Source of truth: `data/source_registry.csv`.

## Summary

| Status | Sources |
|---|---|
| downloaded_and_validated | 26 |
| report_downloaded | 1 |
| public_page_only | 6 |
| manual_download_needed | 1 |
| registration_or_request_required | 1 |
| captcha_or_interaction_blocked | 1 |
| unavailable | 5 |

Validation: 53/53 checks passed (2026-10-25T17:23:03.592Z).
Processed rows: 4844.
Coverage: {"udise_states_uts":36,"aser_states_with_state_page":8,"aser_districts_parsed":250,"aser_divisions_parsed":61}.

## Downloaded and validated (real files, signature-checked, parsed)
- `udise_2024_25_booklet` (UDISE+ 2024-25 (data cut-off 31 March 2025, per booklet p.7); All States/UTs): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 999.
- `udise_2025_26_booklet` (UDISE+ 2025-26; All States/UTs): Downloaded; HTTP 200, expected signature present. Rows parsed: 999.
- `aser_2024_rajasthan_state` (ASER 2024; Rajasthan (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 10.
- `aser_2024_rajasthan_district` (ASER 2024; Rajasthan (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 204.
- `aser_2024_rajasthan_divisional` (ASER 2024; Rajasthan (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 144.
- `aser_2024_gujarat_state` (ASER 2024; Gujarat (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 10.
- `aser_2024_haryana_state` (ASER 2024; Haryana (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 10.
- `aser_2024_uttar_pradesh_state` (ASER 2024; Uttar Pradesh (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 10.
- `aser_2024_madhya_pradesh_state` (ASER 2024; Madhya Pradesh (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 10.
- `aser_2024_bihar_state` (ASER 2024; Bihar (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 10.
- `aser_2024_punjab_state` (ASER 2024; Punjab (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 10.
- `aser_2024_uttarakhand_state` (ASER 2024; Uttarakhand (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 10.
- `aser_2024_gujarat_district` (ASER 2024; Gujarat (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 162.
- `aser_2024_haryana_district` (ASER 2024; Haryana (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 132.
- `aser_2024_uttar_pradesh_district` (ASER 2024; Uttar Pradesh (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 426.
- `aser_2024_madhya_pradesh_district` (ASER 2024; Madhya Pradesh (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 306.
- `aser_2024_bihar_district` (ASER 2024; Bihar (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 234.
- `aser_2024_uttarakhand_district` (ASER 2024; Uttarakhand (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 78.
- `aser_2024_gujarat_divisional` (ASER 2024; Gujarat (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 90.
- `aser_2024_haryana_divisional` (ASER 2024; Haryana (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 126.
- `aser_2024_uttar_pradesh_divisional` (ASER 2024; Uttar Pradesh (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 342.
- `aser_2024_madhya_pradesh_divisional` (ASER 2024; Madhya Pradesh (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 180.
- `aser_2024_bihar_divisional` (ASER 2024; Bihar (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 180.
- `aser_2024_punjab_divisional` (ASER 2024; Punjab (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 108.
- `aser_2024_uttarakhand_divisional` (ASER 2024; Uttarakhand (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 54.
- `kb_nipun_bharat_guidelines` (NIPUN Bharat Mission guidelines (2021); India): Existing raw file re-verified (signature + checksum); not re-downloaded. Rows parsed: 19.

## Downloaded but not parsed into indicators
- `aser_2024_national_findings` (ASER 2024; India (rural)): Existing raw file re-verified (signature + checksum); not re-downloaded.

## Blocked or unavailable (nothing was bypassed)
- `ogd_udise_2023_24_infra_table_2_5` (UDISE+ 2023-24; All States/UTs): HTTP 403. The CSV URL listed in the resource metadata returns HTTP 403 (redirect to /page_not_found) for scripted requests. SAMVAAD did not spoof browsers or bypass the portal's controls.
- `udise_microdata_portal` (multiple years; India): Row-level UDISE+ microdata requires registration and an approved data request on the portal. No request was submitted; see docs/data_access_requests.md. (page 50307 bytes)
- `rj_shaladarpan_school_reports` (live portal; Rajasthan): Each report page and the school search include a CAPTCHA control, and no aggregate table is returned without it. Not automated. The page also exposes school contact/headmaster fields that SAMVAAD would exclude anyway. (page 31609 bytes)
- `udise_report_module` (multiple years; India): HTTP 503.
- `ncert_nas_2021_state_report` (NAS 2021; India): Network error (ECONNRESET). ncert.nic.in connections reset / timed out from this network; retry later or download manually.
- `ncert_nipun_stakeholder_roles` (n/a; India): Network error (ECONNRESET). ncert.nic.in connections reset / timed out from this network.
- `ncert_vidya_pravesh` (n/a; India): Network error (UND_ERR_CONNECT_TIMEOUT). ncert.nic.in connections reset / timed out from this network.
- `dsel_nipun_stakeholder_roles` (n/a; India): HTTP 404. HTTP 404 on dsel.education.gov.in (and dsel-education.gov.in); NCERT copy unreachable. Obtain the current file manually if needed.

## Public pages inspected only (no dataset taken)
- `pib_udise_2025_26_release` (UDISE+ 2025-26; India): Press-release page; no indicator values are taken from it. (page 497454 bytes)
- `dsel_education_documents_page` (n/a; India): Index page checked once for UDISE+ report links; no dataset is taken from it. (page 8668 bytes)
- `dsel_statistics_page` (n/a; India): Client-rendered page; no file or table was exposed in the served HTML. (page 8709 bytes)
- `ogd_udise_catalog` (n/a; India): Resource list is client-rendered; no file links in the served HTML. (page 1138441 bytes, CAPTCHA present)
- `parakh_nas_dashboard_page` (NAS 2021 (cycle); India): Index page reachable; report PDFs are on ncert.nic.in which was unreachable from this network (TLS reset / connect timeout). (page 27238 bytes)
- `diksha_public_datasets_page` (various; India): Catalogue page only. Usage data are not needed for the MVP and DIKSHA content is not copied (licence/terms review required). (page 58047 bytes)

## Validation warnings
- ASER madhya_pradesh: divisional file has no state-total row; cross-check skipped
- ASER punjab: no district-estimates file exists/parsed for this state; district-vs-divisional cross-check skipped

