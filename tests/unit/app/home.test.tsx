import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicServiceCatalog } from "@/components/public/service-catalog";

describe("public Service catalog", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the business identity and service data without booking controls", () => {
    render(
      <PublicServiceCatalog
        business={{ publicName: "Estúdio Horizonte", publicDescription: null }}
        services={[
          {
            id: "service-1",
            name: "Sessão essencial",
            description: "Atendimento individual.",
            priceMinor: 12_345,
            currencyCode: "BRL",
            durationMinutes: 50,
            active: true,
            version: 1,
          },
        ]}
      />,
    );

    expect(screen.getByText("Estúdio Horizonte")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sessão essencial" })).toBeInTheDocument();
    expect(screen.getByText(/123,45/)).toBeInTheDocument();
    expect(screen.queryByText(/escolher data/i)).not.toBeInTheDocument();
    expect(screen.getByText("Escolher")).toBeInTheDocument();
  });

  it("opens the next available dates and loads times directly on date selection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        availability: {
          dates: [
            {
              localDate: "2026-08-31",
              status: "FULLY_BOOKED",
              reason: "OCCUPIED",
              availableSlotCount: 0,
              firstAvailableLocalTime: null,
            },
            {
              localDate: "2026-09-01",
              status: "AVAILABLE",
              reason: null,
              availableSlotCount: 2,
              firstAvailableLocalTime: "09:00",
            },
          ],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        availability: {
          slots: [
            {
              startLocalTime: "09:00",
              startAtUtc: "2026-09-01T12:00:00Z",
              endAtUtc: "2026-09-01T12:45:00Z",
              offset: "-03:00",
            },
          ],
        },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderCatalog();
    await user.click(screen.getByRole("button", { name: /Sessão essencial/ }));

    const dateButton = await screen.findByRole("button", {
      name: "Escolher terça-feira, 1 de setembro",
    });
    expect(screen.queryByRole("button", { name: "Ver horários" })).not.toBeInTheDocument();
    expect(screen.queryByText(/segunda-feira, 31 de agosto/i)).not.toBeInTheDocument();
    expect(screen.getByText("Data").closest("li")).toHaveAttribute("aria-current", "step");

    await user.click(dateButton);
    expect(await screen.findByRole("heading", { name: "Escolha o horário" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "09:00" })).toBeVisible();
    expect(screen.getByText("Horário").closest("li")).toHaveAttribute("aria-current", "step");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("explains a newly full date and offers the next availability", async () => {
    const initiallyAvailable = [
      {
        localDate: "2026-08-31",
        status: "AVAILABLE",
        reason: null,
        availableSlotCount: 1,
        firstAvailableLocalTime: "09:00",
      },
      {
        localDate: "2026-09-07",
        status: "AVAILABLE",
        reason: null,
        availableSlotCount: 3,
        firstAvailableLocalTime: "10:00",
      },
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        availability: { dates: initiallyAvailable },
      }))
      .mockResolvedValueOnce(jsonResponse({ availability: { slots: [] } }))
      .mockResolvedValueOnce(jsonResponse({
        availability: {
          dates: [
            { ...initiallyAvailable[0], status: "FULLY_BOOKED", reason: "OCCUPIED", availableSlotCount: 0, firstAvailableLocalTime: null },
            initiallyAvailable[1],
          ],
        },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderCatalog();
    await user.click(screen.getByRole("button", { name: /Sessão essencial/ }));
    await user.click(await screen.findByRole("button", {
      name: "Escolher segunda-feira, 31 de agosto",
    }));

    expect(await screen.findByText(
      "Não restam horários em segunda-feira, 31 de agosto.",
    )).toBeVisible();
    expect(screen.getByText(
      "Próxima disponibilidade: segunda-feira, 7 de setembro.",
    )).toBeVisible();
    expect(screen.getByRole("button", {
      name: "Ver próxima disponibilidade",
    })).toBeVisible();
  });

  it("shows the approved natural empty state", () => {
    render(
      <PublicServiceCatalog
        business={{ publicName: "Estúdio Horizonte", publicDescription: null }}
        services={[]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Nenhum serviço disponível no momento." }),
    ).toBeInTheDocument();
  });
});

function renderCatalog() {
  render(
    <PublicServiceCatalog
      business={{ publicName: "Estúdio Horizonte", publicDescription: null }}
      services={[
        {
          id: "service-1",
          name: "Sessão essencial",
          description: "Atendimento individual.",
          priceMinor: 12_345,
          currencyCode: "BRL",
          durationMinutes: 50,
          active: true,
          version: 1,
        },
      ]}
    />,
  );
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}
