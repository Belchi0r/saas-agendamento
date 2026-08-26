import { expect, test } from "@playwright/test";

test.describe.serial("Sprint 3 date exceptions and blocked periods", () => {
  test("special-date administration denies a request without session", async ({
    page,
  }) => {
    await page.goto("/admin/datas-especiais");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("admin persists a special date and a point blocked period", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-mail").fill("admin@example.test");
    await page.getByLabel("Senha").fill("e2e-password-strong");
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.getByRole("link", { name: "Datas especiais" }).click();
    await expect(
      page.getByRole("heading", { name: "Datas especiais", level: 1 }),
    ).toBeVisible();
    const authenticatedResponse = await page.goto("/admin/datas-especiais");
    expect(authenticatedResponse?.headers()["cache-control"]).toContain("private");
    expect(authenticatedResponse?.headers()["cache-control"]).toContain("no-store");

    await page.getByRole("button", { name: "Adicionar data especial" }).click();
    await page.getByLabel("Data").fill("2026-12-24");
    await page.getByLabel("Horário especial").check();
    await page.getByLabel("Início da faixa 1").fill("09:00");
    await page.getByLabel("Fim da faixa 1").fill("13:00");
    await page.getByLabel("Nota privada (opcional)").fill("Véspera");
    await page.getByRole("button", { name: "Salvar data especial" }).click();
    await expect(page.getByText("2026-12-24", { exact: true })).toBeVisible();
    await expect(page.getByText("09:00–13:00", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("09:00–13:00", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Bloqueios" }).click();
    await page.getByRole("button", { name: "Bloquear período" }).click();
    await page.getByLabel("Data").fill("2026-12-24");
    await page.getByLabel("Início").fill("10:00");
    await page.getByLabel("Fim").fill("11:00");
    await page.getByLabel("Motivo privado (opcional)").fill("Manutenção");
    await page.getByRole("button", { name: "Salvar bloqueio" }).click();
    await expect(page.getByText("2026-12-24 · 10:00–11:00")).toBeVisible();
    await page.reload();
    await expect(page.getByText("2026-12-24 · 10:00–11:00")).toBeVisible();
  });
});
