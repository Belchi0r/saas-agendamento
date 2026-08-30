import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { loadOperationalPageContext } from "@/delivery/admin/operational-page";

export const dynamic = "force-dynamic";

const items = [
  ["Serviços", "/admin/servicos", "Preços, duração e disponibilidade"],
  ["Horários", "/admin/horarios", "Jornada semanal e pausas"],
  ["Datas especiais", "/admin/datas-especiais", "Exceções por data"],
  ["Bloqueios", "/admin/bloqueios", "Períodos indisponíveis"],
] as const;

export default async function MenuPage() {
  const context = await loadOperationalPageContext();
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-7 sm:px-8 sm:py-10">
    <AdminPageHeader businessName={context.business.publicName} title="Menu" description="Configurações da agenda." active="menu" />
    <ul className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)]">{items.map(([label, href, description]) => <li key={href}><Link href={href} className="flex min-h-20 items-center justify-between gap-4 py-4"><span><strong>{label}</strong><span className="mt-1 block text-sm text-[var(--muted)]">{description}</span></span><span aria-hidden>→</span></Link></li>)}</ul>
  </main>;
}
