import { describe, expect, it } from "vitest";

import {
  applyAuthenticatedCachePolicy,
  AUTHENTICATED_CACHE_CONTROL,
} from "@/delivery/http/cache-policy";

describe("authenticated cache policy", () => {
  it("prevents shared caching and varies on Cookie", () => {
    const headers = applyAuthenticatedCachePolicy(new Headers());

    expect(headers.get("cache-control")).toBe(AUTHENTICATED_CACHE_CONTROL);
    expect(headers.get("vary")).toBe("Cookie");
  });
});
