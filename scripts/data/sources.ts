/**
 * Catalogue of public-education sources SAMVAAD attempts to acquire.
 * Everything here is an ATTEMPT: `npm run data:download` fetches each entry, validates the response
 * (status, content type, file signature) and records the true outcome in data/source_registry.csv.
 * Nothing is marked successful unless a real, signature-checked file was saved.
 *
 * Rules honoured: no CAPTCHA automation, no login/registration bypass, TLS verification always on,
 * honest User-Agent, one request per URL.
 */
export type Expect = "pdf" | "csv" | "html";

export interface SourceDef {
  source_id: string;
  source_name: string;
  publisher: string;
  source_url: string;
  /** Direct file URL, if one exists. Omitted when only a page exists. */
  download_url?: string;
  expect: Expect;
  dataset_type: string;
  format: string;
  geography_level: string;
  geography_coverage: string;
  reference_year_or_period: string;
  licence_or_terms: string;
  citation_or_attribution: string;
  known_limitations: string;
  /** Keep a local raw copy (third-party files are kept locally and git-ignored, never republished). */
  keep_raw: boolean;
  /** Per-request timeout; large official PDFs need longer than the 60 s default. */
  timeout_ms?: number;
  /**
   * Known access constraint verified by inspection. The downloader still probes the URL, but if the
   * probe cannot produce a valid file this status and reason are recorded.
   */
  constraint?: { status: AccessStatus; reason: string };
}

export type AccessStatus =
  | "downloaded_and_validated"
  | "report_downloaded"
  | "public_page_only"
  | "manual_download_needed"
  | "registration_or_request_required"
  | "captcha_or_interaction_blocked"
  | "unavailable"
  | "rejected_due_to_license_or_privacy";

const ASER = "https://asercentre.org/wp-content/uploads/2022/12";
const ASER_ATTR = "ASER Centre, Annual Status of Education Report (Rural) 2024, Pratham Education Foundation. https://asercentre.org/aser-2024/";
const ASER_LIC = "No open licence is stated on the ASER 2024 page. Publicly readable; reuse is subject to ASER Centre terms. SAMVAAD stores derived statistics with attribution and a link; raw PDFs stay local and are not republished.";
const ASER_LIM =
  "Household sample survey of rural children (national ASER 2024: 649,491 children, 17,997 villages, 605 rural districts, per the national findings). Not a census, not school-level, not teacher observation. Estimates carry sampling error; ASER 2024 covers rural districts only. Do not infer individual school or teacher quality.";

const aserState = (id: string, slug: string, state: string): SourceDef => ({
  source_id: `aser_2024_${id}_state`,
  source_name: `ASER 2024 ${state} state findings`,
  publisher: "ASER Centre (Pratham)",
  source_url: "https://asercentre.org/aser-2024/",
  download_url: `${ASER}/${slug}.pdf`,
  expect: "pdf",
  dataset_type: "learning_survey_state_summary",
  format: "pdf",
  geography_level: "state",
  geography_coverage: `${state} (rural)`,
  reference_year_or_period: "ASER 2024",
  licence_or_terms: ASER_LIC,
  citation_or_attribution: ASER_ATTR,
  known_limitations: ASER_LIM,
  keep_raw: true,
});

export const SOURCES: SourceDef[] = [
  // ---- UDISE+ (Ministry of Education) -------------------------------------------------------------
  {
    source_id: "udise_2024_25_booklet",
    source_name: "UDISE+ 2024-25 Booklet (national highlights and state tables)",
    publisher: "Ministry of Education, Department of School Education & Literacy",
    source_url: "https://dashboard.udiseplus.gov.in/",
    download_url: "https://dashboard.udiseplus.gov.in/report-new-v.6-demo2025/static/media/UDISE%2B2024_25_Booklet_existing.118ba29d4773e6372f72.pdf",
    expect: "pdf",
    dataset_type: "school_census_publication",
    format: "pdf",
    geography_level: "state/UT (national tables)",
    geography_coverage: "All States/UTs",
    reference_year_or_period: "UDISE+ 2024-25 (data cut-off 31 March 2025, per booklet p.7)",
    licence_or_terms: "Official Government of India publication; no explicit reuse licence text retrieved. Attribution to Ministry of Education / UDISE+ is given for every figure.",
    citation_or_attribution: "Ministry of Education, Government of India, UDISE+ 2024-25 Booklet.",
    known_limitations: "School-census publication at state/UT level. Figures are reported by schools; no instructional-quality information. Parsed from a PDF, so every table is checked by arithmetic validation.",
    keep_raw: true,
  },
  {
    source_id: "udise_2025_26_booklet",
    source_name: "UDISE+ 2025-26 Booklet (existing structure; national highlights and state tables)",
    publisher: "Ministry of Education, Department of School Education & Literacy",
    source_url: "https://dashboard.udiseplus.gov.in/",
    download_url: "https://dashboard.udiseplus.gov.in/report2026/static/media/UDISE%2B2025_26_Booklet_existing.edd7cd16d934a10377ba.pdf",
    expect: "pdf",
    dataset_type: "school_census_publication",
    format: "pdf",
    geography_level: "state/UT (national tables)",
    geography_coverage: "All States/UTs",
    reference_year_or_period: "UDISE+ 2025-26",
    licence_or_terms: "Official Government of India publication; no explicit reuse licence text retrieved. Attribution to Ministry of Education / UDISE+ is given for every figure.",
    citation_or_attribution: "Ministry of Education, Government of India, UDISE+ 2025-26 Booklet.",
    known_limitations: "School-census publication at state/UT level, reported by schools. File URL taken from the public dashboard's own JavaScript bundle (report2026); linked from the public Reports page, no login or CAPTCHA.",
    keep_raw: true,
  },
  {
    source_id: "pib_udise_2025_26_release",
    source_name: "PIB press release: UDISE+ 2025-26 report (PRID 2282141)",
    publisher: "Press Information Bureau, Government of India",
    source_url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2282141&lang=2&reg=48",
    expect: "html",
    dataset_type: "press_release",
    format: "html",
    geography_level: "national",
    geography_coverage: "India",
    reference_year_or_period: "UDISE+ 2025-26",
    licence_or_terms: "PIB content; terms not retrieved.",
    citation_or_attribution: "Press Information Bureau, Ministry of Education, press release on UDISE+ 2025-26.",
    known_limitations: "Press release only; no indicator values are taken from it.",
    keep_raw: false,
    constraint: { status: "public_page_only", reason: "Press-release page; no indicator values are taken from it." },
  },
  {
    source_id: "udise_report_module",
    source_name: "UDISE+ public report module",
    publisher: "Ministry of Education",
    source_url: "https://www.udiseplus.gov.in/udisereport/",
    expect: "html",
    dataset_type: "interactive_report_portal",
    format: "html",
    geography_level: "state/district/block (interactive)",
    geography_coverage: "India",
    reference_year_or_period: "multiple years",
    licence_or_terms: "Not retrieved (portal unavailable).",
    citation_or_attribution: "Ministry of Education, UDISE+.",
    known_limitations: "Interactive portal; no bulk-download endpoint identified.",
    keep_raw: false,
  },
  {
    source_id: "dsel_education_documents_page",
    source_name: "DoSEL documents page (host named in the UDISE+ 2025-26 booklet, p.11)",
    publisher: "Ministry of Education, DoSEL",
    source_url: "https://www.dsel-education.gov.in/documents",
    expect: "html",
    dataset_type: "statistics_index_page",
    format: "html",
    geography_level: "national",
    geography_coverage: "India",
    reference_year_or_period: "n/a",
    licence_or_terms: "Official site; terms not retrieved.",
    citation_or_attribution: "Ministry of Education, DoSEL.",
    known_limitations: "Added to the host allow-list only so the page the booklet points to can be checked once; no file is taken from it.",
    keep_raw: false,
    constraint: { status: "public_page_only", reason: "Index page checked once for UDISE+ report links; no dataset is taken from it." },
  },
  {
    source_id: "udise_microdata_portal",
    source_name: "UDISE+ data sharing / microdata portal",
    publisher: "Ministry of Education",
    source_url: "https://microdata.udiseplus.gov.in/",
    expect: "html",
    dataset_type: "row_level_microdata_portal",
    format: "html",
    geography_level: "school (row level)",
    geography_coverage: "India",
    reference_year_or_period: "multiple years",
    licence_or_terms: "Access governed by the portal's registration and data-sharing terms.",
    citation_or_attribution: "Ministry of Education, UDISE+ Data Sharing Portal.",
    known_limitations: "Row-level data are not public downloads.",
    keep_raw: false,
    constraint: {
      status: "registration_or_request_required",
      reason: "Row-level UDISE+ microdata requires registration and an approved data request on the portal. No request was submitted; see docs/data_access_requests.md.",
    },
  },
  {
    source_id: "dsel_statistics_page",
    source_name: "Ministry of Education statistics page (DoSEL)",
    publisher: "Ministry of Education",
    source_url: "https://dsel.education.gov.in/en/statistics",
    expect: "html",
    dataset_type: "statistics_index_page",
    format: "html",
    geography_level: "national",
    geography_coverage: "India",
    reference_year_or_period: "n/a",
    licence_or_terms: "Official site; terms not retrieved.",
    citation_or_attribution: "Ministry of Education, DoSEL.",
    known_limitations: "Page is client-rendered (Next.js); the HTML contains no table or file links, so nothing can be parsed from it without a browser.",
    keep_raw: false,
    constraint: { status: "public_page_only", reason: "Client-rendered page; no file or table was exposed in the served HTML." },
  },

  // ---- data.gov.in ---------------------------------------------------------------------------------
  {
    source_id: "ogd_udise_2023_24_infra_table_2_5",
    source_name: "State/UTs-wise School Infrastructure Highlights, UDISE+ 2023-24 (Table 2.5)",
    publisher: "Ministry of Education via Open Government Data (OGD) Platform India",
    source_url: "https://www.data.gov.in/resource/stateuts-wise-number-school-infrastructure-highlights-udise-data-during-2023-24",
    download_url: "https://www.data.gov.in/files/ogdpv2dms/s3fs-public/UDISE_2023-24_Table_2.5.csv",
    expect: "csv",
    dataset_type: "school_infrastructure_state_table",
    format: "csv",
    geography_level: "state/UT",
    geography_coverage: "All States/UTs",
    reference_year_or_period: "UDISE+ 2023-24",
    licence_or_terms: "OGD Platform India (Government Open Data Licence – India) per the portal; per-resource terms not retrieved.",
    citation_or_attribution: "Ministry of Education, UDISE+ 2023-24, published on data.gov.in.",
    known_limitations: "Direct file URL found in the page's embedded metadata, but the file host returned HTTP 403 to a scripted request. Not circumvented. Manual download through the portal (or a registered API key) is needed.",
    keep_raw: true,
    constraint: {
      status: "manual_download_needed",
      reason: "The CSV URL listed in the resource metadata returns HTTP 403 (redirect to /page_not_found) for scripted requests. SAMVAAD did not spoof browsers or bypass the portal's controls.",
    },
  },
  {
    source_id: "ogd_udise_catalog",
    source_name: "data.gov.in UDISE+ catalogue page",
    publisher: "OGD Platform India",
    source_url: "https://www.data.gov.in/catalog/unified-district-information-system-education-plus-udise-plus",
    expect: "html",
    dataset_type: "catalogue_page",
    format: "html",
    geography_level: "n/a",
    geography_coverage: "India",
    reference_year_or_period: "n/a",
    licence_or_terms: "OGD Platform India terms.",
    citation_or_attribution: "OGD Platform India.",
    known_limitations: "Resource list is loaded client-side; the served HTML does not enumerate downloadable resources.",
    keep_raw: false,
    constraint: { status: "public_page_only", reason: "Resource list is client-rendered; no file links in the served HTML." },
  },

  // ---- Rajasthan Shala Darpan ---------------------------------------------------------------------
  {
    source_id: "rj_shaladarpan_school_reports",
    source_name: "Rajasthan Shala Darpan: school reports dashboard",
    publisher: "Rajasthan Council of School Education / NIC Rajasthan",
    source_url: "https://rajshaladarpan.rajasthan.gov.in/SD3/Home/Public2/CitizenCorner/School_Report_Dashbord.aspx",
    expect: "html",
    dataset_type: "school_directory_reports",
    format: "html",
    geography_level: "school / district",
    geography_coverage: "Rajasthan",
    reference_year_or_period: "live portal",
    licence_or_terms: "Portal terms not retrieved.",
    citation_or_attribution: "Shala Darpan, Rajasthan Council of School Education.",
    known_limitations: "Report pages (Model_School_Report, CWSN_Report, Residential_Report, KGVB_School_Report…) and school search render a CAPTCHA field; no table is served without completing it.",
    keep_raw: false,
    constraint: {
      status: "captcha_or_interaction_blocked",
      reason: "Each report page and the school search include a CAPTCHA control, and no aggregate table is returned without it. Not automated. The page also exposes school contact/headmaster fields that SAMVAAD would exclude anyway.",
    },
  },

  // ---- ASER 2024 ----------------------------------------------------------------------------------
  {
    source_id: "aser_2024_national_findings",
    source_name: "ASER 2024 national findings",
    publisher: "ASER Centre (Pratham)",
    source_url: "https://asercentre.org/aser-2024/",
    download_url: `${ASER}/ASER-2024-National-findings.pdf`,
    expect: "pdf",
    dataset_type: "learning_survey_national_summary",
    format: "pdf",
    geography_level: "national (rural India)",
    geography_coverage: "India (rural)",
    reference_year_or_period: "ASER 2024",
    licence_or_terms: ASER_LIC,
    citation_or_attribution: ASER_ATTR,
    known_limitations: ASER_LIM,
    keep_raw: true,
  },
  aserState("rajasthan", "Rajasthan-2", "Rajasthan"),
  {
    ...aserState("rajasthan", "Rajasthan_District-Estimates", "Rajasthan"),
    source_id: "aser_2024_rajasthan_district",
    source_name: "ASER 2024 Rajasthan district estimates",
    dataset_type: "learning_survey_district_estimates",
    geography_level: "district",
  },
  {
    ...aserState("rajasthan", "Rajasthan_Divisional-estimates", "Rajasthan"),
    source_id: "aser_2024_rajasthan_divisional",
    source_name: "ASER 2024 Rajasthan divisional estimates",
    dataset_type: "learning_survey_divisional_estimates",
    geography_level: "division",
  },
  aserState("gujarat", "Gujarat-1", "Gujarat"),
  aserState("haryana", "Haryana-2", "Haryana"),
  aserState("uttar_pradesh", "Uttar-Pradesh-1", "Uttar Pradesh"),
  aserState("madhya_pradesh", "Madhya-Pradesh-1", "Madhya Pradesh"),
  aserState("bihar", "Bihar-2", "Bihar"),
  aserState("punjab", "Punjab-2", "Punjab"),
  aserState("uttarakhand", "Uttarakhand-2", "Uttarakhand"),

  ...[
    ["gujarat", "Gujarat_District-Estimates", "Gujarat"],
    ["haryana", "Haryana_District-Estimates", "Haryana"],
    ["uttar_pradesh", "Uttar-Pradesh_District-Estimates", "Uttar Pradesh"],
    ["madhya_pradesh", "Madhya-Pradesh_District-Estimates", "Madhya Pradesh"],
    ["bihar", "Bihar_District-Estimates", "Bihar"],
    ["uttarakhand", "Uttarakhand_District-Estimates", "Uttarakhand"],
  ].map(([id, slug, state]): SourceDef => ({
    ...aserState(id, slug, state),
    source_id: `aser_2024_${id}_district`,
    source_name: `ASER 2024 ${state} district estimates`,
    dataset_type: "learning_survey_district_estimates",
    geography_level: "district",
  })),
  // Divisional estimates carry 95% confidence intervals and 2018/2022/2024 values.
  ...[
    ["gujarat", "Gujarat_Divisional-estimates", "Gujarat"],
    ["haryana", "Haryana_Divisional-estimates", "Haryana"],
    ["uttar_pradesh", "Uttar-Pradesh_Divisional-estimates", "Uttar Pradesh"],
    ["madhya_pradesh", "Madhya-Pradesh_Divisional-estimates", "Madhya Pradesh"],
    ["bihar", "Bihar_Divisional-estimates", "Bihar"],
    ["punjab", "DE_Punjab", "Punjab"],
    ["uttarakhand", "Uttarakhand_Divisional-estimates", "Uttarakhand"],
  ].map(([id, slug, state]): SourceDef => ({
    ...aserState(id, slug, state),
    source_id: `aser_2024_${id}_divisional`,
    source_name: `ASER 2024 ${state} divisional estimates`,
    dataset_type: "learning_survey_divisional_estimates",
    geography_level: "division",
  })),

  // ---- PARAKH / NCERT -----------------------------------------------------------------------------
  {
    source_id: "parakh_nas_dashboard_page",
    source_name: "PARAKH NAS dashboard and report links",
    publisher: "NCERT PARAKH",
    source_url: "https://parakh.ncert.gov.in/nas-dashboard/",
    expect: "html",
    dataset_type: "assessment_report_index",
    format: "html",
    geography_level: "state/district (per report)",
    geography_coverage: "India",
    reference_year_or_period: "NAS 2021 (cycle)",
    licence_or_terms: "NCERT terms not retrieved.",
    citation_or_attribution: "NCERT, PARAKH, National Achievement Survey.",
    known_limitations: "The page links to NAS 2021 report PDFs (nas_report_02_02_2024.pdf, NAS21_NRC.pdf, DRC_report.pdf, Technical Report) hosted on ncert.nic.in. That host reset or timed out every connection from this environment.",
    keep_raw: false,
    constraint: { status: "public_page_only", reason: "Index page reachable; report PDFs are on ncert.nic.in which was unreachable from this network (TLS reset / connect timeout)." },
  },
  {
    source_id: "ncert_nas_2021_state_report",
    source_name: "NAS 2021 national/state report PDF",
    publisher: "NCERT",
    source_url: "https://parakh.ncert.gov.in/nas-dashboard/",
    download_url: "https://ncert.nic.in/pdf/NAS/nas_report_02_02_2024.pdf",
    expect: "pdf",
    dataset_type: "assessment_report",
    format: "pdf",
    geography_level: "state",
    geography_coverage: "India",
    reference_year_or_period: "NAS 2021",
    licence_or_terms: "NCERT terms not retrieved.",
    citation_or_attribution: "NCERT, National Achievement Survey 2021 report.",
    known_limitations: "Host unreachable from this environment at attempt time.",
    keep_raw: true,
    constraint: { status: "unavailable", reason: "ncert.nic.in connections reset / timed out from this network; retry later or download manually." },
  },
  {
    source_id: "ncert_nipun_stakeholder_roles",
    source_name: "NIPUN Bharat: Stakeholders' Roles and Responsibilities (NCERT)",
    publisher: "NCERT / Ministry of Education",
    source_url: "https://www.ncert.nic.in/pdf/NIPUN_BharatStakeholders_RolesResponsibilities.pdf",
    download_url: "https://www.ncert.nic.in/pdf/NIPUN_BharatStakeholders_RolesResponsibilities.pdf",
    expect: "pdf",
    dataset_type: "policy_guidance_document",
    format: "pdf",
    geography_level: "national",
    geography_coverage: "India",
    reference_year_or_period: "n/a",
    licence_or_terms: "NCERT terms not retrieved.",
    citation_or_attribution: "NCERT / MoE, NIPUN Bharat Mission: Stakeholders' Roles and Responsibilities.",
    known_limitations: "Host unreachable from this environment at attempt time.",
    keep_raw: true,
    constraint: { status: "unavailable", reason: "ncert.nic.in connections reset / timed out from this network." },
  },
  {
    source_id: "ncert_vidya_pravesh",
    source_name: "Vidya Pravesh: guidelines for 3-month play-based school preparation module (NCERT)",
    publisher: "NCERT",
    source_url: "https://www.ncert.nic.in/pdf/vidyapravesh.pdf",
    download_url: "https://www.ncert.nic.in/pdf/vidyapravesh.pdf",
    expect: "pdf",
    dataset_type: "pedagogy_guidance_document",
    format: "pdf",
    geography_level: "national",
    geography_coverage: "India",
    reference_year_or_period: "n/a",
    licence_or_terms: "NCERT terms not retrieved.",
    citation_or_attribution: "NCERT, Vidya Pravesh.",
    known_limitations: "Host unreachable from this environment at attempt time.",
    keep_raw: true,
    constraint: { status: "unavailable", reason: "ncert.nic.in connections reset / timed out from this network." },
  },

  // ---- Teaching-practice knowledge-base sources (pedagogy guidance, NOT statistics) ----------------------
  {
    source_id: "kb_nipun_bharat_guidelines",
    source_name: "NIPUN Bharat: Guidelines for Implementation (English)",
    publisher: "Ministry of Education, Department of School Education & Literacy (hosted on DIKSHA)",
    source_url: "https://diksha.gov.in/assets/docs/NIPUN-BHARAT-GUIDELINES-EN.pdf",
    download_url: "https://diksha.gov.in/assets/docs/NIPUN-BHARAT-GUIDELINES-EN.pdf",
    expect: "pdf",
    dataset_type: "pedagogy_guidance_document",
    format: "pdf",
    geography_level: "national",
    geography_coverage: "India",
    reference_year_or_period: "NIPUN Bharat Mission guidelines (2021)",
    licence_or_terms:
      "Official Government of India publication hosted on the DIKSHA platform. No explicit reuse licence text was retrieved with the file. SAMVAAD stores only short verbatim excerpts (with page numbers) and a link; the full PDF is not republished. Excerpts stay 'pending review' until an authorised content reviewer approves them.",
    citation_or_attribution: "Ministry of Education, Government of India, NIPUN Bharat Mission: Guidelines for Implementation (DIKSHA copy).",
    known_limitations:
      "A policy and implementation document, not a classroom coaching manual. Extracted passages are short excerpts selected by keyword and are NOT reviewed by an education expert until a curator approves them. The dsel.education.gov.in copy returned HTTP 404 at attempt time; the DIKSHA copy was used.",
    keep_raw: true,
    timeout_ms: 400_000,
  },
  {
    source_id: "dsel_nipun_stakeholder_roles",
    source_name: "NIPUN Bharat: Stakeholders' Roles and Responsibilities (DoSEL copy)",
    publisher: "Ministry of Education, DoSEL",
    source_url: "https://dsel.education.gov.in/sites/default/files/update/NIPUN_Bharat_stakeholders_roles_responsibilities.pdf",
    download_url: "https://dsel.education.gov.in/sites/default/files/update/NIPUN_Bharat_stakeholders_roles_responsibilities.pdf",
    expect: "pdf",
    dataset_type: "policy_guidance_document",
    format: "pdf",
    geography_level: "national",
    geography_coverage: "India",
    reference_year_or_period: "n/a",
    licence_or_terms: "Official Government of India publication; reuse terms not retrieved.",
    citation_or_attribution: "Ministry of Education, NIPUN Bharat Mission: Stakeholders' Roles and Responsibilities.",
    known_limitations: "Link found by web search; the server returned HTTP 404 at attempt time. The NCERT copy was also unreachable.",
    keep_raw: true,
    constraint: { status: "unavailable", reason: "HTTP 404 on dsel.education.gov.in (and dsel-education.gov.in); NCERT copy unreachable. Obtain the current file manually if needed." },
  },

  // ---- DIKSHA -------------------------------------------------------------------------------------
  {
    source_id: "diksha_public_datasets_page",
    source_name: "DIKSHA public datasets catalogue page",
    publisher: "Ministry of Education (DIKSHA)",
    source_url: "https://diksha.gov.in/data/datasets/",
    expect: "html",
    dataset_type: "usage_dataset_catalogue",
    format: "html",
    geography_level: "state (usage data)",
    geography_coverage: "India",
    reference_year_or_period: "various",
    licence_or_terms: "DIKSHA terms of use apply; not reviewed for redistribution.",
    citation_or_attribution: "DIKSHA, Ministry of Education.",
    known_limitations: "Catalogue page of usage datasets (learning-platform activity), not pedagogy content and not classroom evidence. No dataset file was downloaded or used.",
    keep_raw: false,
    constraint: { status: "public_page_only", reason: "Catalogue page only. Usage data are not needed for the MVP and DIKSHA content is not copied (licence/terms review required)." },
  },
];
