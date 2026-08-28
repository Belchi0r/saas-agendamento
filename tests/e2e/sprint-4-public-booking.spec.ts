import { expect, test } from "@playwright/test";

test.describe.serial("Sprint 4 public booking vertical slice", () => {
  test("customer books a persisted slot and opens it through the fragment capability", async ({
    page,
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

    await page.getByRole("link", { name: "Horários" }).click();
    await page
      .getByRole("button", { name: "Adicionar faixa em Terça-feira" })
      .click();
    await page.getByLabel("Início da faixa de Terça-feira").fill("09:00");
    await page.getByLabel("Fim da faixa de Terça-feira").fill("12:00");
    await page.getByRole("button", { name: "Salvar faixa" }).click();
    await expect(page.getByText("09:00–12:00", { exact: true })).toBeVisible();

    await page.goto("/");
    await page.getByRole("button", { name: /Corte público E2E/ }).click();
    await page
      .getByRole("button", { name: "Escolher terça-feira, 1 de setembro" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Escolha o horário" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "09:00", exact: true }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Cliente E2E");
    await page.getByLabel("WhatsApp").fill("+55 61 99999-0101");
    await page.getByRole("button", { name: "Revisar" }).click();
    await expect(page.getByText("01/09/2026 às 09:00")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();

    await expect(
      page.getByRole("heading", { name: "Agendamento confirmado" }),
    ).toBeVisible();
    const managementLink = page.getByRole("link", {
      name: "Gerenciar agendamento",
    });
    await expect(managementLink).toHaveAttribute("href", /\/manage#token=/);
    await managementLink.click();

    await expect(page).toHaveURL(/\/manage$/);
    await expect(page.getByRole("heading", { name: "Confirmado" })).toBeVisible();
    await expect(page.getByText("01/09/2026 às 09:00")).toBeVisible();
    await expect(page.getByText("Agendado para Cliente E2E.")).toBeVisible();
    await expect(page).not.toHaveURL(/#token=/);
  });
});
