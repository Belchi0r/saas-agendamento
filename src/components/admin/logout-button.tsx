"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    setSubmitting(true);

    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  return (
    <button
      className="text-sm font-semibold text-[var(--muted)] underline decoration-[var(--border)] underline-offset-4"
      type="button"
      onClick={logout}
      disabled={submitting}
    >
      {submitting ? "Saindo…" : "Sair"}
    </button>
  );
}
