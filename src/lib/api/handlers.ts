import { z } from "zod";
import { LIMITS } from "../security/rate-limit";
import { route, publicRoute, type Ctx } from "./router";
import { get } from "../db/client";
import { AppError } from "../errors";
import { SESSION_COOKIE, SESSION_TTL_MS, demoSignIn, demoModeEnabled, revokeSession } from "../auth/session";
import { DEMO_USERS } from "../db/seed";
import { providerStatus } from "../ai";
import { audit, listAudit } from "../services/audit";
import { getDashboard, getPriorities, practiceGaps } from "../services/dashboard";
import { assignMentor, createSchool, getSchool, listSchools, schoolExtras } from "../services/schools";
import { createVisit, getVisitDetail, listVisits, transitionVisit, updateVisit, visitProgress } from "../services/visits";
import { addObservation, decideTags, deleteObservation, listObservations, updateObservation } from "../services/observations";
import { approveFeedback, editFeedback, generateFeedback, getCurrentFeedback, listFeedbackHistory, rejectFeedback } from "../services/feedback";
import { approveDemonstration, editDemonstration, generateDemonstration, getCurrentDemonstration } from "../services/demonstrations";
import { createCommitment, getCommitment, listCommitments, reviewCommitment, suggestCommitment, updateCommitment } from "../services/commitments";
import { editReport, exportVisitsCsv, finalizeReport, generateReport, getReport, listReports } from "../services/reports";
import { createCard, getCard, getChunk, listCards, reviewCard, reviewChunk, reviseCard } from "../services/practice-cards";
import { getPriorityRules, setPriorityRules, updatePreferences } from "../services/settings";
import { LOCALES, LOCALE_COOKIE } from "../i18n/config";
import { getActionSummary, getPreVisitBrief } from "../services/brief";
import { withIdempotency } from "../services/idempotency";
import { freshness, getIndicatorDef, getSource, listIndicatorDefs, listSources, periodsFor, sourceQuality, stateSnapshot, statesWithData, valuesFor } from "../services/public-context";
import type { VisitStatus } from "../types";

const q = (c: Ctx) => Object.fromEntries(c.query.entries());

// ---- meta / session ---------------------------------------------------------------------------
publicRoute("GET", "/health", ({ db }) => {
  get(db, "SELECT 1 AS ok");
  return { status: "ok", time: new Date().toISOString(), demo_mode: demoModeEnabled(), ai: providerStatus() };
});
publicRoute("GET", "/ready", ({ db }) => {
  const ok = get<{ ok: number }>(db, "SELECT 1 AS ok")?.ok === 1;
  if (!ok) throw new AppError(503, "db_unavailable", "Database is not ready");
  return { ready: true };
});
publicRoute("GET", "/session/personas", () => (demoModeEnabled() ? DEMO_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, designation: u.designation })) : []));
publicRoute("POST", "/session", async (c) => {
  const body = z.object({ profile_id: z.string().min(1) }).parse(await c.json());
  const { actor, token } = demoSignIn(c.db, body.profile_id);
  c.setCookie(SESSION_COOKIE, token, { maxAge: Math.floor(SESSION_TTL_MS / 1000) });
  audit(c.db, actor, "session.sign_in", "profile", actor.id, { demo: true });
  return { actor };
}, 200, LIMITS.signIn);
publicRoute("DELETE", "/session", (c) => {
  revokeSession(c.db, c.cookie(SESSION_COOKIE)); // invalidated on the server, not only cleared in the browser
  c.setCookie(SESSION_COOKIE, "", { maxAge: 0 });
  return { signed_out: true };
});
// Interface language: a cookie works before sign-in too; when signed in it is also remembered on the profile.
publicRoute("PUT", "/locale", async (c) => {
  const { locale } = z.object({ locale: z.enum(LOCALES) }).parse(await c.json());
  c.setCookie(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365 });
  if (c.actor) updatePreferences(c.db, c.actor, { ui_language: locale });
  return { locale };
});
route("PATCH", "/me", async (c) => updatePreferences(c.db, c.actor, await c.json()));
route("GET", "/me", (c) => ({ actor: c.actor, ai: providerStatus(), demo_mode: demoModeEnabled() }));

// ---- dashboard / planning ----------------------------------------------------------------------
route("GET", "/dashboard", (c) => getDashboard(c.db, c.actor));
route("GET", "/priorities", (c) => getPriorities(c.db, c.actor));
route("GET", "/analytics/practice-gaps", (c) => practiceGaps(c.db, c.actor));
route("GET", "/settings/priority-rules", (c) => getPriorityRules(c.db));
route("PUT", "/settings/priority-rules", async (c) => setPriorityRules(c.db, c.actor, await c.json()));
route("GET", "/audit", (c) => listAudit(c.db, c.actor, { resourceType: c.query.get("resource_type") ?? undefined, resourceId: c.query.get("resource_id") ?? undefined, limit: z.coerce.number().int().min(1).max(500).catch(100).parse(c.query.get("limit") ?? 100) }));

// ---- schools -----------------------------------------------------------------------------------
route("GET", "/schools", (c) => listSchools(c.db, c.actor, q(c)));
route("POST", "/schools", async (c) => createSchool(c.db, c.actor, await c.json()), 201);
route("GET", "/schools/:id", (c) => {
  const school = getSchool(c.db, c.actor, c.params.id);
  return { school, ...schoolExtras(c.db, c.actor, school.id) };
});
route("POST", "/schools/:id/assignments", async (c) => {
  const { mentor_id } = z.object({ mentor_id: z.string().min(1) }).parse(await c.json());
  assignMentor(c.db, c.actor, c.params.id, mentor_id);
  return { assigned: true };
}, 201);

// ---- visits ------------------------------------------------------------------------------------
route("GET", "/visits", (c) => listVisits(c.db, c.actor, q(c)));
route("POST", "/visits", async (c) => {
  const body = await c.json();
  // A repeated submit with the same Idempotency-Key returns the first result instead of creating a second visit.
  return (await withIdempotency(c.db, c.actor, "visit:create", c.idempotencyKey, async () => createVisit(c.db, c.actor, body))).value;
}, 201);
route("GET", "/visits/:id", (c) => {
  const detail = getVisitDetail(c.db, c.actor, c.params.id);
  return { ...detail, progress: visitProgress(c.db, detail.visit) };
});
route("PATCH", "/visits/:id", async (c) => updateVisit(c.db, c.actor, c.params.id, await c.json()));
route("POST", "/visits/:id/transition", async (c) => {
  const { to } = z.object({ to: z.enum(["draft", "planned", "in_progress", "pending_review", "completed"]) }).parse(await c.json());
  return transitionVisit(c.db, c.actor, c.params.id, to as VisitStatus);
});

// ---- observations ------------------------------------------------------------------------------
route("GET", "/visits/:id/observations", (c) => listObservations(c.db, c.actor, c.params.id));
route("POST", "/visits/:id/observations", async (c) => {
  const body = await c.json();
  return (await withIdempotency(c.db, c.actor, `observation:${c.params.id}`, c.idempotencyKey, async () => addObservation(c.db, c.actor, c.params.id, body))).value;
}, 201);
route("PATCH", "/observations/:id", async (c) => updateObservation(c.db, c.actor, c.params.id, await c.json()));
route("DELETE", "/observations/:id", (c) => { deleteObservation(c.db, c.actor, c.params.id); return { deleted: true }; });
route("POST", "/observations/:id/tags", async (c) => decideTags(c.db, c.actor, c.params.id, await c.json()));

// ---- feedback (E3) -----------------------------------------------------------------------------
route("GET", "/visits/:id/feedback", (c) => ({
  current: getCurrentFeedback(c.db, c.actor, c.params.id),
  history: listFeedbackHistory(c.db, c.actor, c.params.id),
  provider: providerStatus(),
}));
route("POST", "/visits/:id/feedback", async (c) => {
  const body = await c.json();
  const { value } = await withIdempotency(c.db, c.actor, `feedback:${c.params.id}`, c.idempotencyKey, () => generateFeedback(c.db, c.actor, c.params.id, body));
  return value;
}, 201, LIMITS.ai);
route("PATCH", "/feedback/:id", async (c) => editFeedback(c.db, c.actor, c.params.id, await c.json()));
route("POST", "/feedback/:id/approve", (c) => approveFeedback(c.db, c.actor, c.params.id));
route("POST", "/feedback/:id/reject", async (c) => rejectFeedback(c.db, c.actor, c.params.id, await c.json()));

// ---- demonstration (E4) ------------------------------------------------------------------------
route("GET", "/visits/:id/demonstration", (c) => ({ current: getCurrentDemonstration(c.db, c.actor, c.params.id), provider: providerStatus() }));
route("POST", "/visits/:id/demonstration", async (c) => {
  const body = await c.json();
  const { value } = await withIdempotency(c.db, c.actor, `demo:${c.params.id}`, c.idempotencyKey, () => generateDemonstration(c.db, c.actor, c.params.id, body));
  return value;
}, 201, LIMITS.ai);
route("PATCH", "/demonstrations/:id", async (c) => editDemonstration(c.db, c.actor, c.params.id, await c.json()));
route("POST", "/demonstrations/:id/approve", (c) => approveDemonstration(c.db, c.actor, c.params.id));

// ---- follow-up (E5) ----------------------------------------------------------------------------
route("GET", "/visits/:id/brief", (c) => getPreVisitBrief(c.db, c.actor, c.params.id));
route("GET", "/visits/:id/action-summary", (c) => getActionSummary(c.db, c.actor, c.params.id));
route("GET", "/visits/:id/commitment-suggestion", (c) => suggestCommitment(c.db, c.actor, c.params.id));
route("GET", "/commitments", (c) => listCommitments(c.db, c.actor, q(c)));
route("POST", "/commitments", async (c) => createCommitment(c.db, c.actor, await c.json()), 201);
route("GET", "/commitments/:id", (c) => getCommitment(c.db, c.actor, c.params.id));
route("PATCH", "/commitments/:id", async (c) => updateCommitment(c.db, c.actor, c.params.id, await c.json()));
route("POST", "/commitments/:id/review", async (c) => reviewCommitment(c.db, c.actor, c.params.id, await c.json()));

// ---- reports -----------------------------------------------------------------------------------
route("GET", "/reports", (c) => listReports(c.db, c.actor, { status: c.query.get("status") ?? undefined }));
route("GET", "/reports/export", (c) => new Response(exportVisitsCsv(c.db, c.actor), {
  headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="samvaad-visits.csv"', "cache-control": "no-store" },
}), 200, LIMITS.export);
route("GET", "/visits/:id/report", (c) => ({ report: getReport(c.db, c.actor, c.params.id) }));
route("POST", "/visits/:id/report", (c) => generateReport(c.db, c.actor, c.params.id), 201);
route("PATCH", "/visits/:id/report", async (c) => editReport(c.db, c.actor, c.params.id, await c.json()));
route("POST", "/visits/:id/report/finalize", (c) => finalizeReport(c.db, c.actor, c.params.id));

// ---- practice library --------------------------------------------------------------------------
route("GET", "/practice-cards", (c) => listCards(c.db, c.actor, q(c)));
route("POST", "/practice-cards", async (c) => createCard(c.db, c.actor, await c.json()), 201);
route("GET", "/practice-cards/:id", (c) => getCard(c.db, c.actor, c.params.id));
route("PATCH", "/practice-cards/:id", async (c) => reviseCard(c.db, c.actor, c.params.id, await c.json()));
route("POST", "/practice-cards/:id/review", async (c) => reviewCard(c.db, c.actor, c.params.id, await c.json()));

// ---- public education context (REAL aggregate statistics; readable by every role, never linked to visits) --------
route("GET", "/public/sources", (c) => ({ sources: listSources(c.db), freshness: freshness(c.db), quality: sourceQuality(c.db) }));
route("GET", "/public/sources/:id", (c) => getSource(c.db, c.params.id));
route("GET", "/public/indicators", (c) => ({ indicators: listIndicatorDefs(c.db), states: statesWithData(c.db) }));
route("GET", "/public/values", (c) => {
  const q = z.object({
    indicator: z.string().min(1),
    level: z.enum(["national", "state", "division", "district"]).optional(),
    state: z.string().optional(),
    period: z.string().optional(),
  }).parse(Object.fromEntries(c.query.entries()));
  return { indicator: getIndicatorDef(c.db, q.indicator), periods: periodsFor(c.db, q.indicator), values: valuesFor(c.db, q.indicator, { level: q.level, state: q.state, period: q.period }) };
});
route("GET", "/public/snapshot", (c) => stateSnapshot(c.db, z.string().min(2).parse(c.query.get("state"))));
route("GET", "/public/freshness", (c) => freshness(c.db));

// ---- knowledge base: source excerpts (curators only) -------------------------------------------------------------------
route("GET", "/knowledge/chunks/:id", (c) => getChunk(c.db, c.actor, c.params.id));
route("POST", "/knowledge/chunks/:id/review", async (c) => reviewChunk(c.db, c.actor, c.params.id, await c.json()));
