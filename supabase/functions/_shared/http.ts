const allowedOrigins = new Set([
  "https://8860-pa.github.io",
  "http://127.0.0.1:8765",
  "http://localhost:8765"
]);

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && allowedOrigins.has(origin);
}

function responseHeaders(request: Request): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  });
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
}

export function preflightResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: responseHeaders(request) });
}
