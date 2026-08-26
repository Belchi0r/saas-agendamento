import Link from "next/link";
import { redirect } from "next/navigation";

import { listAdminServices } from "@/application/services/service-use-cases";
import { toServiceView } from "@/application/services/service-view";
import { LogoutButton } from "@/components/admin/logout-button";
import { ServiceManager } from "@/components/admin/service-manager";
import { createAdminServiceContext } from "@/infrastructure/composition/service-context";
import { ApplicationError } from "@/shared/errors/application-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminServicesPage() {
  let pageData: Awaited<ReturnType<typeof loadAdminServices>> | null = null;
  let accessDenied = false;

  try {
    pageData = await loadAdminServices();
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

  if (!pageData) {
    throw new Error("Admin service context was not resolved.");
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="border-b border-[var(--border)] pb-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">
              {pageData.businessName ?? "Área administrativa"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Serviços</h1>
            <p className="mt-3 leading-7 text-[var(--muted)]">
              Cadastre o preço, a duração e quais serviços estão disponíveis.
            </p>
          </div>
          <LogoutButton />
        </div>
        <nav className="mt-6 flex flex-wrap gap-5 text-sm font-semibold" aria-label="Administração">
          <span aria-current="page">Serviços</span>
          <Link className="underline decoration-[var(--border)] underline-offset-4" href="/admin/horarios">
            Horários
          </Link>
          <Link className="underline decoration-[var(--border)] underline-offset-4" href="/admin/datas-especiais">
            Datas especiais
          </Link>
        </nav>
      </header>
      <ServiceManager
        initialServices={pageData.services}
        currencyCode={pageData.currencyCode}
      />
    </main>
  );
}

async function loadAdminServices() {
  const context = await createAdminServiceContext();
  const services = await listAdminServices(context.services);

  return {
    businessName: context.business.publicName,
    currencyCode: context.business.currencyCode,
    services: services.map(toServiceView),
  };
}
