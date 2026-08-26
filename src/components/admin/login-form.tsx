"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type ErrorBody = Readonly<{
  error?: Readonly<{ message?: string }>;
}>;

export function LoginForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const body = (await response.json()) as ErrorBody;

      if (!response.ok) {
        setError(body.error?.message ?? "Não foi possível entrar.");
        return;
      }

      router.replace("/admin/servicos");
      router.refresh();
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
      <div>
        <label className="block text-sm font-semibold" htmlFor="email">
          E-mail
        </label>
        <input
          className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-semibold" htmlFor="password">
          Senha
        </label>
        <input
          className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? (
        <p className="text-sm leading-6 text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-md bg-[var(--accent)] px-5 py-3 font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70"
        type="submit"
        disabled={submitting}
      >
        {submitting ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
