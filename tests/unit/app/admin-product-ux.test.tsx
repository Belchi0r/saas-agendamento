import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminNavigation } from "@/components/admin/admin-navigation";
import { ServiceManager } from "@/components/admin/service-manager";
import { WeeklyAvailabilityManager } from "@/components/admin/weekly-availability-manager";

describe("Sprint 4.2 admin product UX", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("distinguishes active and inactive services with accessible status and explicit facts", () => {
    render(
      <ServiceManager
        currencyCode="BRL"
        initialServices={[
          service("active", "Corte", true),
          service("inactive", "Barba", false),
        ]}
      />,
    );

    expect(screen.getByLabelText("Status: Ativo")).toHaveTextContent("✓ Ativo");
    expect(screen.getByLabelText("Status: Inativo")).toHaveTextContent("— Inativo");
    expect(screen.getByLabelText("Status: Ativo").closest("li")).toHaveAttribute(
      "data-status",
      "active",
    );
    expect(screen.getAllByText("Preço", { selector: "dt" })).toHaveLength(2);
    expect(screen.getAllByText("Duração", { selector: "dt" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Desativar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ativar" })).toBeVisible();
  });

  it("shows a compact weekly summary including closed days and breaks", () => {
    render(<WeeklyAvailabilityManager initialAvailability={availability()} />);

    const summary = screen.getByRole("heading", {
      name: "Resumo da semana",
    }).closest("section");
    expect(summary).not.toBeNull();
    expect(within(summary!).getByText("09:00–18:00")).toBeVisible();
    expect(within(summary!).getByText("Pausa 12:00–13:00")).toBeVisible();
    expect(within(summary!).getAllByText("Não trabalha")).toHaveLength(6);
  });

  it("requires confirmation before replacing configured days in one request", async () => {
    const nextAvailability = {
      ...availability(),
      availabilityVersion: 4,
      workingWindows: [1, 2].map((weekday) => ({
        id: `work-${weekday}`,
        weekday,
        startLocalTime: "08:00",
        endLocalTime: "20:00",
      })),
      breaks: [1, 2].map((weekday) => ({
        id: `break-${weekday}`,
        weekday,
        startLocalTime: "12:00",
        endLocalTime: "13:30",
      })),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ availability: nextAvailability }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WeeklyAvailabilityManager initialAvailability={availability()} />);

    await user.click(screen.getByLabelText("Segunda"));
    await user.click(screen.getByLabelText("Terça"));
    await user.click(screen.getByRole("button", {
      name: "Aplicar aos dias selecionados",
    }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Substituir horários existentes?")).toBeVisible();
    await user.click(screen.getByRole("button", {
      name: "Confirmar e substituir",
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toMatchObject({
      weekdays: [1, 2],
      confirmReplaceExisting: true,
      expectedAvailabilityVersion: 3,
    });
  });

  it("marks the current admin destination and does not add Sprint 5 navigation", () => {
    render(<AdminNavigation active="weekly" />);
    expect(screen.getByRole("link", { name: "Horários" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("link", { name: "Agendamentos" })).not.toBeInTheDocument();
  });
});

function service(id: string, name: string, active: boolean) {
  return {
    id,
    name,
    description: null,
    priceMinor: 5_000,
    currencyCode: "BRL",
    durationMinutes: 45,
    active,
    version: 1,
  };
}

function availability() {
  return {
    timezone: "America/Sao_Paulo",
    availabilityVersion: 3,
    workingWindows: [{
      id: "monday",
      weekday: 1,
      startLocalTime: "09:00",
      endLocalTime: "18:00",
    }],
    breaks: [{
      id: "lunch",
      weekday: 1,
      startLocalTime: "12:00",
      endLocalTime: "13:00",
    }],
  };
}
