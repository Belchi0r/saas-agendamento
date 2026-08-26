import type { ServiceView } from "@/application/services/service-view";
import { formatMinorUnits } from "@/shared/money/minor-units";

export function PublicServiceCatalog({
  business,
  services,
}: Readonly<{
  business: Readonly<{
    publicName: string | null;
    publicDescription: string | null;
  }>;
  services: ServiceView[];
}>) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="border-b border-[var(--border)] pb-7">
        <p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">
          {business.publicName ?? "Serviços"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Escolha um serviço
        </h1>
        {business.publicDescription ? (
          <p className="mt-4 max-w-xl leading-7 text-[var(--muted)]">
            {business.publicDescription}
          </p>
        ) : null}
      </header>

      {services.length === 0 ? (
        <section className="py-12" aria-labelledby="empty-title">
          <h2 id="empty-title" className="text-xl font-semibold">
            Nenhum serviço disponível no momento.
          </h2>
          <p className="mt-2 leading-7 text-[var(--muted)]">
            Consulte novamente mais tarde.
          </p>
        </section>
      ) : (
        <ul className="divide-y divide-[var(--border)]" aria-label="Serviços ativos">
          {services.map((service) => (
            <li key={service.id} className="py-7">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <h2 className="text-xl font-semibold leading-7">{service.name}</h2>
                  {service.description ? (
                    <p className="mt-2 leading-6 text-[var(--muted)]">
                      {service.description}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {formatMinorUnits(service.priceMinor, service.currencyCode)}
                </p>
              </div>
              <p className="mt-3 text-sm text-[var(--muted)]">
                {service.durationMinutes} min
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
