import { openDatabase, type Db } from "@/lib/db/client";
import { seedDemoData, DEMO_USERS } from "@/lib/db/seed";
import { loadActor } from "@/lib/auth/session";
import type { Actor } from "@/lib/types";

export function freshDb(seed = true): Db {
  const db = openDatabase(":memory:");
  if (seed) seedDemoData(db);
  return db;
}

export function actor(db: Db, id: (typeof DEMO_USERS)[number]["id"]): Actor {
  const a = loadActor(db, id);
  if (!a) throw new Error(`no actor ${id}`);
  return a;
}
export const asha = (db: Db) => actor(db, "demo-mentor-asha");
export const rakesh = (db: Db) => actor(db, "demo-mentor-rakesh");
export const meena = (db: Db) => actor(db, "demo-supervisor-meena");
export const ishaan = (db: Db) => actor(db, "demo-curator-ishaan");
