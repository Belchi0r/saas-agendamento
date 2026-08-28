"use client";

import { useMemo, useRef, useState } from "react";
import type { ServiceView } from "@/application/services/service-view";
import { formatMinorUnits } from "@/shared/money/minor-units";

type Step = "SERVICE" | "DATE" | "TIME" | "CUSTOMER" | "REVIEW" | "DONE";
type Slot = Readonly<{ startLocalTime: string; startAtUtc: string; endAtUtc: string; offset: string }>;
type Confirmation = { appointment: { serviceName: string; localDate: string; localTime: string; durationMinutes: number; priceMinor: number; currencyCode: string }; managementLink: string };

export function PublicServiceCatalog({ business, services }: Readonly<{ business: Readonly<{ publicName: string | null; publicDescription: string | null }>; services: ServiceView[] }>) {
  const [step, setStep] = useState<Step>("SERVICE");
  const [serviceId, setServiceId] = useState("");
  const [localDate, setLocalDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [localTime, setLocalTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [whatsappE164, setWhatsappE164] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const service = useMemo(() => services.find((item) => item.id === serviceId) ?? null, [serviceId, services]);
  const resetIntent = () => { idempotencyKey.current = null; };

  function chooseService(id: string) {
    setServiceId(id); setLocalDate(""); setLocalTime(""); setSlots([]); setError(""); resetIntent(); setStep("DATE");
  }
  async function loadSlots() {
    if (!service || !localDate) { setError("Escolha uma data."); return; }
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ serviceId: service.id, localDate });
      const response = await fetch(`/api/public/availability?${params}`, { cache: "no-store" });
      const body = await response.json() as { availability?: { slots: Slot[] }; error?: { message: string } };
      if (!response.ok || !body.availability) throw new Error(body.error?.message ?? "Não foi possível buscar os horários.");
      setSlots(body.availability.slots); setLocalTime(""); setStep("TIME");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível buscar os horários."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!service) return;
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key; setBusy(true); setError("");
    try {
      const response = await fetch("/api/public/bookings", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ serviceId: service.id, localDate, localTime, customerName, whatsappE164, reviewedService: { version: service.version, name: service.name, durationMinutes: service.durationMinutes, priceMinor: service.priceMinor, currencyCode: service.currencyCode } }),
      });
      const body = await response.json() as { booking?: Confirmation; error?: { code: string; message: string } };
      if (!response.ok || !body.booking) {
        if (body.error?.code === "BOOKING_SLOT_UNAVAILABLE") { resetIntent(); await loadSlots(); }
        throw new Error(body.error?.message ?? "Não foi possível confirmar. Seu agendamento ainda não foi criado.");
      }
      setConfirmation(body.booking); setStep("DONE");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível confirmar. Seu agendamento ainda não foi criado."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-8 sm:px-8 sm:py-14">
    <header className="border-b border-[var(--border)] pb-6"><p className="text-sm font-semibold tracking-[0.08em] text-[var(--accent)] uppercase">{business.publicName ?? "Agendamento"}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{step === "DONE" ? "Agendamento confirmado" : "Agende seu horário"}</h1>{business.publicDescription && step === "SERVICE" ? <p className="mt-3 leading-7 text-[var(--muted)]">{business.publicDescription}</p> : null}</header>
    {step !== "DONE" ? <p className="mt-5 text-sm text-[var(--muted)]">Serviço · Data · Horário · Dados · Revisão</p> : null}
    {error ? <p role="alert" className="mt-5 border-l-4 border-[var(--danger)] bg-[var(--surface)] p-4 text-sm">{error}</p> : null}
    {step === "SERVICE" && <section className="py-7"><h2 className="text-xl font-semibold">Escolha um serviço</h2>{services.length === 0 ? <h2 className="mt-4 text-lg font-semibold">Nenhum serviço disponível no momento.</h2> : <ul className="mt-3 divide-y divide-[var(--border)]">{services.map((item) => <li key={item.id} className="py-4"><button type="button" onClick={() => chooseService(item.id)} className="w-full rounded-xl bg-[var(--surface)] p-4 text-left shadow-sm"><span className="flex justify-between gap-4"><h2 className="font-semibold">{item.name}</h2><span>{formatMinorUnits(item.priceMinor, item.currencyCode)}</span></span><span className="mt-2 block text-sm text-[var(--muted)]">{item.durationMinutes} min</span>{item.description ? <span className="mt-2 block text-sm text-[var(--muted)]">{item.description}</span> : null}</button></li>)}</ul>}</section>}
    {step === "DATE" && service && <section className="py-7"><Summary service={service} /><h2 className="mt-6 text-xl font-semibold">Escolha a data</h2><label className="mt-4 block text-sm font-medium">Data<input aria-label="Data" type="date" value={localDate} onChange={(event) => { setLocalDate(event.target.value); resetIntent(); }} className="mt-2 min-h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3" /></label><Actions back={() => setStep("SERVICE")} next={() => void loadSlots()} label={busy ? "Buscando…" : "Ver horários"} disabled={busy || !localDate} /></section>}
    {step === "TIME" && service && <section className="py-7"><Summary service={service} date={localDate} /><h2 className="mt-6 text-xl font-semibold">Escolha o horário</h2>{slots.length === 0 ? <p className="mt-4 text-[var(--muted)]">Não há horários disponíveis nesta data.</p> : <div className="mt-4 grid grid-cols-3 gap-3">{slots.map((slot) => <button type="button" key={slot.startAtUtc} onClick={() => { setLocalTime(slot.startLocalTime); resetIntent(); }} aria-pressed={localTime === slot.startLocalTime} className={`min-h-12 rounded-lg border px-3 font-semibold ${localTime === slot.startLocalTime ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-[var(--surface)]"}`}>{slot.startLocalTime}</button>)}</div>}<Actions back={() => setStep("DATE")} next={() => setStep("CUSTOMER")} label="Continuar" disabled={!localTime} /></section>}
    {step === "CUSTOMER" && service && <section className="py-7"><Summary service={service} date={localDate} time={localTime} /><h2 className="mt-6 text-xl font-semibold">Seus dados</h2><label className="mt-4 block text-sm font-medium">Nome<input value={customerName} onChange={(e) => { setCustomerName(e.target.value); resetIntent(); }} className="mt-2 min-h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3" /></label><label className="mt-4 block text-sm font-medium">WhatsApp<input type="tel" placeholder="+55 61 99999-0000" value={whatsappE164} onChange={(e) => { setWhatsappE164(e.target.value); resetIntent(); }} className="mt-2 min-h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3" /></label><p className="mt-3 text-sm text-[var(--muted)]">Usaremos seu nome e WhatsApp para identificar e gerenciar este agendamento.</p><Actions back={() => setStep("TIME")} next={() => setStep("REVIEW")} label="Revisar" disabled={customerName.trim().length < 2 || whatsappE164.trim().length < 8} /></section>}
    {step === "REVIEW" && service && <section className="py-7"><h2 className="text-xl font-semibold">Revise sua reserva</h2><div className="mt-4 space-y-2 rounded-xl bg-[var(--surface)] p-5"><p><strong>{service.name}</strong></p><p>{formatDate(localDate)} às {localTime}</p><p>{service.durationMinutes} min · {formatMinorUnits(service.priceMinor, service.currencyCode)}</p><p>{customerName}</p><p>{whatsappE164}</p></div><Actions back={() => setStep("CUSTOMER")} next={() => void confirm()} label={busy ? "Confirmando…" : "Confirmar agendamento"} disabled={busy} /></section>}
    {step === "DONE" && confirmation && <section className="py-8"><div className="rounded-xl bg-[var(--surface)] p-6"><p className="text-2xl font-semibold">{formatDate(confirmation.appointment.localDate)} às {confirmation.appointment.localTime}</p><p className="mt-3">{confirmation.appointment.serviceName}</p><p className="mt-1 text-[var(--muted)]">{confirmation.appointment.durationMinutes} min · {formatMinorUnits(confirmation.appointment.priceMinor, confirmation.appointment.currencyCode)}</p></div><a href={confirmation.managementLink} rel="noreferrer" className="mt-6 flex min-h-12 items-center justify-center rounded-lg bg-[var(--accent)] px-5 font-semibold text-white">Gerenciar agendamento</a><p className="mt-4 text-sm leading-6 text-[var(--muted)]">Guarde este acesso. Não o compartilhe: ele permite visualizar seu agendamento.</p></section>}
  </main>;
}

function Summary({ service, date, time }: Readonly<{ service: ServiceView; date?: string; time?: string }>) { return <div className="rounded-lg bg-[var(--surface)] p-4"><strong>{service.name}</strong><p className="mt-1 text-sm text-[var(--muted)]">{service.durationMinutes} min · {formatMinorUnits(service.priceMinor, service.currencyCode)}{date ? ` · ${formatDate(date)}` : ""}{time ? ` às ${time}` : ""}</p></div>; }
function Actions({ back, next, label, disabled }: Readonly<{ back: () => void; next: () => void; label: string; disabled?: boolean }>) { return <div className="mt-7 flex gap-3"><button type="button" onClick={back} className="min-h-12 rounded-lg border border-[var(--border)] px-5">Voltar</button><button type="button" onClick={next} disabled={disabled} className="min-h-12 flex-1 rounded-lg bg-[var(--accent)] px-5 font-semibold text-white disabled:opacity-50">{label}</button></div>; }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return day && month && year ? `${day}/${month}/${year}` : value; }
