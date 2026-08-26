import { ApplicationError } from "@/shared/errors/application-error";

import { applyAuthenticatedCachePolicy } from "./cache-policy";

export function authenticatedJson(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = applyAuthenticatedCachePolicy(new Headers(init.headers));
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), { ...init, headers });
}

export function authenticatedError(error: unknown): Response {
  if (error instanceof ApplicationError) {
    return authenticatedJson(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  return authenticatedJson(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Não foi possível concluir a operação.",
      },
    },
    { status: 500 },
  );
}
