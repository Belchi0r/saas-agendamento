import Link from "next/link";
import type { OperationalAppointment } from "@/application/agenda/operational-agenda-repository";
import { STATUS_LABELS } from "@/application/agenda/operational-agenda-use-cases";

export function AppointmentList({ appointments, nextId, timezone }: Readonly<{
  appointments: readonly OperationalAppointment[];
  nextId?: string | null;
  timezone?: string;
}>) {
  if (appointments.length === 0) {
    return <p className="mt-6 bg-[var(--surface)] p-5 text-[var(--muted)]">Nenhum agendamento neste dia.</p>;
  }
  return (
    <ol className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {appointments.map((appointment) => (
        <li key={appointment.id}>
          <Link href={`/admin/agenda/${appointment.id}`} className={`block py-5 ${appointment.id === nextId ? "border-l-4 border-[var(--accent)] pl-4" : "pl-1"}`}>
            {appointment.id === nextId ? <p className="mb-1 text-xs font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">Próximo</p> : null}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xl font-semibold tabular-nums">{formatTime(appointment.scheduledStartAt, timezone ?? appointment.timezoneSnapshot)}</p>
                <p className="mt-1 font-semibold">{appointment.customerName}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{appointment.serviceName} · {appointment.durationMinutes} min</p>
              </div>
              <p className="text-right text-sm font-semibold">{STATUS_LABELS[appointment.status]}</p>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function formatTime(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(value);
}
