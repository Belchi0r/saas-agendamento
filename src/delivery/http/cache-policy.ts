export const AUTHENTICATED_CACHE_CONTROL =
  "private, no-store, max-age=0, must-revalidate";

export function applyAuthenticatedCachePolicy(headers: Headers): Headers {
  headers.set("Cache-Control", AUTHENTICATED_CACHE_CONTROL);
  headers.set("Vary", "Cookie");
  return headers;
}
