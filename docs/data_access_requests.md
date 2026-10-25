# Data access requests (not submitted)

## Re-check log, 25 October 2026 (UDISE+ 2025-26)

- **PIB press release is real.** https://www.pib.gov.in/PressReleasePage.aspx?PRID=2282141&lang=2&reg=48 (HTTP 200 through the guarded downloader; a generic web fetch got HTTP 403). Title: "Releases the Report on Unified District Information System for Education Plus (UDISE+) 2025-26 on School Education in India"; the Ministry of Education announced the report and says the detailed report, in Existing and NEP formats, is on the UDISE+ publications page. Registered as `pib_udise_2025_26_release` (`public_page_only`); no figures were typed in from it. The release date (7 July 2026 per the specification) was not independently read from the page text by the pipeline.
- **A public booklet file exists and was downloaded.** The public dashboard (https://dashboard.udiseplus.gov.in/, app path `/report2026/`) lists `UDISE+2025_26_Booklet_existing` (and `_nep`) PDFs in its own JavaScript bundle; no login, CAPTCHA or terms acceptance is involved. The existing-structure booklet was downloaded as `udise_2025_26_booklet` (12,470,602 bytes, sha256 `f20bfc4296acdb0f84a36f65587002c7899272ea67b6d91497a172a76982d9c4`) and parsed for the same Tables 2.2 and 2.5 as 2024-25, with separate source id and period `UDISE+ 2025-26`. The NEP-structure booklet was not downloaded or parsed.
- **Still blocked, retried once each with no change:** data.gov.in CSV (HTTP 403), UDISE+ report module (HTTP 503), Shala Darpan reports (CAPTCHA), `ncert.nic.in` NAS and Vidya Pravesh and stakeholder-roles PDFs (connection reset / timeout), the DoSEL copy of the NIPUN stakeholder PDF (HTTP 404), data.gov.in and DoSEL index pages (client-rendered; no file links in the served HTML). The booklet cites `https://www.dsel-education.gov.in/documents`; that page is client-rendered and exposes no file link in its HTML.
- **ASER:** the ASER 2024 page's static HTML does not list the additional state files, so no further states were added. Only files that can be located, downloaded, parsed and cross-validated are added.

These are the sources SAMVAAD could not acquire on its own because they need a person's action, registration or approval. **Nothing below has been submitted, registered or agreed to.** Each entry is a ready checklist for whoever is authorised to act.

## 1. data.gov.in resources (UDISE+ 2023-24 infrastructure, others) — manual download or API key

- **Source:** https://www.data.gov.in/resource/stateuts-wise-number-school-infrastructure-highlights-udise-data-during-2023-24
- **What blocked us:** the resource's CSV URL (found in the page's own metadata) returned HTTP 403 and a redirect to `/page_not_found` for a scripted request. We did not try to disguise the request or find another route around it.
- **Needed:** UDISE+ 2023-24 Table 2.5 (state/UT-wise infrastructure counts) as CSV, plus any other UDISE+ state tables on the catalogue.
- **How:** download through a normal browser session, or create an account on data.gov.in and use its documented API key flow. Save the file under `data/raw/` and add it to `scripts/data/sources.ts` with its licence text from the resource page.
- **Granularity:** state/UT. **Purpose:** compare against the 2024-25 booklet already imported and show a second reference year.
- **Minimal justification:** school-system context for mentors; aggregate public statistics only.

## 2. UDISE+ report module and microdata portal — registration / request required

- **Sources:** https://www.udiseplus.gov.in/udisereport/ (HTTP 503 at attempt time) and https://microdata.udiseplus.gov.in/ (registration and approved request).
- **Needed (if approved):** district- or block-level counts of schools, teachers and enrolment, and school type/management, for Rajasthan. **Not needed:** any student-level or staff-personal field.
- **Why it matters:** the 2024-25 booklet is state-level only, so Rajasthan district/block context currently comes from ASER survey estimates, which describe learning, not school supply.
- **Who:** an authorised representative of the pilot partner. Expect to state purpose, data fields and storage/retention. SAMVAAD would store aggregates only.

## 3. Rajasthan Shala Darpan aggregate reports — CAPTCHA-protected

- **Source:** https://rajshaladarpan.rajasthan.gov.in/SD3/Home/Public2/CitizenCorner/School_Report_Dashbord.aspx (and `SchoolSearch_Dashboard.aspx`).
- **What blocked us:** every report page and the school search include a CAPTCHA; no table is returned without it. SAMVAAD does not automate CAPTCHAs. Pages also expose school contact and headmaster fields that SAMVAAD would exclude regardless.
- **Better route:** request a district- or block-level **aggregate** export (schools by management, type, grades served; no contacts) from the Rajasthan Council of School Education / NIC Rajasthan, or from the DIET, under a written purpose statement.
- **Fields sought:** official school code (UDISE), district, block, school type/management, grades served, rural/urban. **Excluded:** headmaster/principal and contact details, student or staff personal data.

## 4. NCERT / PARAKH files — host unreachable from this network

- `https://www.ncert.nic.in/pdf/vidyapravesh.pdf` (Vidya Pravesh module) — TLS reset / connect timeout.
- `https://ncert.nic.in/pdf/NAS/nas_report_02_02_2024.pdf` and the other NAS 2021 report PDFs linked from https://parakh.ncert.gov.in/nas-dashboard/ — same host.
- `https://www.scert.parakh.ncert.gov.in/nas-dashboard` — certificate verification failed (we did not disable verification).
- `https://dsel.education.gov.in/sites/default/files/update/NIPUN_Bharat_stakeholders_roles_responsibilities.pdf` — HTTP 404.
- **Next step:** try again from another network, or download manually. NAS 2021 state/district results would complement ASER; Vidya Pravesh would add school-readiness practices to the knowledge base (excerpts would again start as pending review).

## 5. DIKSHA datasets and content

- The public datasets page lists learning-platform **usage** data; none was downloaded because it is not needed for the MVP.
- DIKSHA **content** was not copied. Using any DIKSHA resource as a practice card requires checking its licence and terms, extracting only short permitted passages with links, and curator approval.
- The one DIKSHA-hosted file used is the Ministry's NIPUN Bharat Guidelines PDF (an official document); only 19 short verbatim excerpts are stored, with page numbers, and all start as pending review.
