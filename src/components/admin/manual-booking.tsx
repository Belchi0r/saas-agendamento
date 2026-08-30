"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ServiceView } from "@/application/services/service-view";
import { normalizeBrazilianWhatsapp } from "@/domain/booking/public-booking";
import { formatMinorUnits } from "@/shared/money/minor-units";
import { maskBrazilianWhatsappInput } from "@/components/public/brazilian-whatsapp";

type Step = "SERVICE" | "DATE" | "TIME" | "CUSTOMER" | "REVIEW";
type DateOption = { localDate: string; status: string; firstAvailableLocalTime: string | null };
type Slot = { startLocalTime: string; startAtUtc: string };

export function ManualBooking({ services }: Readonly<{ services: ServiceView[] }>) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("SERVICE");
  const [serviceId, setServiceId] = useState("");
  const [dates, setDates] = useState<DateOption[]>([]);
  const [localDate, setLocalDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [localTime, setLocalTime] = useState("");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef("");
  const service = services.find((item) => item.id === serviceId) ?? null;
  const resetIntent = () => { idempotencyKey.current = ""; };

  async function chooseService(id: string) {
    setServiceId(id); resetIntent(); setBusy(true); setError(""); setStep("DATE");
    try {
      const response = await fetch(`/api/admin/availability/dates?serviceId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json() as { availability?: { dates: DateOption[] }; error?: { message?: string } };
      if (!response.ok || !body.availability) throw new Error(body.error?.message ?? "Não foi possível buscar datas.");
      setDates(body.availability.dates.filter((date) => date.status === "AVAILABLE"));
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function chooseDate(date: string) {
    if (!service) return;
    setLocalDate(date); setLocalTime(""); resetIntent(); setStep("TIME"); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/availability?serviceId=${encodeURIComponent(service.id)}&localDate=${date}`, { cache: "no-store" });
      const body = await response.json() as { availability?: { slots: Slot[] }; error?: { message?: string } };
      if (!response.ok || !body.availability) throw new Error(body.error?.message ?? "Não foi possível buscar horários.");
      setSlots(body.availability.slots);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  function review() {
    try { normalizeBrazilianWhatsapp(whatsapp); setError(""); setStep("REVIEW"); }
    catch { setError("Digite um WhatsApp válido com DDD."); }
  }

  async function confirm() {
    if (!service) return;
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({ serviceId: service.id, localDate, localTime, customerName: name, whatsappE164: whatsapp,
          reviewedService: { version: service.version, name: service.name, durationMinutes: service.durationMinutes, priceMinor: service.priceMinor, currencyCode: service.currencyCode } }),
      });
      const body = await response.json() as { booking?: { appointment: { appointmentId: string } }; error?: { code?: string; message?: string } };
      if (!response.ok || !body.booking) {
        if (body.error?.code === "BOOKING_SLOT_UNAVAILABLE") { idempotencyKey.current = ""; await chooseDate(localDate); }
        throw new Error(body.error?.message ?? "Não foi possível criar o agendamento.");
      }
      router.push(`/admin/agenda/${body.booking.appointment.appointmentId}`);
      router.refresh();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  return <section className="mt-6">
    <Progress step={step} />
    {error ? <p role="alert" className="mt-4 border-l-4 border-[var(--danger)] bg-[var(--surface)] p-4 text-sm">{error}</p> : null}
    {step === "SERVICE" ? <div className="mt-6"><h2 className="text-xl font-semibold">Escolha o serviço</h2><ul className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">{services.map((item) => <li key={item.id}><button className="flex min-h-20 w-full items-center justify-between py-4 text-left" onClick={() => void chooseService(item.id)}><span><strong>{item.name}</strong><span className="mt-1 block text-sm text-[var(--muted)]">{item.durationMinutes} min · {formatMinorUnits(item.priceMinor, item.currencyCode)}</span></span><span>→</span></button></li>)}</ul></div> : null}
    {step === "DATE" && service ? <div className="mt-6"><Summary service={service}/><h2 className="mt-5 text-xl font-semibold">Escolha a data</h2>{busy ? <p className="mt-3 text-[var(--muted)]">Buscando datas…</p> : <ul className="mt-3 grid gap-3">{dates.map((date) => <li key={date.localDate}><button onClick={() => void chooseDate(date.localDate)} className="min-h-14 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-left font-semibold">{formatDate(date.localDate)} <span className="float-right text-sm text-[var(--muted)]">a partir de {date.firstAvailableLocalTime}</span></button></li>)}</ul>}<Back onClick={() => setStep("SERVICE")}/></div> : null}
    {step === "TIME" && service ? <div className="mt-6"><Summary service={service} extra={formatDate(localDate)}/><h2 className="mt-5 text-xl font-semibold">Escolha o horário</h2>{busy ? <p className="mt-3">Buscando horários…</p> : <div className="mt-3 grid grid-cols-3 gap-3">{slots.map((slot) => <button key={slot.startAtUtc} onClick={() => { setLocalTime(slot.startLocalTime); resetIntent(); }} aria-pressed={localTime === slot.startLocalTime} className={`min-h-12 rounded-md border font-semibold ${localTime === slot.startLocalTime ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)]"}`}>{slot.startLocalTime}</button>)}</div>}<Actions back={() => setStep("DATE")} next={() => setStep("CUSTOMER")} disabled={!localTime}/></div> : null}
    {step === "CUSTOMER" && service ? <div className="mt-6"><Summary service={service} extra={`${formatDate(localDate)} às ${localTime}`}/><h2 className="mt-5 text-xl font-semibold">Dados do cliente</h2><label className="mt-4 block text-sm font-semibold">Nome<input value={name} onChange={(event) => { setName(event.target.value); resetIntent(); }} className="mt-2 min-h-12 w-full rounded-md border border-[var(--border)] bg-white px-4"/></label><label className="mt-4 block text-sm font-semibold">WhatsApp<input type="tel" inputMode="tel" value={whatsapp} onChange={(event) => { setWhatsapp(maskBrazilianWhatsappInput(event.target.value)); resetIntent(); }} placeholder="(61) 99440-2561" className="mt-2 min-h-12 w-full rounded-md border border-[var(--border)] bg-white px-4"/></label><Actions back={() => setStep("TIME")} next={review} label="Revisar" disabled={name.trim().length < 2 || whatsapp.length < 8}/></div> : null}
    {step === "REVIEW" && service ? <div className="mt-6"><h2 className="text-xl font-semibold">Revise o agendamento</h2><div className="mt-4 space-y-2 bg-[var(--surface)] p-5"><p><strong>{service.name}</strong></p><p>{formatDate(localDate)} às {localTime}</p><p>{service.durationMinutes} min · {formatMinorUnits(service.priceMinor, service.currencyCode)}</p><p>{name}</p><p>{whatsapp}</p><p className="text-sm text-[var(--muted)]">Origem: agenda administrativa</p></div><Actions back={() => setStep("CUSTOMER")} next={() => void confirm()} label={busy ? "Confirmando…" : "Confirmar agendamento"} disabled={busy}/></div> : null}
  </section>;
}

function Progress({ step }: { step: Step }) { const steps: Step[] = ["SERVICE","DATE","TIME","CUSTOMER","REVIEW"]; const labels = ["Serviço","Data","Horário","Cliente","Revisão"]; return <ol aria-label="Progresso" className="grid grid-cols-5 gap-1">{steps.map((value,index) => <li key={value} aria-current={value === step ? "step" : undefined} className={`border-t-2 pt-2 text-center text-[0.65rem] ${steps.indexOf(step) >= index ? "border-[var(--accent)] font-semibold" : "border-[var(--border)] text-[var(--muted)]"}`}>{labels[index]}</li>)}</ol>; }
function Summary({ service, extra }: { service: ServiceView; extra?: string }) { return <p className="border-l-2 border-[var(--accent)] pl-4"><strong>{service.name}</strong><span className="block text-sm text-[var(--muted)]">{service.durationMinutes} min{extra ? ` · ${extra}` : ""}</span></p>; }
function Back({ onClick }: { onClick: () => void }) { return <button onClick={onClick} className="mt-6 min-h-12 rounded-md border border-[var(--border)] px-5">Voltar</button>; }
function Actions({ back, next, label = "Continuar", disabled }: { back: () => void; next: () => void; label?: string; disabled?: boolean }) { return <div className="mt-6 flex gap-3"><button onClick={back} className="min-h-12 rounded-md border border-[var(--border)] px-5">Voltar</button><button onClick={next} disabled={disabled} className="min-h-12 flex-1 rounded-md bg-[var(--accent)] px-5 font-semibold text-white disabled:opacity-50">{label}</button></div>; }
function formatDate(value: string) { const [y,m,d] = value.split("-"); return d && m && y ? `${d}/${m}/${y}` : value; }
function message(cause: unknown) { return cause instanceof Error ? cause.message : "Não foi possível continuar."; }
