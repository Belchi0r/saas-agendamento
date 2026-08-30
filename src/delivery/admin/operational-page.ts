import "server-only";

import { redirect } from "next/navigation";
import { createOperationalAgendaContext } from "@/infrastructure/composition/operational-agenda-context";
import { ApplicationError } from "@/shared/errors/application-error";

export async function loadOperationalPageContext() {
  try { return await createOperationalAgendaContext(); }
  catch (error) {
    if (error instanceof ApplicationError && error.code === "AUTHENTICATION_REQUIRED") redirect("/admin/login");
    throw error;
  }
}
