import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers and a per-request, nonce-based Content Security Policy for every page.
 *
 * Deliberate trade-offs (documented in docs/SECURITY_REVIEW.md):
 *  - scripts: nonce + 'strict-dynamic', no 'unsafe-inline'. 'unsafe-eval' only in `next dev` (React needs it there).
 *  - styles: nonce for <style>/<link>; inline style ATTRIBUTES (used by the bar charts) are allowed via style-src-attr only.
 *  - upgrade-insecure-requests and HSTS are enabled only when SAMVAAD_HTTPS=true, because they would break plain-http localhost.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const https = process.env.SAMVAAD_HTTPS === "true";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  response.headers.set("cross-origin-opener-policy", "same-origin");
  response.headers.set("cross-origin-resource-policy", "same-origin");
  if (https) response.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  return response;
}

export const config = {
  // Pages only: static assets need no CSP, and /api/v1 sets its own headers in the router.
  matcher: [{ source: "/((?!api/|_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
