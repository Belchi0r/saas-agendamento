import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { STATUS_LABELS } from "@/application/agenda/operational-agenda-use-cases";
import { customerIdSchema } from "@/delivery/agenda/operational-input";
import { loadOperationalPageContext } from "@/delivery/admin/operational-page";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const id = customerIdSchema.safeParse((await params).customerId);
  if (!id.success) notFound();
  const context = await loadOperationalPageContext();
  const customer = await context.agenda.findCustomer(id.data);
  if (!customer) notFound();
  const next = customer.appointments.filter((item) => item.status === "CONFIRMED" && item.scheduledStartAt >= new Date()).sort((a,b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime())[0];
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-7 sm:px-8 sm:py-10">
    <AdminPageHeader businessName={context.business.publicName} title={customer.name} active="customers" />
    <p className="mt-5">{customer.whatsapp}</p><a className="mt-2 inline-flex min-h-11 items-center text-[var(--accent)] underline" href={`https://wa.me/${customer.whatsapp.slice(1)}`} target="_blank" rel="noreferrer">Chamar no WhatsApp</a>
    <section className="mt-6"><h2 className="text-lg font-semibold">Próximo agendamento</h2>{next ? <Link className="mt-2 block border-l-4 border-[var(--accent)] pl-4" href={`/admin/agenda/${next.id}`}>{next.serviceName} · {next.localDateSnapshot} às {next.localTimeSnapshot}</Link> : <p className="mt-2 text-[var(--muted)]">Nenhum agendamento futuro.</p>}</section>
    <section className="mt-7"><h2 className="text-lg font-semibold">Histórico</h2><ul className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">{customer.appointments.map((appointment) => <li key={appointment.id}><Link className="block py-4" href={`/admin/agenda/${appointment.id}`}><strong>{appointment.serviceName}</strong><p className="mt-1 text-sm text-[var(--muted)]">{appointment.localDateSnapshot} às {appointment.localTimeSnapshot} · {STATUS_LABELS[appointment.status]}</p></Link></li>)}</ul></section>
  </main>;
}
