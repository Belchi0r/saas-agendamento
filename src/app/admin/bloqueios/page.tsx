import Link from "next/link";
import { redirect } from "next/navigation";

import { getBlockedPeriods } from "@/application/availability/blocked-period-use-cases";
import { toBlockedPeriodListView } from "@/application/availability/blocked-period-view";
import { BlockedPeriodManager } from "@/components/admin/blocked-period-manager";
import { LogoutButton } from "@/components/admin/logout-button";
import { createAdminAvailabilityContext } from "@/infrastructure/composition/availability-context";
import { ApplicationError } from "@/shared/errors/application-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminBlockedPeriodsPage() {
  let pageData: Awaited<ReturnType<typeof loadBlockedPeriods>> | null = null;
  let accessDenied = false;

  try {
    pageData = await loadBlockedPeriods();
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "AUTHENTICATION_REQUIRED") {
      redirect("/admin/login");
    }
    if (error instanceof ApplicationError && error.code === "ADMIN_NOT_AUTHORIZED") {
      accessDenied = true;
    } else {
      throw error;
    }
  }

  if (accessDenied) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12">
        <section>
          <p className="text-sm font-semibold tracking-[0.08em] text-[var(--danger)] uppercase">Acesso negado</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Este usuário não administra o negócio.</h1>
          <p className="mt-4 leading-7 text-[var(--muted)]">Entre com o usuário administrativo correto para continuar.</p>
          <div className="mt-6"><LogoutButton /></div>
        </section>
      </main>
    );
  }
  if (!pageData) throw new Error("Admin blocked periods were not resolved.");

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="border-b border-[var(--border)] pb-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">{pageData.businessName ?? "Área administrativa"}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Bloqueios</h1>
            <p className="mt-3 leading-7 text-[var(--muted)]">Indisponibilize um intervalo concreto sem alterar a semana padrão.</p>
          </div>
          <LogoutButton />
        </div>
        <nav className="mt-6 flex flex-wrap gap-5 text-sm font-semibold" aria-label="Administração">
          <Link className="underline decoration-[var(--border)] underline-offset-4" href="/admin/servicos">Serviços</Link>
          <Link className="underline decoration-[var(--border)] underline-offset-4" href="/admin/horarios">Horários</Link>
          <Link className="underline decoration-[var(--border)] underline-offset-4" href="/admin/datas-especiais">Datas especiais</Link>
          <span aria-current="page">Bloqueios</span>
        </nav>
      </header>
      <BlockedPeriodManager initialBlockedPeriods={pageData.blockedPeriods} />
    </main>
  );
}

async function loadBlockedPeriods() {
  const context = await createAdminAvailabilityContext();
  const snapshot = await getBlockedPeriods(context.blockedPeriods);
  return {
    businessName: context.business.publicName,
    blockedPeriods: toBlockedPeriodListView(snapshot),
  };
}
