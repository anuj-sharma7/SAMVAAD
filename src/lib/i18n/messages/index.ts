import en_common from "./en/common";
import en_nav from "./en/nav";
import en_login from "./en/login";
import en_settings from "./en/settings";
import en_dashboard from "./en/dashboard";
import en_schools from "./en/schools";
import en_visits from "./en/visits";
import en_observe from "./en/observe";
import en_feedback from "./en/feedback";
import en_demo from "./en/demo";
import en_report from "./en/report";
import en_followups from "./en/followups";
import en_library from "./en/library";
import en_publicdata from "./en/publicdata";
import en_help from "./en/help";
import en_errors from "./en/errors";
import en_brief from "./en/brief";
import en_field from "./en/field";
import en_sync from "./en/sync";
import hi_common from "./hi/common";
import hi_nav from "./hi/nav";
import hi_login from "./hi/login";
import hi_settings from "./hi/settings";
import hi_dashboard from "./hi/dashboard";
import hi_schools from "./hi/schools";
import hi_visits from "./hi/visits";
import hi_observe from "./hi/observe";
import hi_feedback from "./hi/feedback";
import hi_demo from "./hi/demo";
import hi_report from "./hi/report";
import hi_followups from "./hi/followups";
import hi_library from "./hi/library";
import hi_publicdata from "./hi/publicdata";
import hi_help from "./hi/help";
import hi_errors from "./hi/errors";
import hi_brief from "./hi/brief";
import hi_field from "./hi/field";
import hi_sync from "./hi/sync";

export const NAMESPACES = ["common", "nav", "login", "settings", "dashboard", "schools", "visits", "observe", "feedback", "demo", "report", "followups", "library", "publicdata", "help", "errors", "brief", "field", "sync", ] as const;

export const en = {
  ...en_common,
  ...en_nav,
  ...en_login,
  ...en_settings,
  ...en_dashboard,
  ...en_schools,
  ...en_visits,
  ...en_observe,
  ...en_feedback,
  ...en_demo,
  ...en_report,
  ...en_followups,
  ...en_library,
  ...en_publicdata,
  ...en_help,
  ...en_errors,
  ...en_brief,
  ...en_field,
  ...en_sync,
};

export type MessageKey = keyof typeof en;

export const hi: Record<MessageKey, string> = {
  ...hi_common,
  ...hi_nav,
  ...hi_login,
  ...hi_settings,
  ...hi_dashboard,
  ...hi_schools,
  ...hi_visits,
  ...hi_observe,
  ...hi_feedback,
  ...hi_demo,
  ...hi_report,
  ...hi_followups,
  ...hi_library,
  ...hi_publicdata,
  ...hi_help,
  ...hi_errors,
  ...hi_brief,
  ...hi_field,
  ...hi_sync,
};

/** Per-namespace dictionaries, used by tests to detect duplicate keys across namespaces. */
export const BY_NAMESPACE = {
  common: { en: en_common as Record<string, string>, hi: hi_common as Record<string, string> },
  nav: { en: en_nav as Record<string, string>, hi: hi_nav as Record<string, string> },
  login: { en: en_login as Record<string, string>, hi: hi_login as Record<string, string> },
  settings: { en: en_settings as Record<string, string>, hi: hi_settings as Record<string, string> },
  dashboard: { en: en_dashboard as Record<string, string>, hi: hi_dashboard as Record<string, string> },
  schools: { en: en_schools as Record<string, string>, hi: hi_schools as Record<string, string> },
  visits: { en: en_visits as Record<string, string>, hi: hi_visits as Record<string, string> },
  observe: { en: en_observe as Record<string, string>, hi: hi_observe as Record<string, string> },
  feedback: { en: en_feedback as Record<string, string>, hi: hi_feedback as Record<string, string> },
  demo: { en: en_demo as Record<string, string>, hi: hi_demo as Record<string, string> },
  report: { en: en_report as Record<string, string>, hi: hi_report as Record<string, string> },
  followups: { en: en_followups as Record<string, string>, hi: hi_followups as Record<string, string> },
  library: { en: en_library as Record<string, string>, hi: hi_library as Record<string, string> },
  publicdata: { en: en_publicdata as Record<string, string>, hi: hi_publicdata as Record<string, string> },
  help: { en: en_help as Record<string, string>, hi: hi_help as Record<string, string> },
  errors: { en: en_errors as Record<string, string>, hi: hi_errors as Record<string, string> },
  brief: { en: en_brief as Record<string, string>, hi: hi_brief as Record<string, string> },
  field: { en: en_field as Record<string, string>, hi: hi_field as Record<string, string> },
  sync: { en: en_sync as Record<string, string>, hi: hi_sync as Record<string, string> },
};
