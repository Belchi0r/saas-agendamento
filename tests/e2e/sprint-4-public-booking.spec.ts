import { expect, test, type Page } from "@playwright/test";

async function reachBookingReview(
  page: Page,
  customerName: string,
  whatsapp: string,
) {
  await page.goto("/");
  await page.getByRole("button", { name: /Corte público E2E/ }).click();
  await page
    .getByRole("button", { name: "Escolher terça-feira, 1 de setembro" })
    .click();
  await page.getByRole("button", { name: "09:00", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(customerName);
  await page.getByLabel("WhatsApp").fill(whatsapp);
  await expect(page.getByLabel("WhatsApp")).toHaveValue(
    whatsapp === "61994402561" ? "(61) 99440-2561" : "(61) 99440-2562",
  );
  await page.getByRole("button", { name: "Revisar" }).click();
  await expect(page.getByText("01/09/2026 às 09:00")).toBeVisible();
}

test.describe.serial("Sprint 4 public booking vertical slice", () => {
  test("customer books a persisted slot and opens it through the fragment capability", async ({
    page,
    context,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-mail").fill("admin@example.test");
    await page.getByLabel("Senha").fill("e2e-password-strong");
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.getByRole("button", { name: "Novo serviço" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Corte público E2E");
    await page.getByLabel("Preço").fill("75,00");
    await page.getByLabel("Duração (min)").fill("45");
    await page.getByRole("button", { name: "Criar serviço" }).click();
    await expect(
      page.getByRole("heading", { name: "Corte público E2E" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Novo serviço" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Barba 50 min E2E");
    await page.getByLabel("Preço").fill("80,00");
    await page.getByLabel("Duração (min)").fill("50");
    await page.getByRole("button", { name: "Criar serviço" }).click();
    await expect(
      page.getByRole("heading", { name: "Barba 50 min E2E" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Horários" }).click();
    await page.getByRole("checkbox", { name: "Terça", exact: true }).check();
    await page.getByLabel("Início", { exact: true }).fill("09:00");
    await page.getByLabel("Fim", { exact: true }).fill("12:00");
    await page.getByLabel("Adicionar pausa").uncheck();
    await page.getByRole("button", {
      name: "Aplicar aos dias selecionados",
    }).click();
    const confirmReplacement = page.getByRole("button", {
      name: "Confirmar e substituir",
    });
    if (await confirmReplacement.isVisible()) {
      await confirmReplacement.click();
    }
    await expect(page.getByRole("listitem", { name: "Resumo de Terça-feira" }))
      .toContainText("09:00–12:00");

    await page.goto("/");
    await page.getByRole("button", { name: /Barba 50 min E2E/ }).click();
    await page
      .getByRole("button", { name: "Escolher terça-feira, 1 de setembro" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Escolha o horário" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "11:00", exact: true }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "11:15", exact: true }))
      .toHaveCount(0);

    await page.goto("/");
    await page.getByRole("button", { name: /Corte público E2E/ }).click();
    await page
      .getByRole("button", { name: "Escolher terça-feira, 1 de setembro" })
      .click();
    await expect(page.getByRole("button", { name: "11:15", exact: true }))
      .toBeVisible();

    await page.goto("/");
    await page.getByRole("button", { name: /Barba 50 min E2E/ }).click();
    await page
      .getByRole("button", { name: "Escolher terça-feira, 1 de setembro" })
      .click();

    await page.getByRole("button", { name: "11:00", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Cliente 50 min");
    await page.getByLabel("WhatsApp").fill("61994402560");
    await expect(page.getByLabel("WhatsApp"))
      .toHaveValue("(61) 99440-2560");
    await page.getByRole("button", { name: "Revisar" }).click();
    await expect(page.getByText("01/09/2026 às 11:00")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    await expect(
      page.getByRole("heading", { name: "Agendamento confirmado" }),
    ).toBeVisible();
    await expect(page.getByText("Barba 50 min E2E", { exact: true }))
      .toBeVisible();
    await expect(page.getByText("50 min · R$ 80,00", { exact: true }))
      .toBeVisible();

    const competitorPage = await context.newPage();
    await reachBookingReview(page, "Cliente E2E", "61994402561");
    await reachBookingReview(competitorPage, "Cliente concorrente", "61994402562");

    await page.getByRole("button", { name: "Confirmar agendamento" }).click();

    await expect(
      page.getByRole("heading", { name: "Agendamento confirmado" }),
    ).toBeVisible();
    await competitorPage
      .getByRole("button", { name: "Confirmar agendamento" })
      .click();
    await expect(
      competitorPage.getByText(
        "Esse horário acabou de ser reservado. Escolha outro horário.",
      ),
    ).toBeVisible();
    await expect(
      competitorPage.getByRole("heading", { name: "Escolha o horário" }),
    ).toBeVisible();
    const managementLink = page.getByRole("link", {
      name: "Gerenciar agendamento",
    });
    await expect(managementLink).toHaveAttribute("href", "/manage");
    await expect(page.getByText(/Acesso seguro salvo neste navegador/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Você tem um agendamento" }))
      .toBeVisible();
    await expect(page.getByText("Corte público E2E · 01/09/2026 às 09:00"))
      .toBeVisible();
    await page.getByRole("link", { name: "Ver meu agendamento" }).click();

    await expect(page).toHaveURL(/\/manage$/);
    await expect(page.getByRole("heading", { name: "Confirmado" })).toBeVisible();
    await expect(page.getByText("01/09/2026 às 09:00")).toBeVisible();
    await expect(page.getByText("Cliente E2E")).toBeVisible();
    await expect(page.getByText("(61) 99440-2561")).toBeVisible();
    await expect(page.getByText("Gerenciamento somente para consulta")).toBeVisible();
    await expect(page).not.toHaveURL(/#token=/);

    await page.goto("/admin/horarios");
    await page.getByRole("button", {
      name: "Editar faixa 09:00–12:00 de Terça-feira",
    }).click();
    await page.getByLabel("Início da faixa de Terça-feira").fill("10:00");
    await page.getByRole("button", { name: "Salvar faixa" }).click();
    await expect(page.getByRole("heading", {
      name: "Agendamentos fora dos horários atuais",
    })).toBeVisible();
    await expect(page.getByText(/1 agendamento futuro continua confirmado/)).toBeVisible();

    await page.goto("/manage");
    await expect(page.getByRole("heading", { name: "Confirmado" })).toBeVisible();
    await expect(page.getByText("01/09/2026 às 09:00")).toBeVisible();
  });
});
