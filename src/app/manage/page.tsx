import Link from "next/link";
import { cookies } from "next/headers";

import { getManagedAppointment } from "@/application/booking/public-booking-use-cases";
import { formatBrazilianWhatsapp } from "@/components/public/brazilian-whatsapp";
import { ManagementBootstrap } from "@/components/public/management-bootstrap";
import { createManagementBookingContext } from "@/infrastructure/composition/public-booking-context";
import { getBookingSecrets } from "@/infrastructure/config/server-env";
import { CAPABILITY_COOKIE_NAME } from "@/infrastructure/security/booking-secrets";
import { formatMinorUnits } from "@/shared/money/minor-units";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ManageAppointmentPage() {
  const value = (await cookies()).get(CAPABILITY_COOKIE_NAME)?.value;
  let appointment = null;

  if (value) {
    try {
      appointment = await getManagedAppointment(
        await createManagementBookingContext(),
        value,
        getBookingSecrets(),
      );
    } catch {
      appointment = null;
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-10 sm:py-16">
      <p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">
        Seu agendamento
      </p>
      {appointment ? (
        <section>
          <h1 className="mt-3 text-3xl font-semibold">Confirmado</h1>
          <p className="mt-2 leading-7 text-[var(--muted)]">
            Confira abaixo os dados que ficaram registrados.
          </p>
          <div className="mt-6 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-6">
            <p className="text-2xl font-semibold">
              {formatDate(appointment.localDate)} às {appointment.localTime}
            </p>
            <p className="mt-4 font-semibold">{appointment.serviceName}</p>
            <p className="mt-1 text-[var(--muted)]">
              {appointment.durationMinutes} min · {formatMinorUnits(
                appointment.priceMinor,
                appointment.currencyCode,
              )}
            </p>
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <p className="text-xs font-semibold tracking-[0.08em] text-[var(--muted)] uppercase">
                Cliente
              </p>
              <p className="mt-1 font-semibold">{appointment.customerName}</p>
              {appointment.customerWhatsapp ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatBrazilianWhatsapp(appointment.customerWhatsapp)}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-5 border border-[var(--border)] p-4">
            <p className="font-semibold">Gerenciamento somente para consulta</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Cancelamento e remarcação ainda não estão disponíveis neste canal.
            </p>
          </div>
          <Link
            href="/"
            className="mt-6 flex min-h-12 items-center justify-center rounded-lg border border-[var(--border)] px-5 font-semibold"
          >
            Voltar ao início
          </Link>
        </section>
      ) : (
        <section>
          <h1 className="mt-3 text-3xl font-semibold">
            Abrindo seu agendamento
          </h1>
          <ManagementBootstrap />
        </section>
      )}
    </main>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}/${month}/${year}` : value;
}
