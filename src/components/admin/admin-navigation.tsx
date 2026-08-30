import Link from "next/link";

const ITEMS = [
  { key: "today", href: "/admin/hoje", label: "Hoje" },
  { key: "agenda", href: "/admin/agenda", label: "Agenda" },
  { key: "customers", href: "/admin/clientes", label: "Clientes" },
  { key: "menu", href: "/admin/menu", label: "Menu" },
] as const;

export type AdminNavigationKey = (typeof ITEMS)[number]["key"] | "services" | "weekly" | "special-dates" | "blocks";

export function AdminNavigation({
  active,
}: Readonly<{ active: AdminNavigationKey }>) {
  return (
    <nav
      className="mt-6"
      aria-label="Administração"
    >
      <ul className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:gap-2">
        {ITEMS.map((item) => {
          const current = item.key === active || (item.key === "menu" && ["services", "weekly", "special-dates", "blocks"].includes(active));
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center rounded-md border px-2 text-center text-xs font-semibold sm:px-4 sm:text-sm ${
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
