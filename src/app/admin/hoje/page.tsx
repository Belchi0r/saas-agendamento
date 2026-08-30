import { AppointmentList } from "@/components/admin/appointment-list";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { findNextOperationalAppointment, listOperationalDay, todayInBusinessTimezone } from "@/application/agenda/operational-agenda-use-cases";
import { loadOperationalPageContext } from "@/delivery/admin/operational-page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TodayPage() {
  const context = await loadOperationalPageContext();
  const timezone = context.business.timezone ?? "UTC";
  const today = todayInBusinessTimezone(timezone);
  const appointments = await listOperationalDay(context.agenda, today, timezone);
  const next = findNextOperationalAppointment(appointments);
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-7 sm:px-8 sm:py-10">
      <AdminPageHeader businessName={context.business.publicName} title="Hoje" description={formatLongDate(today)} active="today" />
      <AppointmentList appointments={appointments} nextId={next?.id ?? null} timezone={timezone} />
    </main>
  );
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
