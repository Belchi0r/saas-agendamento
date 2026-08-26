import { ApplicationError } from "@/shared/errors/application-error";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type MutationRequest = Pick<Request, "headers" | "method">;

export function assertTrustedMutationRequest(
  request: MutationRequest,
  expectedOrigin: string,
): void {
  if (!MUTATION_METHODS.has(request.method.toUpperCase())) {
    throw new ApplicationError(
      "METHOD_NOT_ALLOWED",
      "Método não permitido.",
      405,
    );
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    throw new ApplicationError(
      "UNTRUSTED_REQUEST_ORIGIN",
      "Origem da requisição não reconhecida.",
      403,
    );
  }

  let actualOrigin: URL;
  let trustedOrigin: URL;

  try {
    actualOrigin = new URL(origin);
    trustedOrigin = new URL(expectedOrigin);
  } catch {
    throw new ApplicationError(
      "UNTRUSTED_REQUEST_ORIGIN",
      "Origem da requisição não reconhecida.",
      403,
    );
  }

  if (actualOrigin.origin !== trustedOrigin.origin || host !== trustedOrigin.host) {
    throw new ApplicationError(
      "UNTRUSTED_REQUEST_ORIGIN",
      "Origem da requisição não reconhecida.",
      403,
    );
  }
}
