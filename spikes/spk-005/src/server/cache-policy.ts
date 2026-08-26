export const AUTHENTICATED_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  "CDN-Cache-Control": "private, no-store",
  "Vercel-CDN-Cache-Control": "private, no-store",
  Expires: "0",
  Pragma: "no-cache",
  Vary: "Cookie",
} as const;

export function applyAuthenticatedResponseHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(
    AUTHENTICATED_RESPONSE_HEADERS,
  )) {
    headers.set(name, value);
  }
}

