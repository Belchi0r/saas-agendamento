import { AdminNavigation, type AdminNavigationKey } from "./admin-navigation";
import { LogoutButton } from "./logout-button";

export function AdminPageHeader({ businessName, title, description, active }: Readonly<{
  businessName: string | null;
  title: string;
  description?: string;
  active: AdminNavigationKey;
}>) {
  return (
    <header className="border-b border-[var(--border)] pb-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">{businessName ?? "Área administrativa"}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-2 leading-6 text-[var(--muted)]">{description}</p> : null}
        </div>
        <LogoutButton />
      </div>
      <AdminNavigation active={active} />
    </header>
  );
}
