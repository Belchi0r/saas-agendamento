import Link from "next/link";
import { redirect } from "next/navigation";

import { getWeeklyAvailability } from "@/application/availability/weekly-availability-use-cases";
import { toWeeklyAvailabilityView } from "@/application/availability/weekly-availability-view";
import { LogoutButton } from "@/components/admin/logout-button";
import { WeeklyAvailabilityManager } from "@/components/admin/weekly-availability-manager";
import { createAdminAvailabilityContext } from "@/infrastructure/composition/availability-context";
import { ApplicationError } from "@/shared/errors/application-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminAvailabilityPage() {
  let pageData: Awaited<ReturnType<typeof loadAvailability>> | null = null;
  let accessDenied = false;

  try {
    pageData = await loadAvailability();
  } catch (error) {
    if (
      error instanceof ApplicationError &&
      error.code === "AUTHENTICATION_REQUIRED"
    ) {
      redirect("/admin/login");
    }

    if (
      error instanceof ApplicationError &&
      error.code === "ADMIN_NOT_AUTHORIZED"
    ) {
      accessDenied = true;
    } else {
      throw error;
    }
  }

  if (accessDenied) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12">
        <section>
          <p className="text-sm font-semibold tracking-[0.08em] text-[var(--danger)] uppercase">
            Acesso negado
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Este usuário não administra o negócio.
          </h1>
          <p className="mt-4 leading-7 text-[var(--muted)]">
            Entre com o usuário administrativo correto para continuar.
          </p>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </section>
      </main>
    );
  }

  if (!pageData) throw new Error("Admin availability context was not resolved.");

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="border-b border-[var(--border)] pb-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">
              {pageData.businessName ?? "Área administrativa"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Horários padrão
            </h1>
            <p className="mt-3 leading-7 text-[var(--muted)]">
              Defina quando o negócio trabalha e onde existem pausas na semana.
            </p>
          </div>
          <LogoutButton />
        </div>
        <nav className="mt-6 flex flex-wrap gap-5 text-sm font-semibold" aria-label="Administração">
          <Link className="underline decoration-[var(--border)] underline-offset-4" href="/admin/servicos">
            Serviços
          </Link>
          <span aria-current="page">Horários</span>
          <Link className="underline decoration-[var(--border)] underline-offset-4" href="/admin/datas-especiais">
            Datas especiais
          </Link>
        </nav>
      </header>

      <WeeklyAvailabilityManager initialAvailability={pageData.availability} />
    </main>
  );
}

async function loadAvailability() {
  const context = await createAdminAvailabilityContext();
  const availability = await getWeeklyAvailability(context.availability);

  return {
    businessName: context.business.publicName,
    availability: toWeeklyAvailabilityView(availability),
  };
}
