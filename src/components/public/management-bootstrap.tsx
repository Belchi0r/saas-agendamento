"use client";

import { useEffect, useState } from "react";
export function ManagementBootstrap() {
  const [message, setMessage] = useState("Validando seu acesso…");
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", "/manage");
    if (!token) {
      queueMicrotask(() => setMessage("Este acesso não é válido."));
      return;
    }
    void fetch("/api/public/manage/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then((response) => { if (!response.ok) throw new Error("invalid"); window.location.replace("/manage"); })
      .catch(() => setMessage("Este acesso não é válido."));
  }, []);
  return <p className="mt-4 text-[var(--muted)]">{message}</p>;
}
