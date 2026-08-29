import { expect, test } from "@playwright/test";

test.describe.serial("Sprint 2 weekly availability vertical slice", () => {
  test("weekly availability denies a request without session", async ({ page }) => {
    await page.goto("/admin/horarios");

    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });

  test("admin configures a working day and break that persist after reload", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-mail").fill("admin@example.test");
    await page.getByLabel("Senha").fill("e2e-password-strong");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/admin\/servicos$/);
    await page.getByRole("link", { name: "Horários" }).click();
    await expect(page).toHaveURL(/\/admin\/horarios$/);
    await expect(
      page.getByRole("heading", { name: "Horários padrão", level: 1 }),
    ).toBeVisible();

    const authenticatedResponse = await page.goto("/admin/horarios");
    expect(authenticatedResponse?.headers()["cache-control"]).toContain("private");
    expect(authenticatedResponse?.headers()["cache-control"]).toContain("no-store");

    await page
      .getByRole("button", { name: "Adicionar faixa em Segunda-feira" })
      .click();
    await page.getByLabel("Início da faixa de Segunda-feira").fill("09:00");
    await page.getByLabel("Fim da faixa de Segunda-feira").fill("18:00");
    await page.getByRole("button", { name: "Salvar faixa" }).click();
    await expect(page.getByText("09:00–18:00", { exact: true }).first()).toBeVisible();

    await page
      .getByRole("button", { name: "Adicionar pausa em Segunda-feira" })
      .click();
    await page.getByLabel("Início da pausa de Segunda-feira").fill("12:00");
    await page.getByLabel("Fim da pausa de Segunda-feira").fill("13:00");
    await page.getByRole("button", { name: "Salvar pausa" }).click();
    await expect(page.getByText("12:00–13:00", { exact: true }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByText("09:00–18:00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("12:00–13:00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/America\/Sao_Paulo/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Domingo" })).toBeVisible();
    const dayAdjustments = page.getByRole("heading", {
      name: "Ajustes por dia",
    }).locator("..");
    await expect(dayAdjustments.getByText("Não trabalha")).toHaveCount(6);

    await page.getByRole("checkbox", { name: "Quarta", exact: true }).check();
    await page.getByRole("checkbox", { name: "Quinta", exact: true }).check();
    await page.getByRole("checkbox", { name: "Sexta", exact: true }).check();
    await page.getByRole("button", {
      name: "Aplicar aos dias selecionados",
    }).click();
    await expect(page.getByText("08:00–20:00", { exact: true }).first()).toBeVisible();

    await page.getByRole("checkbox", { name: "Quarta", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "Quinta", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "Sexta", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "Segunda", exact: true }).check();
    await page.getByRole("button", {
      name: "Aplicar aos dias selecionados",
    }).click();
    await expect(page.getByText("Substituir horários existentes?")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar e substituir" }).click();
    await expect(page.getByText("Substituir horários existentes?"))
      .toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Resumo da semana" })).toBeVisible();
    await expect(page.getByText("08:00–20:00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Pausa 12:00–13:30", { exact: true }).first()).toBeVisible();

    for (const day of ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]) {
      await page.getByRole("checkbox", { name: day, exact: true }).check();
    }
    await page.getByLabel("Fim da pausa", { exact: true }).fill("14:00");
    await expect(page.getByRole("checkbox", { name: "Domingo", exact: true }))
      .not.toBeChecked();
    await expect(page.getByText(/Será aplicado em: Segunda-feira.+Sábado/))
      .toBeVisible();
    await page.getByRole("button", {
      name: "Aplicar aos dias selecionados",
    }).click();
    await page.getByRole("button", { name: "Confirmar e substituir" }).click();
    await expect(page.getByText("Substituir horários existentes?"))
      .toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("listitem", { name: "Resumo de Sábado" }))
      .toContainText("Pausa 12:00–14:00");
    await expect(page.getByRole("listitem", { name: "Resumo de Domingo" }))
      .toContainText("Não trabalha");

    for (const day of ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]) {
      await page.getByRole("checkbox", { name: day, exact: true }).check();
    }
    await page.getByRole("button", {
      name: "Aplicar aos dias selecionados",
    }).click();
    await page.getByRole("button", { name: "Confirmar e substituir" }).click();
    await expect(page.getByText("Substituir horários existentes?"))
      .toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("listitem", { name: "Resumo de Sábado" }))
      .toContainText("08:00–20:00");
    await expect(page.getByRole("listitem", { name: "Resumo de Sábado" }))
      .toContainText("Pausa 12:00–14:00");
    await expect(page.getByRole("listitem", { name: "Resumo de Domingo" }))
      .toContainText("Não trabalha");

    for (const day of ["Terça", "Quinta", "Sábado"]) {
      await page.getByRole("checkbox", { name: day, exact: true }).check();
    }
    await page.getByLabel("Início", { exact: true }).fill("10:00");
    await page.getByLabel("Fim", { exact: true }).fill("18:00");
    await page.getByRole("button", {
      name: "Aplicar aos dias selecionados",
    }).click();
    await page.getByRole("button", { name: "Confirmar e substituir" }).click();
    await expect(page.getByText("Substituir horários existentes?"))
      .toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("listitem", { name: "Resumo de Terça-feira" }))
      .toContainText("10:00–18:00");
    await expect(page.getByRole("listitem", { name: "Resumo de Terça-feira" }))
      .toContainText("Pausa 12:00–13:30");
    await expect(page.getByRole("listitem", { name: "Resumo de Quarta-feira" }))
      .toContainText("08:00–20:00");
    await expect(page.getByRole("listitem", { name: "Resumo de Quarta-feira" }))
      .toContainText("Pausa 12:00–13:30");
    await expect(page.getByRole("listitem", { name: "Resumo de Sábado" }))
      .toContainText("10:00–18:00");
    await expect(page.getByRole("listitem", { name: "Resumo de Sábado" }))
      .toContainText("Pausa 12:00–13:30");
    await expect(page.getByRole("listitem", { name: "Resumo de Domingo" }))
      .toContainText("Não trabalha");

    await page.getByRole("checkbox", { name: "Segunda", exact: true }).check();
    await page.getByRole("button", {
      name: "Aplicar aos dias selecionados",
    }).click();
    await expect(page.getByText("Substituir horários existentes?")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await page.reload();
    await expect(page.getByRole("listitem", { name: "Resumo de Segunda-feira" }))
      .toContainText("08:00–20:00");
  });
});
