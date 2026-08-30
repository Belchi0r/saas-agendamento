import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AppointmentActions } from "@/components/admin/appointment-actions";
import { STATUS_LABELS } from "@/application/agenda/operational-agenda-use-cases";
import { appointmentIdSchema } from "@/delivery/agenda/operational-input";
import { loadOperationalPageContext } from "@/delivery/admin/operational-page";
import { formatMinorUnits } from "@/shared/money/minor-units";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AppointmentPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const parsed = appointmentIdSchema.safeParse((await params).appointmentId);
  if (!parsed.success) notFound();
  const context = await loadOperationalPageContext();
  const appointment = await context.agenda.findAppointment(parsed.data);
  if (!appointment) notFound();
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-7 sm:px-8 sm:py-10">
      <AdminPageHeader businessName={context.business.publicName} title="Detalhes" active="agenda" />
      <section className="mt-6">
        <p className="text-sm font-semibold text-[var(--accent)]">{STATUS_LABELS[appointment.status]}</p>
        <h2 className="mt-2 text-2xl font-semibold">{appointment.customerName}</h2>
        <a href={`https://wa.me/${appointment.customerWhatsapp.slice(1)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-[var(--accent)] underline underline-offset-4">Chamar no WhatsApp</a>
        <dl className="mt-5 grid gap-4 border-y border-[var(--border)] py-5 sm:grid-cols-2">
          <Item label="WhatsApp" value={appointment.customerWhatsapp} />
          <Item label="Serviço" value={appointment.serviceName} />
          <Item label="Data e hora" value={`${formatDate(appointment.localDateSnapshot)} às ${appointment.localTimeSnapshot}`} />
          <Item label="Duração" value={`${appointment.durationMinutes} min`} />
          <Item label="Preço" value={formatMinorUnits(appointment.priceMinor, appointment.currencyCode)} />
          <Item label="Origem" value={appointment.origin === "ADMIN" ? "Agenda administrativa" : "Agendamento público"} />
        </dl>
        <h2 className="mt-6 text-lg font-semibold">Histórico</h2>
        <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">{appointment.events.map((event, index) => <li key={`${event.occurredAt.toISOString()}-${index}`}>{eventLabel(event.eventType)} · {event.occurredAt.toLocaleString("pt-BR", { timeZone: context.business.timezone ?? "UTC" })}</li>)}</ol>
        {appointment.status === "CONFIRMED" ? <AppointmentActions appointmentId={appointment.id} version={appointment.version} /> : null}
      </section>
    </main>
  );
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function formatDate(value: string) { const [y,m,d] = value.split("-"); return d && m && y ? `${d}/${m}/${y}` : value; }
function eventLabel(value: string) { return ({ CREATED: "Agendamento criado", COMPLETED: "Atendimento concluído", NO_SHOW: "Não compareceu", CANCELLED: "Agendamento cancelado", RESCHEDULED: "Agendamento remarcado" } as Record<string,string>)[value] ?? value; }
