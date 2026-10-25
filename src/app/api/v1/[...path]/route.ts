import "@/lib/api/handlers";
import { dispatch } from "@/lib/api/router";

// All /api/v1/* endpoints are served by one table-driven router (see src/lib/api/handlers.ts),
// which keeps validation, auth, error shape and audit behaviour identical across routes.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return dispatch(req, "/" + path.join("/"));
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
