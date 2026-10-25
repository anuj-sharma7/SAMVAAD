/**
 * Processed-data schema (version 1). Every public figure SAMVAAD shows comes from a row in this long format,
 * which carries its provenance (source_id + locator), reference period, geography level and value status.
 */
export const SCHEMA_VERSION = "indicators_long/1";

export type ValueStatus = "reported" | "derived" | "suppressed";

export interface IndicatorRow {
  indicator_id: string;
  source_id: string;
  geography_level: "national" | "state" | "division" | "district";
  /** Canonical state/UT name (UDISE+ spelling). Empty for the national row. */
  state: string;
  /** District or division as spelled in the source (never silently merged). */
  area: string;
  reference_period: string;
  /** Numeric value, or null when the source suppressed it / did not publish it. */
  value: number | null;
  /** Half-width of the published 95% confidence interval (2 x standard error), when the source gives one. */
  ci95_half_width: number | null;
  value_status: ValueStatus;
  /** Where in the source file the value was read (page / table). */
  source_locator: string;
  notes: string;
}

export const INDICATOR_COLUMNS: (keyof IndicatorRow)[] = [
  "indicator_id", "source_id", "geography_level", "state", "area", "reference_period",
  "value", "ci95_half_width", "value_status", "source_locator", "notes",
];

export interface IndicatorDef {
  indicator_id: string;
  label: string;
  description: string;
  unit: string;
  domain: "school_system" | "infrastructure" | "enrolment" | "learning";
  survey_type: "school_census" | "household_sample_survey";
  /** Plain-language caveat shown beside every chart/table. */
  caveat: string;
}

const CENSUS = "School census report: counts reported by schools, not a measure of teaching quality.";
const SURVEY = "Household sample survey of rural children. An estimate with sampling error, not a census and not school- or teacher-level evidence.";

const infra = (id: string, label: string): IndicatorDef[] => [
  { indicator_id: `udise_infra_${id}_schools`, label: `Schools with ${label}`, description: `Number of schools reporting ${label} (UDISE+ Table 2.5).`, unit: "schools", domain: "infrastructure", survey_type: "school_census", caveat: CENSUS },
  { indicator_id: `udise_infra_${id}_share`, label: `Share of schools with ${label}`, description: `Schools with ${label} divided by total schools (derived by SAMVAAD from two published columns).`, unit: "% of schools", domain: "infrastructure", survey_type: "school_census", caveat: `${CENSUS} Derived value.` },
];

export const INDICATOR_DEFS: IndicatorDef[] = [
  { indicator_id: "udise_schools_total", label: "Total schools", description: "Total number of schools (UDISE+ Table 2.2).", unit: "schools", domain: "school_system", survey_type: "school_census", caveat: CENSUS },
  { indicator_id: "udise_enrolment_total", label: "Total enrolment", description: "Total enrolments, pre-primary to higher secondary (UDISE+ Table 2.2).", unit: "students", domain: "school_system", survey_type: "school_census", caveat: CENSUS },
  { indicator_id: "udise_teachers_total", label: "Total teachers", description: "Total teachers (UDISE+ Table 2.2).", unit: "teachers", domain: "school_system", survey_type: "school_census", caveat: CENSUS },
  { indicator_id: "udise_ptr", label: "Pupil–teacher ratio", description: "Published pupil-teacher ratio, rounded to a whole number in the source.", unit: "students per teacher", domain: "school_system", survey_type: "school_census", caveat: CENSUS },
  { indicator_id: "udise_avg_teachers_per_school", label: "Average teachers per school", description: "Published average teachers per school (whole number in source).", unit: "teachers per school", domain: "school_system", survey_type: "school_census", caveat: CENSUS },
  { indicator_id: "udise_avg_enrolment_per_school", label: "Average enrolment per school", description: "Published average enrolment per school (whole number in source).", unit: "students per school", domain: "school_system", survey_type: "school_census", caveat: CENSUS },
  { indicator_id: "udise_zero_enrolment_schools", label: "Schools with zero enrolment", description: "Schools reporting no enrolment.", unit: "schools", domain: "school_system", survey_type: "school_census", caveat: CENSUS },
  { indicator_id: "udise_single_teacher_schools", label: "Single-teacher schools", description: "Schools with a single teacher.", unit: "schools", domain: "school_system", survey_type: "school_census", caveat: CENSUS },
  { indicator_id: "udise_enrolment_in_single_teacher_schools", label: "Enrolment in single-teacher schools", description: "Students enrolled in single-teacher schools.", unit: "students", domain: "school_system", survey_type: "school_census", caveat: CENSUS },
  ...infra("library", "a library / book bank / reading corner"),
  ...infra("playground", "a playground"),
  ...infra("girls_toilet", "a functional girls' toilet"),
  ...infra("boys_toilet", "a functional boys' toilet"),
  ...infra("electricity", "functional electricity"),
  ...infra("computer", "computer facility"),
  ...infra("internet", "internet facility"),
  ...infra("drinking_water", "drinking water"),
  ...infra("handwash", "a hand-wash facility"),

  { indicator_id: "aser_enrol_govt_6_14", label: "Children aged 6–14 enrolled in government schools", description: "Share of rural children aged 6–14 enrolled in government schools.", unit: "% of children", domain: "enrolment", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_enrol_pvt_6_14", label: "Children aged 6–14 enrolled in private schools", description: "Share of rural children aged 6–14 enrolled in private schools.", unit: "% of children", domain: "enrolment", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_enrol_other_6_14", label: "Children aged 6–14 enrolled in other schools", description: "Includes madarsa or EGS (per ASER).", unit: "% of children", domain: "enrolment", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_not_in_school_6_14", label: "Children aged 6–14 not enrolled in school", description: "Never enrolled or dropped out.", unit: "% of children", domain: "enrolment", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_std3_5_read_std2", label: "Std III–V children who can read a Std II level text", description: "Share of rural children in Std III–V who can read a Std II level text.", unit: "% of children", domain: "learning", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_std3_5_subtraction", label: "Std III–V children who can do at least subtraction", description: "Share of rural children in Std III–V who can do at least a two-digit subtraction.", unit: "% of children", domain: "learning", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_std6_8_read_std2", label: "Std VI–VIII children who can read a Std II level text", description: "Share of rural children in Std VI–VIII who can read a Std II level text.", unit: "% of children", domain: "learning", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_std6_8_division", label: "Std VI–VIII children who can do division", description: "Share of rural children in Std VI–VIII who can do a division problem.", unit: "% of children", domain: "learning", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_std3_read_std2", label: "Std III children who can read a Std II level text", description: "ASER's headline reading indicator for Std III (all children, Table 4).", unit: "% of children", domain: "learning", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_std5_read_std2", label: "Std V children who can read a Std II level text", description: "Table 4, Std V row.", unit: "% of children", domain: "learning", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_std8_read_std2", label: "Std VIII children who can read a Std II level text", description: "Table 4, Std VIII row.", unit: "% of children", domain: "learning", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_std3_subtraction", label: "Std III children who can do at least subtraction", description: "Table 7, Std III row: 'subtract' plus 'divide' categories (derived by SAMVAAD).", unit: "% of children", domain: "learning", survey_type: "household_sample_survey", caveat: `${SURVEY} Derived value.` },
  { indicator_id: "aser_std5_division", label: "Std V children who can do division", description: "Table 7, Std V row, 'divide' category.", unit: "% of children", domain: "learning", survey_type: "household_sample_survey", caveat: SURVEY },
  { indicator_id: "aser_std8_division", label: "Std VIII children who can do division", description: "Table 7, Std VIII row, 'divide' category.", unit: "% of children", domain: "learning", survey_type: "household_sample_survey", caveat: SURVEY },
];

export const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];
