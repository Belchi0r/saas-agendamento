"use client";

import { useState, type FormEvent } from "react";

import type { ServiceView } from "@/application/services/service-view";
import {
  formatMinorUnits,
  minorUnitsToInput,
  parseMinorUnits,
} from "@/shared/money/minor-units";

type Draft = {
  name: string;
  description: string;
  price: string;
  durationMinutes: string;
};

type ServiceResponse = Readonly<{
  service?: ServiceView;
  error?: Readonly<{ message?: string }>;
}>;

const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  price: "",
  durationMinutes: "",
};

function sortServices(services: ServiceView[]): ServiceView[] {
  return [...services].sort(
    (left, right) =>
      Number(right.active) - Number(left.active) ||
      left.name.localeCompare(right.name, "pt-BR") ||
      left.id.localeCompare(right.id),
  );
}

function ServiceFields({
  draft,
  idPrefix,
  onChange,
}: Readonly<{
  draft: Draft;
  idPrefix: string;
  onChange: (draft: Draft) => void;
}>) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold" htmlFor={`${idPrefix}-name`}>
          Nome
        </label>
        <input
          className="mt-2 w-full rounded-md border border-[var(--border)] bg-white px-4 py-3"
          id={`${idPrefix}-name`}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          required
        />
      </div>
      <div>
        <label
          className="block text-sm font-semibold"
          htmlFor={`${idPrefix}-description`}
        >
          Descrição <span className="font-normal text-[var(--muted)]">(opcional)</span>
        </label>
        <textarea
          className="mt-2 min-h-24 w-full resize-y rounded-md border border-[var(--border)] bg-white px-4 py-3"
          id={`${idPrefix}-description`}
          value={draft.description}
          onChange={(event) =>
            onChange({ ...draft, description: event.target.value })
          }
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold" htmlFor={`${idPrefix}-price`}>
            Preço
          </label>
          <input
            className="mt-2 w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 tabular-nums"
            id={`${idPrefix}-price`}
            value={draft.price}
            onChange={(event) => onChange({ ...draft, price: event.target.value })}
            inputMode="decimal"
            placeholder="0,00"
            required
          />
        </div>
        <div>
          <label
            className="block text-sm font-semibold"
            htmlFor={`${idPrefix}-duration`}
          >
            Duração (min)
          </label>
          <input
            className="mt-2 w-full rounded-md border border-[var(--border)] bg-white px-4 py-3 tabular-nums"
            id={`${idPrefix}-duration`}
            value={draft.durationMinutes}
            onChange={(event) =>
              onChange({ ...draft, durationMinutes: event.target.value })
            }
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            required
          />
        </div>
      </div>
    </div>
  );
}

export function ServiceManager({
  initialServices,
  currencyCode,
}: Readonly<{
  initialServices: ServiceView[];
  currencyCode: string;
}>) {
  const [services, setServices] = useState(() => sortServices(initialServices));
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState<Draft>(EMPTY_DRAFT);
  const [createActive, setCreateActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeServices = services.filter((service) => service.active);
  const inactiveServices = services.filter((service) => !service.active);

  async function requestService(
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
  ): Promise<ServiceView | null> {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ServiceResponse;

      if (!response.ok || !payload.service) {
        setError(payload.error?.message ?? "Não foi possível salvar o serviço.");
        return null;
      }

      return payload.service;
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  function validatedValues(draft: Draft) {
    const priceMinor = parseMinorUnits(draft.price, currencyCode);
    const durationMinutes = Number(draft.durationMinutes);

    if (
      draft.name.trim() === "" ||
      priceMinor === null ||
      !Number.isSafeInteger(durationMinutes) ||
      durationMinutes <= 0
    ) {
      setError("Revise nome, preço e duração.");
      return null;
    }

    return {
      name: draft.name,
      description: draft.description.trim() || null,
      priceMinor,
      durationMinutes,
    };
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = validatedValues(createDraft);
    if (!values) return;

    const created = await requestService("/api/admin/services", "POST", {
      ...values,
      active: createActive,
    });

    if (created) {
      setServices((current) => sortServices([...current, created]));
      setCreateDraft(EMPTY_DRAFT);
      setCreateActive(true);
      setShowCreate(false);
    }
  }

  function beginEdit(service: ServiceView) {
    setEditingId(service.id);
    setEditDraft({
      name: service.name,
      description: service.description ?? "",
      price: minorUnitsToInput(service.priceMinor, service.currencyCode),
      durationMinutes: String(service.durationMinutes),
    });
    setError(null);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, service: ServiceView) {
    event.preventDefault();
    const values = validatedValues(editDraft);
    if (!values) return;

    const updated = await requestService(
      `/api/admin/services/${service.id}`,
      "PATCH",
      {
        action: "update",
        ...values,
        expectedVersion: service.version,
      },
    );

    if (updated) {
      setServices((current) =>
        sortServices(current.map((item) => (item.id === updated.id ? updated : item))),
      );
      setEditingId(null);
    }
  }

  async function changeStatus(service: ServiceView) {
    if (service.active) {
      const lastActiveWarning =
        activeServices.length === 1
          ? " Este é o último serviço ativo; a página pública ficará sem serviços."
          : "";
      const confirmed = window.confirm(
        `O serviço deixará de aparecer para novas reservas. O histórico será mantido.${lastActiveWarning}`,
      );
      if (!confirmed) return;
    }

    const updated = await requestService(
      `/api/admin/services/${service.id}`,
      "PATCH",
      {
        action: "set-active",
        active: !service.active,
        expectedVersion: service.version,
      },
    );

    if (updated) {
      setServices((current) =>
        sortServices(current.map((item) => (item.id === updated.id ? updated : item))),
      );
    }
  }

  function renderService(service: ServiceView) {
    const editing = editingId === service.id;

    return (
      <li
        key={service.id}
        data-status={service.active ? "active" : "inactive"}
        className={`my-3 border-l-4 px-4 py-5 ${
          service.active
            ? "border-[var(--accent)] bg-[var(--surface)]"
            : "border-[var(--muted)] bg-transparent"
        }`}
      >
        {editing ? (
          <form onSubmit={(event) => saveEdit(event, service)}>
            <p className="mb-5 border-l-2 border-[var(--accent)] pl-4 text-sm leading-6 text-[var(--muted)]">
              As alterações valem para novas reservas. Agendamentos existentes mantêm
              os dados originais.
            </p>
            <ServiceFields
              draft={editDraft}
              idPrefix={`edit-${service.id}`}
              onChange={setEditDraft}
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="rounded-md bg-[var(--accent)] px-5 py-3 font-semibold text-white disabled:opacity-70"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Salvando…" : "Salvar alterações"}
              </button>
              <button
                className="rounded-md border border-[var(--border)] px-5 py-3 font-semibold"
                type="button"
                onClick={() => setEditingId(null)}
                disabled={submitting}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{service.name}</h3>
                {service.description ? (
                  <p className="mt-2 leading-6 text-[var(--muted)]">
                    {service.description}
                  </p>
                ) : null}
              </div>
              <p
                className={`shrink-0 rounded-full border px-3 py-1 text-sm font-semibold ${
                  service.active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--foreground)] bg-transparent"
                }`}
                aria-label={`Status: ${service.active ? "Ativo" : "Inativo"}`}
              >
                <span aria-hidden="true">{service.active ? "✓" : "—"}</span>{" "}
                {service.active ? "Ativo" : "Inativo"}
              </p>
            </div>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums">
              <div>
                <dt className="text-xs font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">Preço</dt>
                <dd className="mt-1 font-semibold">{formatMinorUnits(service.priceMinor, service.currencyCode)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">Duração</dt>
                <dd className="mt-1 font-semibold">{service.durationMinutes} min</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
              <button
                className="min-h-11 rounded-md border border-[var(--border)] px-4"
                type="button"
                onClick={() => beginEdit(service)}
              >
                Editar
              </button>
              <button
                className={`min-h-11 rounded-md border px-4 ${
                  service.active
                    ? "border-[var(--danger)] text-[var(--danger)]"
                    : "border-[var(--accent)] text-[var(--accent)]"
                }`}
                type="button"
                onClick={() => changeStatus(service)}
                disabled={submitting}
              >
                {service.active ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
        <h2 className="text-xl font-semibold">Serviços cadastrados</h2>
        <button
          className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
          type="button"
          onClick={() => {
            setShowCreate((value) => !value);
            setError(null);
          }}
        >
          {showCreate ? "Fechar" : "Novo serviço"}
        </button>
      </div>

      {showCreate ? (
        <form
          className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-6 sm:px-6"
          onSubmit={create}
        >
          <h2 className="text-xl font-semibold">Criar serviço</h2>
          <div className="mt-5">
            <ServiceFields
              draft={createDraft}
              idPrefix="create"
              onChange={setCreateDraft}
            />
          </div>
          <label className="mt-5 flex items-center gap-3 text-sm font-semibold">
            <input
              className="h-5 w-5 accent-[var(--accent)]"
              type="checkbox"
              checked={createActive}
              onChange={(event) => setCreateActive(event.target.checked)}
            />
            Ativo para novas reservas
          </label>
          <button
            className="mt-6 w-full rounded-md bg-[var(--accent)] px-5 py-3 font-semibold text-white sm:w-auto"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Criando…" : "Criar serviço"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="border-b border-[var(--border)] py-4 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {services.length === 0 ? (
        <section className="py-10">
          <h2 className="text-lg font-semibold">Nenhum serviço cadastrado.</h2>
          <p className="mt-2 leading-7 text-[var(--muted)]">
            Crie o primeiro serviço para iniciar o catálogo.
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="active-services-title">
            <h2
              className="pt-7 text-sm font-semibold tracking-[0.08em] text-[var(--muted)] uppercase"
              id="active-services-title"
            >
              Ativos
            </h2>
            {activeServices.length === 0 ? (
              <p className="py-6 text-[var(--muted)]">
                Nenhum serviço ativo. A página pública está sem serviços.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {activeServices.map(renderService)}
              </ul>
            )}
          </section>
          {inactiveServices.length > 0 ? (
            <section className="border-t border-[var(--border)]" aria-labelledby="inactive-services-title">
              <h2
                className="pt-7 text-sm font-semibold tracking-[0.08em] text-[var(--muted)] uppercase"
                id="inactive-services-title"
              >
                Inativos
              </h2>
              <ul className="divide-y divide-[var(--border)]">
                {inactiveServices.map(renderService)}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
