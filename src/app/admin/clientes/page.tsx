import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { loadOperationalPageContext } from "@/delivery/admin/operational-page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await loadOperationalPageContext();
  const query = ((await searchParams).q ?? "").trim().slice(0, 120);
  const customers = await context.agenda.listCustomers(query);
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-7 sm:px-8 sm:py-10">
    <AdminPageHeader businessName={context.business.publicName} title="Clientes" description="Cada cadastro permanece separado, mesmo com WhatsApp repetido." active="customers" />
    <form className="mt-6 flex gap-2"><label className="sr-only" htmlFor="customer-search">Buscar por nome ou WhatsApp</label><input id="customer-search" name="q" defaultValue={query} placeholder="Nome ou WhatsApp" className="min-h-12 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-4"/><button className="min-h-12 rounded-md bg-[var(--accent)] px-4 font-semibold text-white">Buscar</button></form>
    {customers.length === 0 ? <p className="mt-6 text-[var(--muted)]">Nenhum cliente encontrado.</p> : <ul className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)]">{customers.map((customer) => <li key={customer.id}><Link href={`/admin/clientes/${customer.id}`} className="block py-4"><strong>{customer.name}</strong><p className="mt-1 text-sm text-[var(--muted)]">{customer.whatsapp}</p>{customer.nextAppointment ? <p className="mt-2 text-sm">Próximo: {customer.nextAppointment.serviceName} · {customer.nextAppointment.scheduledStartAt.toLocaleString("pt-BR", { timeZone: context.business.timezone ?? "UTC" })}</p> : <p className="mt-2 text-sm text-[var(--muted)]">Sem próximo agendamento</p>}</Link></li>)}</ul>}
  </main>;
}
