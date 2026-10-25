import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { SESSION_COOKIE, resolveSession } from "../auth/session";
import { AppError } from "../errors";
import { providerStatus } from "../ai";
import type { Actor, Role } from "../types";

/** The signed-in actor for this request, or null. Cached per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(getDb(), token);
});

/** For pages: redirect to /login when signed out; optionally restrict to roles. */
export async function requireActor(roles?: Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (roles && !roles.includes(actor.role)) redirect("/dashboard");
  return actor;
}

export const db = () => getDb();
export const aiStatus = () => providerStatus();

/** Turn a service-layer AppError into a value pages can render instead of crashing. */
export function safe<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: AppError } {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e };
    throw e;
  }
}
