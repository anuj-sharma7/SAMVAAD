"use client";

import { FieldProvider, useField } from "@/lib/offline/field-context";
import { useHashRoute } from "@/lib/offline/use-hash-route";
import { useI18n } from "@/lib/i18n/client";
import { FieldChrome } from "./chrome";
import { FieldBlocker } from "./blockers";
import { HomeScreen } from "./screens/home";
import { NewVisitScreen } from "./screens/new-visit";
import { VisitScreen } from "./screens/visit";
import { LocalReportScreen } from "./screens/report";
import { CardsScreen } from "./screens/cards";
import { SyncCenterScreen } from "./screens/sync-center";

/** Maps the URL hash to a screen. Routes: / · /visits/new · /visit/:id · /visit/:id/report · /cards[/:id] · /sync */
function Outlet() {
  const { segments } = useHashRoute();
  const [a, b, c] = segments;
  if (!a) return <HomeScreen />;
  if (a === "visits" && b === "new") return <NewVisitScreen schoolId={c} />;
  if (a === "visit" && b) return c === "report" ? <LocalReportScreen visitId={b} /> : <VisitScreen visitId={b} />;
  if (a === "cards") return <CardsScreen cardId={b} />;
  if (a === "sync") return <SyncCenterScreen />;
  return <HomeScreen />;
}

function Shell() {
  const { phase } = useField();
  const { t } = useI18n();
  if (phase === "loading") {
    return <main id="main" className="grid min-h-screen place-items-center p-6 text-ink-600" aria-busy="true"><p role="status">{t("common.loading")}</p></main>;
  }
  if (phase !== "ready") return <FieldBlocker phase={phase} />;
  return (
    <FieldChrome>
      <Outlet />
    </FieldChrome>
  );
}

export function FieldApp() {
  return (
    <FieldProvider>
      <Shell />
    </FieldProvider>
  );
}
