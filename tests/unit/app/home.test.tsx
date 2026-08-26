import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublicServiceCatalog } from "@/components/public/service-catalog";

describe("public Service catalog", () => {
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
    expect(screen.getByText("R$ 123,45")).toBeInTheDocument();
    expect(screen.queryByText(/escolher data/i)).not.toBeInTheDocument();
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
