"use client";

import { useState, type FormEvent } from "react";

import type {
  BlockedPeriodListView,
  BlockedPeriodView,
} from "@/application/availability/blocked-period-view";

type Editor = Readonly<{
  mode: "create" | "edit";
  id?: string;
  expectedVersion?: number;
  localDate: string;
  startLocalTime: string;
  endLocalTime: string;
  privateReason: string;
}>;

type BlockedPeriodResponse = Readonly<{
  blockedPeriods?: BlockedPeriodListView;
  error?: Readonly<{ message?: string }>;
}>;

function sortView(view: BlockedPeriodListView): BlockedPeriodListView {
  return {
    ...view,
    blockedPeriods: [...view.blockedPeriods].sort(
      (left, right) =>
        left.localDate.localeCompare(right.localDate) ||
        left.startLocalTime.localeCompare(right.startLocalTime) ||
        left.id.localeCompare(right.id),
    ),
  };
}

export function BlockedPeriodManager({
  initialBlockedPeriods,
}: Readonly<{ initialBlockedPeriods: BlockedPeriodListView }>) {
  const [view, setView] = useState(() => sortView(initialBlockedPeriods));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function beginCreate() {
    setEditor({
      mode: "create",
      localDate: "",
      startLocalTime: "",
      endLocalTime: "",
      privateReason: "",
    });
    setError(null);
  }

  function beginEdit(blockedPeriod: BlockedPeriodView) {
    setEditor({
      mode: "edit",
      id: blockedPeriod.id,
      expectedVersion: blockedPeriod.version,
      localDate: blockedPeriod.localDate,
      startLocalTime: blockedPeriod.startLocalTime,
      endLocalTime: blockedPeriod.endLocalTime,
      privateReason: blockedPeriod.privateReason ?? "",
    });
    setError(null);
  }

  async function request(
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
  ): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as BlockedPeriodResponse;
      if (!response.ok || !payload.blockedPeriods) {
        setError(payload.error?.message ?? "Não foi possível salvar o bloqueio.");
        return false;
      }
      setView(sortView(payload.blockedPeriods));
      return true;
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    if (
      editor.localDate === "" ||
      editor.startLocalTime === "" ||
      editor.endLocalTime === "" ||
      editor.startLocalTime >= editor.endLocalTime
    ) {
      setError("O início do bloqueio deve ser anterior ao final.");
      return;
    }

    const saved = await request(
      editor.mode === "create"
        ? "/api/admin/availability/blocked-periods"
        : `/api/admin/availability/blocked-periods/${editor.id}`,
      editor.mode === "create" ? "POST" : "PATCH",
      {
        ...(editor.mode === "edit"
          ? { action: "update", expectedVersion: editor.expectedVersion }
          : {}),
        localDate: editor.localDate,
        startLocalTime: editor.startLocalTime,
        endLocalTime: editor.endLocalTime,
        privateReason: editor.privateReason.trim() || null,
        expectedAvailabilityVersion: view.availabilityVersion,
      },
    );
    if (saved) setEditor(null);
  }

  async function remove(blockedPeriod: BlockedPeriodView) {
    if (!window.confirm("Liberar este período bloqueado?")) return;
    const removed = await request(
      `/api/admin/availability/blocked-periods/${blockedPeriod.id}`,
      "DELETE",
      {
        expectedVersion: blockedPeriod.version,
        expectedAvailabilityVersion: view.availabilityVersion,
      },
    );
    if (removed && editor?.id === blockedPeriod.id) setEditor(null);
  }

  return (
    <div className="mt-8">
      <section className="border-b border-[var(--border)] pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Períodos pontuais</h2>
            <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
              Os horários são interpretados em {view.timezone ?? "timezone ainda não configurado"} e persistidos como instantes UTC.
            </p>
          </div>
          <button className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white" type="button" onClick={beginCreate}>
            Bloquear período
          </button>
        </div>
      </section>

      {error ? (
        <p className="border-b border-[var(--border)] py-4 text-sm text-[var(--danger)]" role="alert">{error}</p>
      ) : null}

      {editor ? (
        <form className="border-b border-[var(--border)] py-6" onSubmit={save}>
          <h2 className="text-lg font-semibold">{editor.mode === "create" ? "Novo bloqueio" : "Editar bloqueio"}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-semibold">
              Data
              <input className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5 font-normal" type="date" value={editor.localDate} onChange={(event) => setEditor({ ...editor, localDate: event.target.value })} required />
            </label>
            <label className="text-sm font-semibold">
              Início
              <input className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5 font-normal" type="time" step="60" value={editor.startLocalTime} onChange={(event) => setEditor({ ...editor, startLocalTime: event.target.value })} required />
            </label>
            <label className="text-sm font-semibold">
              Fim
              <input className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5 font-normal" type="time" step="60" value={editor.endLocalTime} onChange={(event) => setEditor({ ...editor, endLocalTime: event.target.value })} required />
            </label>
          </div>
          <label className="mt-4 block max-w-xl text-sm font-semibold">
            Motivo privado (opcional)
            <input className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5 font-normal" value={editor.privateReason} onChange={(event) => setEditor({ ...editor, privateReason: event.target.value })} />
          </label>
          <div className="mt-5 flex gap-3">
            <button className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70" type="submit" disabled={submitting}>{submitting ? "Salvando…" : "Salvar bloqueio"}</button>
            <button className="rounded-md border border-[var(--border)] px-4 py-2.5 text-sm font-semibold" type="button" onClick={() => setEditor(null)} disabled={submitting}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {view.blockedPeriods.length === 0 ? (
        <p className="py-8 text-[var(--muted)]">Nenhum período bloqueado.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {view.blockedPeriods.map((blockedPeriod) => (
            <li className="flex flex-wrap items-start justify-between gap-4 py-6" key={blockedPeriod.id}>
              <div>
                <p className="font-semibold tabular-nums">{blockedPeriod.localDate} · {blockedPeriod.startLocalTime}–{blockedPeriod.endLocalTime}</p>
                {blockedPeriod.privateReason ? <p className="mt-2 text-sm">{blockedPeriod.privateReason}</p> : null}
              </div>
              <div className="flex gap-4 text-sm font-semibold">
                <button className="underline decoration-[var(--border)] underline-offset-4" type="button" onClick={() => beginEdit(blockedPeriod)}>Editar</button>
                <button className="text-[var(--danger)] underline decoration-[var(--border)] underline-offset-4" type="button" onClick={() => remove(blockedPeriod)} disabled={submitting}>Liberar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
