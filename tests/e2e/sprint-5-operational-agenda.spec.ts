import { expect, test } from "@playwright/test";

test.describe.serial("Sprint 5 operational agenda", () => {
  test("admin creates a manual booking, opens details, completes it and finds the customer", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/admin/login");
    await page.getByLabel("E-mail").fill("admin@example.test");
    await page.getByLabel("Senha").fill("e2e-password-strong");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin\/servicos$/);

    await page.getByRole("button", { name: "Novo serviço" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Corte Sprint 5");
    await page.getByLabel("Preço").fill("65,00");
    await page.getByLabel("Duração (min)").fill("45");
    await page.getByRole("button", { name: "Criar serviço" }).click();

    await page.goto("/admin/horarios");
    const monday = page.getByRole("checkbox", { name: "Segunda", exact: true });
    if (!(await monday.isChecked())) await monday.check();
    await page.getByLabel("Início", { exact: true }).fill("09:00");
    await page.getByLabel("Fim", { exact: true }).fill("18:00");
    await page.getByLabel("Adicionar pausa").uncheck();
    await page.getByRole("button", { name: "Aplicar aos dias selecionados" }).click();
    const replace = page.getByRole("button", { name: "Confirmar e substituir" });
    if (await replace.isVisible()) await replace.click();

    await page.goto("/admin/agenda/novo");
    await page.getByRole("button", { name: /Corte Sprint 5/ }).click();
    await page.getByRole("button", { name: /31\/08\/2026/ }).click();
    await page.getByRole("button", { name: "16:00", exact: true }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByLabel("Nome").fill("Cliente Operacional");
    await page.getByLabel("WhatsApp").fill("61995550123");
    await page.getByRole("button", { name: "Revisar" }).click();
    await expect(page.getByText("Origem: agenda administrativa")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();

    await expect(page.getByRole("heading", { name: "Detalhes" })).toBeVisible();
    await expect(page.getByText("Cliente Operacional")).toBeVisible();
    await expect(page.getByText("Agenda administrativa")).toBeVisible();
    await expect(page.getByRole("link", { name: "Chamar no WhatsApp" })).toHaveAttribute("href", "https://wa.me/5561995550123");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Concluir" }).click();
    await expect(page.getByText("Concluído", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Clientes" }).click();
    await page.getByLabel("Buscar por nome ou WhatsApp").fill("Cliente Operacional");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("link", { name: /Cliente Operacional/ }).click();
    await expect(page.getByRole("heading", { name: "Cliente Operacional" })).toBeVisible();
    await expect(page.getByText(/Corte Sprint 5/)).toBeVisible();
  });

  test("admin routes reject unauthenticated access", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/admin/hoje");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await context.close();
  });
});
