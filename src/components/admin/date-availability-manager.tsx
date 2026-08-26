"use client";

import { useState, type FormEvent } from "react";

import type {
  DateAvailabilityExceptionView,
  DateAvailabilityView,
} from "@/application/availability/date-availability-view";

type WindowDraft = Readonly<{
  key: string;
  startLocalTime: string;
  endLocalTime: string;
}>;

type Editor = Readonly<{
  mode: "create" | "edit";
  id?: string;
  expectedVersion?: number;
  localDate: string;
  exceptionMode: "CLOSED" | "REPLACE";
  privateNote: string;
  workingWindows: readonly WindowDraft[];
}>;

type DateAvailabilityResponse = Readonly<{
  dateAvailability?: DateAvailabilityView;
  error?: Readonly<{ message?: string }>;
}>;

function newWindow(index = 0): WindowDraft {
  return {
    key: `draft-${Date.now()}-${index}`,
    startLocalTime: "",
    endLocalTime: "",
  };
}

function sorted(view: DateAvailabilityView): DateAvailabilityView {
  return {
    ...view,
    exceptions: [...view.exceptions].sort(
      (left, right) =>
        left.localDate.localeCompare(right.localDate) ||
        left.id.localeCompare(right.id),
    ),
  };
}

function windowLabel(window: Readonly<{ startLocalTime: string; endLocalTime: string }>) {
  return `${window.startLocalTime}–${window.endLocalTime}`;
}

export function DateAvailabilityManager({
  initialDateAvailability,
}: Readonly<{ initialDateAvailability: DateAvailabilityView }>) {
  const [availability, setAvailability] = useState(() =>
    sorted(initialDateAvailability),
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function beginCreate() {
    setEditor({
      mode: "create",
      localDate: "",
      exceptionMode: "CLOSED",
      privateNote: "",
      workingWindows: [],
    });
    setError(null);
  }

  function beginEdit(exception: DateAvailabilityExceptionView) {
    setEditor({
      mode: "edit",
      id: exception.id,
      expectedVersion: exception.version,
      localDate: exception.localDate,
      exceptionMode: exception.mode,
      privateNote: exception.privateNote ?? "",
      workingWindows: exception.workingWindows.map((window) => ({
        key: window.id,
        startLocalTime: window.startLocalTime,
        endLocalTime: window.endLocalTime,
      })),
    });
    setError(null);
  }

  function setExceptionMode(mode: "CLOSED" | "REPLACE") {
    if (!editor) return;
    setEditor({
      ...editor,
      exceptionMode: mode,
      workingWindows:
        mode === "CLOSED"
          ? []
          : editor.workingWindows.length > 0
            ? editor.workingWindows
            : [newWindow()],
    });
  }

  function updateWindow(key: string, changes: Partial<WindowDraft>) {
    if (!editor) return;
    setEditor({
      ...editor,
      workingWindows: editor.workingWindows.map((window) =>
        window.key === key ? { ...window, ...changes } : window,
      ),
    });
  }

  function addWindow() {
    if (!editor) return;
    setEditor({
      ...editor,
      workingWindows: [
        ...editor.workingWindows,
        newWindow(editor.workingWindows.length),
      ],
    });
  }

  function removeWindow(key: string) {
    if (!editor) return;
    setEditor({
      ...editor,
      workingWindows: editor.workingWindows.filter(
        (window) => window.key !== key,
      ),
    });
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
      const payload = (await response.json()) as DateAvailabilityResponse;
      if (!response.ok || !payload.dateAvailability) {
        setError(
          payload.error?.message ?? "Não foi possível salvar a data especial.",
        );
        return false;
      }
      setAvailability(sorted(payload.dateAvailability));
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
    if (editor.localDate === "") {
      setError("Informe a data especial.");
      return;
    }
    if (
      editor.exceptionMode === "REPLACE" &&
      (editor.workingWindows.length === 0 ||
        editor.workingWindows.some(
          (window) =>
            window.startLocalTime === "" ||
            window.endLocalTime === "" ||
            window.startLocalTime >= window.endLocalTime,
        ))
    ) {
      setError("Cada faixa especial precisa começar antes de terminar.");
      return;
    }

    const saved = await request(
      editor.mode === "create"
        ? "/api/admin/availability/date-exceptions"
        : `/api/admin/availability/date-exceptions/${editor.id}`,
      editor.mode === "create" ? "POST" : "PATCH",
      {
        ...(editor.mode === "edit"
          ? { action: "update", expectedVersion: editor.expectedVersion }
          : {}),
        localDate: editor.localDate,
        mode: editor.exceptionMode,
        privateNote: editor.privateNote.trim() || null,
        workingWindows: editor.workingWindows.map((window) => ({
          startLocalTime: window.startLocalTime,
          endLocalTime: window.endLocalTime,
        })),
        expectedAvailabilityVersion: availability.availabilityVersion,
      },
    );
    if (saved) setEditor(null);
  }

  async function remove(exception: DateAvailabilityExceptionView) {
    if (!window.confirm(`Remover a configuração de ${exception.localDate}?`)) {
      return;
    }
    const removed = await request(
      `/api/admin/availability/date-exceptions/${exception.id}`,
      "DELETE",
      {
        expectedVersion: exception.version,
        expectedAvailabilityVersion: availability.availabilityVersion,
      },
    );
    if (removed && editor?.id === exception.id) setEditor(null);
  }

  return (
    <div className="mt-8">
      <section className="border-b border-[var(--border)] pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Calendário local</h2>
            <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
              Fechamentos e horários especiais seguem {availability.timezone ?? "o timezone do negócio"}. Um horário especial substitui integralmente a semana naquela data.
            </p>
          </div>
          <button
            className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
            type="button"
            onClick={beginCreate}
          >
            Adicionar data especial
          </button>
        </div>
      </section>

      {error ? (
        <p className="border-b border-[var(--border)] py-4 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {editor ? (
        <form className="border-b border-[var(--border)] py-6" onSubmit={save}>
          <h2 className="text-lg font-semibold">
            {editor.mode === "create" ? "Nova data especial" : "Editar data especial"}
          </h2>
          <div className="mt-4 max-w-sm">
            <label className="block text-sm font-semibold" htmlFor="exception-date">
              Data
            </label>
            <input
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5"
              id="exception-date"
              type="date"
              value={editor.localDate}
              onChange={(event) => setEditor({ ...editor, localDate: event.target.value })}
              required
            />
          </div>
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">Comportamento</legend>
            <div className="mt-2 flex flex-wrap gap-5">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={editor.exceptionMode === "CLOSED"}
                  onChange={() => setExceptionMode("CLOSED")}
                />
                Fechado o dia todo
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={editor.exceptionMode === "REPLACE"}
                  onChange={() => setExceptionMode("REPLACE")}
                />
                Horário especial
              </label>
            </div>
          </fieldset>

          {editor.exceptionMode === "REPLACE" ? (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-semibold">Faixas especiais</h3>
                <button className="text-sm font-semibold text-[var(--accent)] underline" type="button" onClick={addWindow}>
                  Adicionar faixa
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {editor.workingWindows.map((window, index) => (
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3" key={window.key}>
                    <label className="text-sm">
                      Início da faixa {index + 1}
                      <input
                        className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5"
                        type="time"
                        step="60"
                        value={window.startLocalTime}
                        onChange={(event) => updateWindow(window.key, { startLocalTime: event.target.value })}
                        required
                      />
                    </label>
                    <label className="text-sm">
                      Fim da faixa {index + 1}
                      <input
                        className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5"
                        type="time"
                        step="60"
                        value={window.endLocalTime}
                        onChange={(event) => updateWindow(window.key, { endLocalTime: event.target.value })}
                        required
                      />
                    </label>
                    <button className="px-2 py-2.5 text-sm font-semibold text-[var(--danger)] underline" type="button" onClick={() => removeWindow(window.key)}>
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 max-w-xl">
            <label className="block text-sm font-semibold" htmlFor="exception-note">
              Nota privada (opcional)
            </label>
            <input
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5"
              id="exception-note"
              value={editor.privateNote}
              onChange={(event) => setEditor({ ...editor, privateNote: event.target.value })}
            />
          </div>
          <div className="mt-5 flex gap-3">
            <button className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70" type="submit" disabled={submitting}>
              {submitting ? "Salvando…" : "Salvar data especial"}
            </button>
            <button className="rounded-md border border-[var(--border)] px-4 py-2.5 text-sm font-semibold" type="button" onClick={() => setEditor(null)} disabled={submitting}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {availability.exceptions.length === 0 ? (
        <p className="py-8 text-[var(--muted)]">Nenhuma folga ou exceção cadastrada.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {availability.exceptions.map((exception) => (
            <li className="py-6" key={exception.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold tabular-nums">{exception.localDate}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {exception.mode === "CLOSED"
                      ? "Fechado o dia todo"
                      : exception.workingWindows.map(windowLabel).join(" · ")}
                  </p>
                  {exception.privateNote ? (
                    <p className="mt-2 text-sm">{exception.privateNote}</p>
                  ) : null}
                </div>
                <div className="flex gap-4 text-sm font-semibold">
                  <button className="underline decoration-[var(--border)] underline-offset-4" type="button" onClick={() => beginEdit(exception)}>
                    Editar
                  </button>
                  <button className="text-[var(--danger)] underline decoration-[var(--border)] underline-offset-4" type="button" onClick={() => remove(exception)} disabled={submitting}>
                    Remover
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
