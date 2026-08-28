import { cookies } from "next/headers";
import { getManagedAppointment } from "@/application/booking/public-booking-use-cases";
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
  if (value) { try { appointment = await getManagedAppointment(await createManagementBookingContext(), value, getBookingSecrets()); } catch { appointment = null; } }
  return <main className="mx-auto min-h-screen max-w-xl px-5 py-10 sm:py-16"><p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">Seu agendamento</p>{appointment ? <section><h1 className="mt-3 text-3xl font-semibold">{appointment.status === "CONFIRMED" ? "Confirmado" : appointment.status}</h1><div className="mt-6 rounded-xl bg-[var(--surface)] p-6"><p className="text-2xl font-semibold">{formatDate(appointment.localDate)} às {appointment.localTime}</p><p className="mt-3 font-semibold">{appointment.serviceName}</p><p className="mt-1 text-[var(--muted)]">{appointment.durationMinutes} min · {formatMinorUnits(appointment.priceMinor, appointment.currencyCode)}</p><p className="mt-4 text-sm text-[var(--muted)]">Agendado para {appointment.customerName}.</p></div><p className="mt-5 text-sm leading-6 text-[var(--muted)]">Cancelamento e remarcação ainda não estão disponíveis neste canal.</p></section> : <section><h1 className="mt-3 text-3xl font-semibold">Abrindo seu agendamento</h1><ManagementBootstrap /></section>}</main>;
}
function formatDate(value: string) { const [year, month, day] = value.split("-"); return day && month && year ? `${day}/${month}/${year}` : value; }
