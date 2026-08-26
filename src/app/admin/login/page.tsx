import { LoginForm } from "@/components/admin/login-form";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-5 py-12">
      <section className="w-full">
        <p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">
          Área administrativa
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Entrar</h1>
        <p className="mt-3 leading-7 text-[var(--muted)]">
          Use seu e-mail e senha para gerenciar os serviços.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
