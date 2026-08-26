import { describe, expect, it } from "vitest";

import { assertTrustedMutationRequest } from "@/delivery/http/request-security";

function request(method: string, origin?: string, host?: string) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (host) headers.set("host", host);
  return { method, headers };
}

describe("sensitive mutation request guard", () => {
  it("accepts a mutation only when method, Origin and Host match", () => {
    expect(() =>
      assertTrustedMutationRequest(
        request("POST", "https://agenda.example.com", "agenda.example.com"),
        "https://agenda.example.com",
      ),
    ).not.toThrow();
  });

  it.each([
    ["GET", "https://agenda.example.com", "agenda.example.com", 405],
    ["POST", undefined, "agenda.example.com", 403],
    ["POST", "https://evil.example", "agenda.example.com", 403],
    ["POST", "https://agenda.example.com", "evil.example", 403],
  ])(
    "rejects method/origin/host mismatch (%s, %s, %s)",
    (method, origin, host, status) => {
      expect(() =>
        assertTrustedMutationRequest(
          request(method, origin, host),
          "https://agenda.example.com",
        ),
      ).toThrow(expect.objectContaining({ status }));
    },
  );
});
