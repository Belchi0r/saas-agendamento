"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AppointmentActions({ appointmentId, version }: Readonly<{ appointmentId: string; version: number }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function transition(action: "complete" | "no-show" | "cancel") {
    const labels = { complete: "concluir", "no-show": "marcar como não compareceu", cancel: "cancelar" };
    if (!window.confirm(`Confirmar: ${labels[action]} este agendamento?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/appointments/${appointmentId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedVersion: version }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Não foi possível atualizar o agendamento.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o agendamento."); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-7 border-t border-[var(--border)] pt-6">
      <h2 className="text-lg font-semibold">Atualizar atendimento</h2>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button disabled={busy} onClick={() => void transition("complete")} className="min-h-12 rounded-md bg-[var(--accent)] px-4 font-semibold text-white disabled:opacity-60">Concluir</button>
        <button disabled={busy} onClick={() => void transition("no-show")} className="min-h-12 rounded-md border border-[var(--border)] px-4 font-semibold disabled:opacity-60">Não compareceu</button>
        <button disabled={busy} onClick={() => void transition("cancel")} className="min-h-12 rounded-md border border-[var(--danger)] px-4 font-semibold text-[var(--danger)] disabled:opacity-60">Cancelar</button>
      </div>
    </section>
  );
}
