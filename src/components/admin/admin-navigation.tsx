import Link from "next/link";

const ITEMS = [
  { key: "services", href: "/admin/servicos", label: "Serviços" },
  { key: "weekly", href: "/admin/horarios", label: "Horários" },
  { key: "special-dates", href: "/admin/datas-especiais", label: "Datas especiais" },
  { key: "blocks", href: "/admin/bloqueios", label: "Bloqueios" },
] as const;

export type AdminNavigationKey = (typeof ITEMS)[number]["key"];

export function AdminNavigation({
  active,
}: Readonly<{ active: AdminNavigationKey }>) {
  return (
    <nav
      className="mt-6"
      aria-label="Administração"
    >
      <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {ITEMS.map((item) => {
          const current = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center rounded-md border px-3 text-center text-sm font-semibold sm:px-4 ${
                  current
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-transparent underline decoration-[var(--border)] underline-offset-4"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
