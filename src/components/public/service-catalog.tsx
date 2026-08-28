"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ServiceView } from "@/application/services/service-view";
import { normalizeBrazilianWhatsapp } from "@/domain/booking/public-booking";
import { formatMinorUnits } from "@/shared/money/minor-units";

import {
  formatBrazilianWhatsapp,
  maskBrazilianWhatsappInput,
} from "./brazilian-whatsapp";

type Step = "SERVICE" | "DATE" | "TIME" | "CUSTOMER" | "REVIEW" | "DONE";
type Slot = Readonly<{
  startLocalTime: string;
  startAtUtc: string;
  endAtUtc: string;
  offset: string;
}>;
type DateOption = Readonly<{
  localDate: string;
  status: "AVAILABLE" | "NOT_WORKING" | "TOO_SOON" | "FULLY_BOOKED";
  reason: "CLOSED" | "NO_WORKING_WINDOW" | "SERVICE_DOES_NOT_FIT" | "LEAD_TIME" | "OCCUPIED" | null;
  availableSlotCount: number;
  firstAvailableLocalTime: string | null;
}>;
type Confirmation = {
  appointment: {
    serviceName: string;
    localDate: string;
    localTime: string;
    durationMinutes: number;
    priceMinor: number;
    currencyCode: string;
    customerName: string;
    customerWhatsapp?: string;
  };
  managementLink: string;
};
type DateNotice = Readonly<{
  unavailableDate: string;
  status: Exclude<DateOption["status"], "AVAILABLE">;
  nextDate: DateOption | null;
}>;

export function PublicServiceCatalog({
  business,
  services,
}: Readonly<{
  business: Readonly<{
    publicName: string | null;
    publicDescription: string | null;
  }>;
  services: ServiceView[];
}>) {
  const [step, setStep] = useState<Step>("SERVICE");
  const [serviceId, setServiceId] = useState("");
  const [dateOptions, setDateOptions] = useState<DateOption[]>([]);
  const [visibleDateCount, setVisibleDateCount] = useState(6);
  const [dateNotice, setDateNotice] = useState<DateNotice | null>(null);
  const [localDate, setLocalDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [localTime, setLocalTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [whatsappE164, setWhatsappE164] = useState("");
  const [whatsappError, setWhatsappError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const service = useMemo(
    () => services.find((item) => item.id === serviceId) ?? null,
    [serviceId, services],
  );
  const availableDates = dateOptions.filter(
    (date) => date.status === "AVAILABLE",
  );
  const hasWorkingDate = dateOptions.some(
    (date) => date.status !== "NOT_WORKING",
  );
  const resetIntent = () => {
    idempotencyKey.current = null;
  };

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [step]);

  function continueToReview() {
    try {
      normalizeBrazilianWhatsapp(whatsappE164);
      setWhatsappError("");
      setStep("REVIEW");
    } catch {
      setWhatsappError("Digite um WhatsApp válido com DDD.");
    }
  }

  async function requestDateOptions(id: string): Promise<DateOption[]> {
    const params = new URLSearchParams({ serviceId: id });
    const response = await fetch(`/api/public/availability/dates?${params}`, {
      cache: "no-store",
    });
    const body = await response.json() as {
      availability?: { dates: DateOption[] };
      error?: { message: string };
    };
    if (!response.ok || !body.availability) {
      throw new Error(
        body.error?.message ?? "Não foi possível buscar as próximas datas.",
      );
    }
    return body.availability.dates;
  }

  async function chooseService(id: string) {
    setServiceId(id);
    setDateOptions([]);
    setVisibleDateCount(6);
    setDateNotice(null);
    setLocalDate("");
    setLocalTime("");
    setSlots([]);
    setError("");
    resetIntent();
    setStep("DATE");
    setBusy(true);
    try {
      setDateOptions(await requestDateOptions(id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível buscar as próximas datas.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadSlotsForDate(date: string) {
    if (!service) return;
    setLocalDate(date);
    setLocalTime("");
    setSlots([]);
    setDateNotice(null);
    setError("");
    resetIntent();
    setStep("TIME");
    setBusy(true);
    try {
      const params = new URLSearchParams({
        serviceId: service.id,
        localDate: date,
      });
      const response = await fetch(`/api/public/availability?${params}`, {
        cache: "no-store",
      });
      const body = await response.json() as {
        availability?: { slots: Slot[] };
        error?: { message: string };
      };
      if (!response.ok || !body.availability) {
        throw new Error(
          body.error?.message ?? "Não foi possível buscar os horários.",
        );
      }
      if (body.availability.slots.length > 0) {
        setSlots(body.availability.slots);
        return;
      }

      const refreshedDates = await requestDateOptions(service.id);
      setDateOptions(refreshedDates);
      const refreshedSelection = refreshedDates.find(
        (item) => item.localDate === date,
      );
      setDateNotice({
        unavailableDate: date,
        status:
          refreshedSelection?.status === "NOT_WORKING" ||
          refreshedSelection?.status === "TOO_SOON"
            ? refreshedSelection.status
            : "FULLY_BOOKED",
        nextDate:
          refreshedDates.find(
            (item) => item.status === "AVAILABLE" && item.localDate > date,
          ) ?? null,
      });
      setStep("DATE");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível buscar os horários.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!service) return;
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          serviceId: service.id,
          localDate,
          localTime,
          customerName,
          whatsappE164,
          reviewedService: {
            version: service.version,
            name: service.name,
            durationMinutes: service.durationMinutes,
            priceMinor: service.priceMinor,
            currencyCode: service.currencyCode,
          },
        }),
      });
      const body = await response.json() as {
        booking?: Confirmation;
        error?: { code: string; message: string };
      };
      if (!response.ok || !body.booking) {
        if (body.error?.code === "BOOKING_SLOT_UNAVAILABLE") {
          resetIntent();
          await loadSlotsForDate(localDate);
        }
        throw new Error(
          body.error?.message ??
            "Não foi possível confirmar. Seu agendamento ainda não foi criado.",
        );
      }
      setConfirmation(body.booking);
      setStep("DONE");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível confirmar. Seu agendamento ainda não foi criado.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-8 sm:px-8 sm:py-14">
      <header className="border-b border-[var(--border)] pb-6">
        <p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">
          {business.publicName ?? "Agendamento"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {step === "DONE" ? "Agendamento confirmado" : "Agende seu horário"}
        </h1>
        {business.publicDescription && step === "SERVICE" ? (
          <p className="mt-3 leading-7 text-[var(--muted)]">
            {business.publicDescription}
          </p>
        ) : null}
      </header>

      {step !== "DONE" ? <Progress step={step} /> : null}
      {error ? (
        <p
          role="alert"
          className="mt-5 border-l-4 border-[var(--danger)] bg-[var(--surface)] p-4 text-sm"
        >
          {error}
        </p>
      ) : null}

      {step === "SERVICE" ? (
        <section className="py-7">
          <h2 className="text-xl font-semibold">Escolha um serviço</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Toque no serviço para ver as próximas datas.
          </p>
          {services.length === 0 ? (
            <h2 className="mt-4 text-lg font-semibold">
              Nenhum serviço disponível no momento.
            </h2>
          ) : (
            <ul className="mt-4 border-y border-[var(--border)] divide-y divide-[var(--border)]">
              {services.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void chooseService(item.id)}
                    className="group flex min-h-20 w-full items-center justify-between gap-4 py-4 text-left"
                  >
                    <span>
                      <h3 className="font-semibold">{item.name}</h3>
                      <span className="mt-1 block text-sm text-[var(--muted)]">
                        {item.durationMinutes} min · {formatMinorUnits(item.priceMinor, item.currencyCode)}
                      </span>
                      {item.description ? (
                        <span className="mt-1 block text-sm text-[var(--muted)]">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-semibold text-[var(--accent)] group-focus-visible:underline">
                      Escolher <span aria-hidden="true">→</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {step === "DATE" && service ? (
        <section className="py-7">
          <Summary service={service} />
          <h2 className="mt-6 text-xl font-semibold">
            Próximas datas disponíveis
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Mostramos apenas dias em que este atendimento ainda cabe na agenda.
          </p>
          {dateNotice ? (
            <div
              aria-live="polite"
              className="mt-5 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-4"
            >
              <p className="font-semibold">
                {dateNotice.status === "NOT_WORKING"
                  ? `O negócio não atende em ${formatLongDate(dateNotice.unavailableDate)}.`
                  : dateNotice.status === "TOO_SOON"
                    ? `Esta data não atende à antecedência mínima: ${formatLongDate(dateNotice.unavailableDate)}.`
                    : `Não restam horários em ${formatLongDate(dateNotice.unavailableDate)}.`}
              </p>
              {dateNotice.nextDate ? (
                <>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Próxima disponibilidade: {formatLongDate(dateNotice.nextDate.localDate)}.
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadSlotsForDate(dateNotice.nextDate!.localDate)}
                    className="mt-3 min-h-12 font-semibold text-[var(--accent)] underline underline-offset-4"
                  >
                    Ver próxima disponibilidade
                  </button>
                </>
              ) : (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Escolha outra data disponível abaixo.
                </p>
              )}
            </div>
          ) : null}
          {busy ? (
            <p aria-live="polite" className="mt-5 text-[var(--muted)]">
              Buscando as próximas datas…
            </p>
          ) : null}
          {!busy && availableDates.length === 0 ? (
            <div className="mt-5 bg-[var(--surface)] p-4">
              <p className="font-semibold">
                {hasWorkingDate
                  ? "Os dias de atendimento estão sem horários livres neste período."
                  : "O negócio não atende nos dias deste período."}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Tente outro serviço ou volte mais tarde.
              </p>
            </div>
          ) : null}
          {availableDates.length > 0 ? (
            <ul className="mt-5 space-y-3">
              {availableDates.slice(0, visibleDateCount).map((date) => (
                <li key={date.localDate}>
                  <button
                    type="button"
                    aria-label={`Escolher ${formatLongDate(date.localDate)}`}
                    onClick={() => void loadSlotsForDate(date.localDate)}
                    className="flex min-h-16 w-full items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left"
                  >
                    <span className="font-semibold">
                      {formatLongDate(date.localDate)}
                    </span>
                    <span className="shrink-0 text-right text-sm text-[var(--muted)]">
                      a partir de {date.firstAvailableLocalTime}
                      <span className="block">
                        {date.availableSlotCount} {date.availableSlotCount === 1 ? "horário" : "horários"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {visibleDateCount < availableDates.length ? (
            <button
              type="button"
              onClick={() => setVisibleDateCount((count) => count + 6)}
              className="mt-5 min-h-12 font-semibold text-[var(--accent)] underline underline-offset-4"
            >
              Mostrar mais datas
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep("SERVICE");
            }}
            className="mt-7 min-h-12 rounded-lg border border-[var(--border)] px-5"
          >
            Voltar aos serviços
          </button>
        </section>
      ) : null}

      {step === "TIME" && service ? (
        <section className="py-7">
          <Summary service={service} date={localDate} />
          <h2 className="mt-6 text-xl font-semibold">Escolha o horário</h2>
          {busy ? (
            <p aria-live="polite" className="mt-4 text-[var(--muted)]">
              Carregando horários…
            </p>
          ) : null}
          {!busy && slots.length > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {slots.map((slot) => (
                <button
                  type="button"
                  key={slot.startAtUtc}
                  onClick={() => {
                    setLocalTime(slot.startLocalTime);
                    resetIntent();
                  }}
                  aria-pressed={localTime === slot.startLocalTime}
                  className={`min-h-12 rounded-lg border px-3 font-semibold ${
                    localTime === slot.startLocalTime
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  {slot.startLocalTime}
                </button>
              ))}
            </div>
          ) : null}
          {!busy && slots.length === 0 ? (
            <button
              type="button"
              onClick={() => void loadSlotsForDate(localDate)}
              className="mt-5 min-h-12 font-semibold text-[var(--accent)] underline underline-offset-4"
            >
              Tentar carregar novamente
            </button>
          ) : null}
          <Actions
            back={() => {
              setError("");
              setStep("DATE");
            }}
            next={() => setStep("CUSTOMER")}
            label="Continuar"
            disabled={busy || !localTime}
          />
        </section>
      ) : null}

      {step === "CUSTOMER" && service ? (
        <section className="py-7">
          <Summary service={service} date={localDate} time={localTime} />
          <h2 className="mt-6 text-xl font-semibold">Seus dados</h2>
          <label className="mt-4 block text-sm font-medium">
            Nome
            <input
              value={customerName}
              onChange={(event) => {
                setCustomerName(event.target.value);
                resetIntent();
              }}
              className="mt-2 min-h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            WhatsApp
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(61) 99440-2561"
              maxLength={16}
              value={whatsappE164}
              onChange={(event) => {
                setWhatsappE164(maskBrazilianWhatsappInput(event.target.value));
                setWhatsappError("");
                resetIntent();
              }}
              aria-describedby="whatsapp-help whatsapp-error"
              aria-invalid={whatsappError ? true : undefined}
              className="mt-2 min-h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3"
            />
          </label>
          <p id="whatsapp-help" className="mt-2 text-sm text-[var(--muted)]">
            Digite seu WhatsApp com DDD.
          </p>
          {whatsappError ? (
            <p id="whatsapp-error" className="mt-2 text-sm text-[var(--danger)]" role="alert">
              {whatsappError}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-[var(--muted)]">
            Usaremos seu nome e WhatsApp para identificar e gerenciar este agendamento.
          </p>
          <Actions
            back={() => setStep("TIME")}
            next={continueToReview}
            label="Revisar"
            disabled={customerName.trim().length < 2 || whatsappE164.trim().length < 8}
          />
        </section>
      ) : null}

      {step === "REVIEW" && service ? (
        <section className="py-7">
          <h2 className="text-xl font-semibold">Revise sua reserva</h2>
          <div className="mt-4 space-y-2 rounded-xl bg-[var(--surface)] p-5">
            <p><strong>{service.name}</strong></p>
            <p>{formatDate(localDate)} às {localTime}</p>
            <p>
              {service.durationMinutes} min · {formatMinorUnits(service.priceMinor, service.currencyCode)}
            </p>
            <p>{customerName}</p>
            <p>{whatsappE164}</p>
          </div>
          <Actions
            back={() => setStep("CUSTOMER")}
            next={() => void confirm()}
            label={busy ? "Confirmando…" : "Confirmar agendamento"}
            disabled={busy}
          />
        </section>
      ) : null}

      {step === "DONE" && confirmation ? (
        <section className="py-8">
          <p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">
            Confirmado
          </p>
          <div className="rounded-xl bg-[var(--surface)] p-6">
            <p className="text-2xl font-semibold">
              {formatDate(confirmation.appointment.localDate)} às {confirmation.appointment.localTime}
            </p>
            <p className="mt-3">{confirmation.appointment.serviceName}</p>
            <p className="mt-1 text-[var(--muted)]">
              {confirmation.appointment.durationMinutes} min · {formatMinorUnits(confirmation.appointment.priceMinor, confirmation.appointment.currencyCode)}
            </p>
            <p className="mt-4 font-semibold">
              {confirmation.appointment.customerName}
            </p>
            {confirmation.appointment.customerWhatsapp ? (
              <p className="mt-1 text-sm text-[var(--muted)]">
                {formatBrazilianWhatsapp(confirmation.appointment.customerWhatsapp)}
              </p>
            ) : null}
          </div>
          <a
            href={confirmation.managementLink}
            rel="noreferrer"
            className="mt-6 flex min-h-12 items-center justify-center rounded-lg bg-[var(--accent)] px-5 font-semibold text-white"
          >
            Gerenciar agendamento
          </a>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            Guarde este acesso e não o compartilhe. Por enquanto, a área de
            gerenciamento permite somente consultar os dados da reserva.
          </p>
        </section>
      ) : null}
    </main>
  );
}

const PROGRESS_STEPS = [
  ["SERVICE", "Serviço"],
  ["DATE", "Data"],
  ["TIME", "Horário"],
  ["CUSTOMER", "Dados"],
  ["REVIEW", "Revisão"],
] as const;

function Progress({ step }: Readonly<{ step: Exclude<Step, "DONE"> }>) {
  const currentIndex = PROGRESS_STEPS.findIndex(([value]) => value === step);
  return (
    <ol
      aria-label="Progresso do agendamento"
      className="mt-6 grid grid-cols-5 gap-1"
    >
      {PROGRESS_STEPS.map(([value, label], index) => {
        const completed = index < currentIndex;
        const current = value === step;
        return (
          <li
            key={value}
            aria-current={current ? "step" : undefined}
            className={`border-t-2 pt-2 text-center text-[0.7rem] sm:text-xs ${
              completed || current
                ? "border-[var(--accent)] font-semibold text-[var(--foreground)]"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            <span aria-hidden="true" className="mb-1 block">
              {completed ? "✓" : index + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function Summary({
  service,
  date,
  time,
}: Readonly<{ service: ServiceView; date?: string; time?: string }>) {
  return (
    <div className="border-l-2 border-[var(--accent)] pl-4">
      <strong>{service.name}</strong>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {service.durationMinutes} min · {formatMinorUnits(service.priceMinor, service.currencyCode)}
        {date ? ` · ${formatDate(date)}` : ""}
        {time ? ` às ${time}` : ""}
      </p>
    </div>
  );
}

function Actions({
  back,
  next,
  label,
  disabled,
}: Readonly<{
  back: () => void;
  next: () => void;
  label: string;
  disabled?: boolean;
}>) {
  return (
    <div className="mt-7 flex gap-3">
      <button
        type="button"
        onClick={back}
        className="min-h-12 rounded-lg border border-[var(--border)] px-5"
      >
        Voltar
      </button>
      <button
        type="button"
        onClick={next}
        disabled={disabled}
        className="min-h-12 flex-1 rounded-lg bg-[var(--accent)] px-5 font-semibold text-white disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}/${month}/${year}` : value;
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
