import { listPublicServices } from "@/application/services/service-use-cases";
import { toServiceView } from "@/application/services/service-view";
import { PublicServiceCatalog } from "@/components/public/service-catalog";
import { createPublicServiceContext } from "@/infrastructure/composition/service-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PublicServicesPage() {
  let pageData: Awaited<ReturnType<typeof loadPublicServices>> | null = null;

  try {
    pageData = await loadPublicServices();
  } catch {
    pageData = null;
  }

  if (!pageData) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12">
        <section>
          <p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">
            Serviços
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Página indisponível no momento.
          </h1>
          <p className="mt-4 leading-7 text-[var(--muted)]">
            Tente novamente mais tarde.
          </p>
        </section>
      </main>
    );
  }

  return (
    <PublicServiceCatalog
      business={pageData.business}
      services={pageData.services.map(toServiceView)}
    />
  );
}

async function loadPublicServices() {
  const context = await createPublicServiceContext();
  return {
    business: context.business,
    services: await listPublicServices(context.services),
  };
}
