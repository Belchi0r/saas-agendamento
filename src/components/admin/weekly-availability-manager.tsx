"use client";

import { useState, type FormEvent } from "react";

import type {
  WeeklyAvailabilityView,
  WeeklyIntervalView,
} from "@/application/availability/weekly-availability-view";

const WEEKDAYS = [
  { value: 1, name: "Segunda-feira" },
  { value: 2, name: "Terça-feira" },
  { value: 3, name: "Quarta-feira" },
  { value: 4, name: "Quinta-feira" },
  { value: 5, name: "Sexta-feira" },
  { value: 6, name: "Sábado" },
  { value: 7, name: "Domingo" },
] as const;

type IntervalKind = "working" | "break";
type Editor = Readonly<{
  mode: "create" | "edit";
  kind: IntervalKind;
  id?: string;
  weekday: number;
  startLocalTime: string;
  endLocalTime: string;
}>;

type AvailabilityResponse = Readonly<{
  availability?: WeeklyAvailabilityView;
  error?: Readonly<{ message?: string }>;
}>;

type QuickDraft = Readonly<{
  weekdays: readonly number[];
  workingStartLocalTime: string;
  workingEndLocalTime: string;
  includeBreak: boolean;
  breakStartLocalTime: string;
  breakEndLocalTime: string;
}>;

const INITIAL_QUICK_DRAFT: QuickDraft = {
  weekdays: [],
  workingStartLocalTime: "08:00",
  workingEndLocalTime: "20:00",
  includeBreak: true,
  breakStartLocalTime: "12:00",
  breakEndLocalTime: "13:30",
};

function sortAvailability(
  availability: WeeklyAvailabilityView,
): WeeklyAvailabilityView {
  const sort = (intervals: readonly WeeklyIntervalView[]) =>
    [...intervals].sort(
      (left, right) =>
        left.weekday - right.weekday ||
        left.startLocalTime.localeCompare(right.startLocalTime) ||
        left.id.localeCompare(right.id),
    );

  return {
    ...availability,
    workingWindows: sort(availability.workingWindows),
    breaks: sort(availability.breaks),
  };
}

function intervalLabel(interval: WeeklyIntervalView): string {
  return `${interval.startLocalTime}–${interval.endLocalTime}`;
}

function RangeEditor({
  editor,
  weekdayName,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: Readonly<{
  editor: Editor;
  weekdayName: string;
  submitting: boolean;
  onChange: (editor: Editor) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  const noun = editor.kind === "working" ? "faixa" : "pausa";
  const idPrefix = `${editor.mode}-${editor.kind}-${editor.id ?? editor.weekday}`;

  return (
    <form
      className="mt-4 border-l-2 border-[var(--accent)] pl-4"
      onSubmit={onSubmit}
    >
      <p className="text-sm font-semibold">
        {editor.mode === "create" ? `Nova ${noun}` : `Editar ${noun}`}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm" htmlFor={`${idPrefix}-start`}>
            Início da {noun} de {weekdayName}
          </label>
          <input
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5 tabular-nums"
            id={`${idPrefix}-start`}
            type="time"
            step="60"
            value={editor.startLocalTime}
            onChange={(event) =>
              onChange({ ...editor, startLocalTime: event.target.value })
            }
            required
          />
        </div>
        <div>
          <label className="block text-sm" htmlFor={`${idPrefix}-end`}>
            Fim da {noun} de {weekdayName}
          </label>
          <input
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5 tabular-nums"
            id={`${idPrefix}-end`}
            type="time"
            step="60"
            value={editor.endLocalTime}
            onChange={(event) =>
              onChange({ ...editor, endLocalTime: event.target.value })
            }
            required
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Salvando…" : `Salvar ${noun}`}
        </button>
        <button
          className="rounded-md border border-[var(--border)] px-4 py-2.5 text-sm font-semibold"
          type="button"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function WeeklyAvailabilityManager({
  initialAvailability,
}: Readonly<{ initialAvailability: WeeklyAvailabilityView }>) {
  const [availability, setAvailability] = useState(() =>
    sortAvailability(initialAvailability),
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickDraft, setQuickDraft] = useState<QuickDraft>(INITIAL_QUICK_DRAFT);
  const [confirmingReplacement, setConfirmingReplacement] = useState(false);

  async function requestAvailability(
    url: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
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
      const payload = (await response.json()) as AvailabilityResponse;

      if (!response.ok || !payload.availability) {
        setError(
          payload.error?.message ?? "Não foi possível salvar os horários.",
        );
        return false;
      }

      setAvailability(sortAvailability(payload.availability));
      return true;
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;

    if (
      editor.startLocalTime === "" ||
      editor.endLocalTime === "" ||
      editor.startLocalTime >= editor.endLocalTime
    ) {
      setError("O horário inicial deve ser anterior ao final.");
      return;
    }

    const resource = editor.kind === "working" ? "working-windows" : "breaks";
    const url =
      editor.mode === "create"
        ? `/api/admin/availability/${resource}`
        : `/api/admin/availability/${resource}/${editor.id}`;
    const saved = await requestAvailability(
      url,
      editor.mode === "create" ? "POST" : "PATCH",
      {
        ...(editor.mode === "edit" ? { action: "update" } : {}),
        weekday: editor.weekday,
        startLocalTime: editor.startLocalTime,
        endLocalTime: editor.endLocalTime,
        expectedAvailabilityVersion: availability.availabilityVersion,
      },
    );

    if (saved) setEditor(null);
  }

  function selectedDaysHaveConfiguration(): boolean {
    return availability.workingWindows.some((item) =>
      quickDraft.weekdays.includes(item.weekday),
    ) || availability.breaks.some((item) =>
      quickDraft.weekdays.includes(item.weekday),
    );
  }

  function validateQuickDraft(): boolean {
    if (
      quickDraft.weekdays.length === 0 ||
      quickDraft.workingStartLocalTime >= quickDraft.workingEndLocalTime ||
      (quickDraft.includeBreak &&
        quickDraft.breakStartLocalTime >= quickDraft.breakEndLocalTime)
    ) {
      setError(
        "Selecione ao menos um dia e mantenha trabalho e pausa em ordem válida.",
      );
      return false;
    }
    return true;
  }

  async function applyQuickDraft(confirmReplaceExisting: boolean) {
    const applied = await requestAvailability(
      "/api/admin/availability/weekly-template",
      "PUT",
      {
        weekdays: quickDraft.weekdays,
        workingStartLocalTime: quickDraft.workingStartLocalTime,
        workingEndLocalTime: quickDraft.workingEndLocalTime,
        breakStartLocalTime: quickDraft.includeBreak
          ? quickDraft.breakStartLocalTime
          : null,
        breakEndLocalTime: quickDraft.includeBreak
          ? quickDraft.breakEndLocalTime
          : null,
        confirmReplaceExisting,
        expectedAvailabilityVersion: availability.availabilityVersion,
      },
    );
    if (applied) setConfirmingReplacement(false);
  }

  async function submitQuickDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateQuickDraft()) return;
    if (selectedDaysHaveConfiguration()) {
      setConfirmingReplacement(true);
      return;
    }
    await applyQuickDraft(false);
  }

  function toggleQuickWeekday(weekday: number) {
    setQuickDraft((current) => ({
      ...current,
      weekdays: current.weekdays.includes(weekday)
        ? current.weekdays.filter((item) => item !== weekday)
        : [...current.weekdays, weekday].sort(),
    }));
    setConfirmingReplacement(false);
  }

  function useMondayAsTemplate() {
    const windows = availability.workingWindows.filter((item) => item.weekday === 1);
    const breaks = availability.breaks.filter((item) => item.weekday === 1);
    const window = windows[0];
    if (windows.length !== 1 || !window || breaks.length > 1) return;
    setQuickDraft((current) => ({
      ...current,
      workingStartLocalTime: window.startLocalTime,
      workingEndLocalTime: window.endLocalTime,
      includeBreak: breaks.length === 1,
      breakStartLocalTime: breaks[0]?.startLocalTime ?? current.breakStartLocalTime,
      breakEndLocalTime: breaks[0]?.endLocalTime ?? current.breakEndLocalTime,
    }));
    setConfirmingReplacement(false);
  }

  async function removeInterval(
    kind: IntervalKind,
    interval: WeeklyIntervalView,
  ) {
    const noun = kind === "working" ? "faixa de trabalho" : "pausa";
    if (!window.confirm(`Remover esta ${noun}?`)) return;

    const resource = kind === "working" ? "working-windows" : "breaks";
    const removed = await requestAvailability(
      `/api/admin/availability/${resource}/${interval.id}`,
      "DELETE",
      { expectedAvailabilityVersion: availability.availabilityVersion },
    );

    if (removed && editor?.id === interval.id) setEditor(null);
  }

  function beginCreate(kind: IntervalKind, weekday: number) {
    setEditor({
      mode: "create",
      kind,
      weekday,
      startLocalTime: "",
      endLocalTime: "",
    });
    setError(null);
  }

  function beginEdit(kind: IntervalKind, interval: WeeklyIntervalView) {
    setEditor({
      mode: "edit",
      kind,
      id: interval.id,
      weekday: interval.weekday,
      startLocalTime: interval.startLocalTime,
      endLocalTime: interval.endLocalTime,
    });
    setError(null);
  }

  function renderIntervals(
    kind: IntervalKind,
    intervals: readonly WeeklyIntervalView[],
    weekdayName: string,
  ) {
    if (intervals.length === 0) {
      return (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {kind === "working" ? "Não trabalha" : "Sem pausas"}
        </p>
      );
    }

    return (
      <ul className="mt-2 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {intervals.map((interval) => (
          <li className="py-3" key={interval.id}>
            {editor?.mode === "edit" && editor.id === interval.id ? (
              <RangeEditor
                editor={editor}
                weekdayName={weekdayName}
                submitting={submitting}
                onChange={setEditor}
                onCancel={() => setEditor(null)}
                onSubmit={saveEditor}
              />
            ) : (
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold tabular-nums">
                  {intervalLabel(interval)}
                </span>
                <span className="flex gap-4 text-sm font-semibold">
                  <button
                    className="underline decoration-[var(--border)] underline-offset-4"
                    type="button"
                    onClick={() => beginEdit(kind, interval)}
                    aria-label={`Editar ${kind === "working" ? "faixa" : "pausa"} ${intervalLabel(interval)} de ${weekdayName}`}
                  >
                    Editar
                  </button>
                  <button
                    className="text-[var(--danger)] underline decoration-[var(--border)] underline-offset-4"
                    type="button"
                    onClick={() => removeInterval(kind, interval)}
                    disabled={submitting}
                    aria-label={`Remover ${kind === "working" ? "faixa" : "pausa"} ${intervalLabel(interval)} de ${weekdayName}`}
                  >
                    Remover
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mt-8">
      <WeeklySummary availability={availability} />

      <section className="border-b border-[var(--border)] py-7" aria-labelledby="quick-week-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="quick-week-title" className="text-xl font-semibold">
              Aplicar horário a vários dias
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Monte uma rotina comum e escolha os dias que devem recebê-la.
            </p>
          </div>
          {availability.workingWindows.filter((item) => item.weekday === 1).length === 1 &&
          availability.breaks.filter((item) => item.weekday === 1).length <= 1 ? (
            <button
              type="button"
              onClick={useMondayAsTemplate}
              className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm font-semibold"
            >
              Usar horário de segunda
            </button>
          ) : null}
        </div>

        <form className="mt-5" onSubmit={submitQuickDraft}>
          <fieldset>
            <legend className="text-sm font-semibold">Dias</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WEEKDAYS.map((weekday) => (
                <label
                  key={weekday.value}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm font-semibold ${
                    quickDraft.weekdays.includes(weekday.value)
                      ? "border-[var(--accent)] bg-[var(--surface)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--accent)]"
                    checked={quickDraft.weekdays.includes(weekday.value)}
                    onChange={() => toggleQuickWeekday(weekday.value)}
                  />
                  {weekday.name.replace("-feira", "")}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">Trabalho</legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <LabeledTime
                id="quick-working-start"
                label="Início"
                value={quickDraft.workingStartLocalTime}
                onChange={(value) => setQuickDraft((current) => ({
                  ...current,
                  workingStartLocalTime: value,
                }))}
              />
              <LabeledTime
                id="quick-working-end"
                label="Fim"
                value={quickDraft.workingEndLocalTime}
                onChange={(value) => setQuickDraft((current) => ({
                  ...current,
                  workingEndLocalTime: value,
                }))}
              />
            </div>
          </fieldset>

          <label className="mt-5 flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={quickDraft.includeBreak}
              onChange={(event) => setQuickDraft((current) => ({
                ...current,
                includeBreak: event.target.checked,
              }))}
            />
            Adicionar pausa
          </label>
          {quickDraft.includeBreak ? (
            <fieldset className="mt-3">
              <legend className="sr-only">Pausa opcional</legend>
              <div className="grid grid-cols-2 gap-3">
                <LabeledTime
                  id="quick-break-start"
                  label="Início da pausa"
                  value={quickDraft.breakStartLocalTime}
                  onChange={(value) => setQuickDraft((current) => ({
                    ...current,
                    breakStartLocalTime: value,
                  }))}
                />
                <LabeledTime
                  id="quick-break-end"
                  label="Fim da pausa"
                  value={quickDraft.breakEndLocalTime}
                  onChange={(value) => setQuickDraft((current) => ({
                    ...current,
                    breakEndLocalTime: value,
                  }))}
                />
              </div>
            </fieldset>
          ) : null}

          {!confirmingReplacement ? (
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 min-h-12 w-full rounded-md bg-[var(--accent)] px-5 font-semibold text-white disabled:opacity-70 sm:w-auto"
            >
              {submitting ? "Aplicando…" : "Aplicar aos dias selecionados"}
            </button>
          ) : (
            <div
              role="alert"
              className="mt-5 border-l-4 border-[var(--danger)] bg-[var(--surface)] p-4"
            >
              <p className="font-semibold">Substituir horários existentes?</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                As faixas e pausas atuais dos dias selecionados serão trocadas por
                esta configuração. Os outros dias não serão alterados.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void applyQuickDraft(true)}
                  className="min-h-11 rounded-md bg-[var(--danger)] px-4 text-sm font-semibold text-white disabled:opacity-70"
                >
                  {submitting ? "Substituindo…" : "Confirmar e substituir"}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setConfirmingReplacement(false)}
                  className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </form>
      </section>

      <section className="border-b border-[var(--border)] pb-6">
        <h2 className="text-lg font-semibold">Horário local recorrente</h2>
        <p className="mt-2 leading-7 text-[var(--muted)]">
          {availability.timezone
            ? `As faixas seguem ${availability.timezone} e não são convertidas para UTC.`
            : "O timezone do negócio ainda não está configurado. As faixas continuam armazenadas como hora local."}
        </p>
      </section>

      {error ? (
        <p
          className="border-b border-[var(--border)] py-4 text-sm text-[var(--danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="divide-y divide-[var(--border)]">
        <h2 className="pt-7 text-xl font-semibold">Ajustes por dia</h2>
        {WEEKDAYS.map((weekday) => {
          const windows = availability.workingWindows.filter(
            (item) => item.weekday === weekday.value,
          );
          const breaks = availability.breaks.filter(
            (item) => item.weekday === weekday.value,
          );
          const isCreatingWorking =
            editor?.mode === "create" &&
            editor.kind === "working" &&
            editor.weekday === weekday.value;
          const isCreatingBreak =
            editor?.mode === "create" &&
            editor.kind === "break" &&
            editor.weekday === weekday.value;

          return (
            <section className="py-7" key={weekday.value}>
              <h2 className="text-xl font-semibold">{weekday.name}</h2>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
                    Trabalho
                  </h3>
                  <button
                    className="text-sm font-semibold text-[var(--accent)] underline decoration-[var(--border)] underline-offset-4"
                    type="button"
                    onClick={() => beginCreate("working", weekday.value)}
                  >
                    Adicionar faixa em {weekday.name}
                  </button>
                </div>
                {renderIntervals("working", windows, weekday.name)}
                {isCreatingWorking && editor ? (
                  <RangeEditor
                    editor={editor}
                    weekdayName={weekday.name}
                    submitting={submitting}
                    onChange={setEditor}
                    onCancel={() => setEditor(null)}
                    onSubmit={saveEditor}
                  />
                ) : null}
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
                    Pausas
                  </h3>
                  <button
                    className="text-sm font-semibold text-[var(--accent)] underline decoration-[var(--border)] underline-offset-4 disabled:text-[var(--muted)]"
                    type="button"
                    onClick={() => beginCreate("break", weekday.value)}
                    disabled={windows.length === 0}
                  >
                    Adicionar pausa em {weekday.name}
                  </button>
                </div>
                {renderIntervals("break", breaks, weekday.name)}
                {windows.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Adicione uma faixa de trabalho antes de configurar pausas.
                  </p>
                ) : null}
                {isCreatingBreak && editor ? (
                  <RangeEditor
                    editor={editor}
                    weekdayName={weekday.name}
                    submitting={submitting}
                    onChange={setEditor}
                    onCancel={() => setEditor(null)}
                    onSubmit={saveEditor}
                  />
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function WeeklySummary({
  availability,
}: Readonly<{ availability: WeeklyAvailabilityView }>) {
  return (
    <section className="border-b border-[var(--border)] pb-7" aria-labelledby="weekly-summary-title">
      <h2 id="weekly-summary-title" className="text-xl font-semibold">
        Resumo da semana
      </h2>
      <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {WEEKDAYS.map((weekday) => {
          const windows = availability.workingWindows.filter(
            (item) => item.weekday === weekday.value,
          );
          const breaks = availability.breaks.filter(
            (item) => item.weekday === weekday.value,
          );
          return (
            <li
              key={weekday.value}
              className="grid grid-cols-[3.5rem_1fr] border-b border-[var(--border)] py-3"
            >
              <strong>{weekday.name.slice(0, 3)}</strong>
              <span className="text-sm">
                {windows.length === 0
                  ? "Não trabalha"
                  : windows.map(intervalLabel).join(", ")}
                {breaks.length > 0 ? (
                  <span className="mt-1 block text-[var(--muted)]">
                    Pausa {breaks.map(intervalLabel).join(", ")}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LabeledTime({
  id,
  label,
  value,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="block text-sm" htmlFor={id}>
      {label}
      <input
        id={id}
        type="time"
        step="60"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-12 w-full rounded-md border border-[var(--border)] bg-white px-3 tabular-nums"
        required
      />
    </label>
  );
}
