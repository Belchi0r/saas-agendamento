import Link from "next/link";
import { AppointmentList } from "@/components/admin/appointment-list";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { listOperationalDay, todayInBusinessTimezone } from "@/application/agenda/operational-agenda-use-cases";
import { loadOperationalPageContext } from "@/delivery/admin/operational-page";
import { Temporal } from "@/infrastructure/time/temporal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const context = await loadOperationalPageContext();
  const timezone = context.business.timezone ?? "UTC";
  const today = todayInBusinessTimezone(timezone);
  const requested = (await searchParams).date ?? today;
  let date: Temporal.PlainDate;
  try { date = Temporal.PlainDate.from(requested); } catch { date = Temporal.PlainDate.from(today); }
  const localDate = date.toString();
  const appointments = await listOperationalDay(context.agenda, localDate, timezone);
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-7 sm:px-8 sm:py-10">
      <AdminPageHeader businessName={context.business.publicName} title="Agenda" description="Atendimentos do dia, em ordem de horário." active="agenda" />
      <div className="mt-6 flex items-center justify-between gap-2">
        <Link aria-label="Dia anterior" className="min-h-11 rounded-md border border-[var(--border)] px-4 py-2" href={`/admin/agenda?date=${date.subtract({ days: 1 })}`}>←</Link>
        <div className="text-center"><p className="font-semibold">{formatDate(localDate)}</p>{localDate !== today ? <Link className="text-sm text-[var(--accent)] underline" href={`/admin/agenda?date=${today}`}>Voltar para hoje</Link> : <p className="text-sm text-[var(--muted)]">Hoje</p>}</div>
        <Link aria-label="Próximo dia" className="min-h-11 rounded-md border border-[var(--border)] px-4 py-2" href={`/admin/agenda?date=${date.add({ days: 1 })}`}>→</Link>
      </div>
      <Link href="/admin/agenda/novo" className="mt-6 flex min-h-12 items-center justify-center rounded-md bg-[var(--accent)] px-5 font-semibold text-white">Novo agendamento</Link>
      <AppointmentList appointments={appointments} timezone={timezone} />
    </main>
  );
}

function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
