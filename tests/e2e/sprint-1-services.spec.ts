import { expect, test } from "@playwright/test";

test.describe.serial("Sprint 1 Service vertical slice", () => {
  test("request without session is redirected to login", async ({ page }) => {
    await page.goto("/admin/servicos");

    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });

  test("authenticated user not mapped to Business is denied", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-mail").fill("other@example.test");
    await page.getByLabel("Senha").fill("e2e-password-strong");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(
      page.getByText("Você não tem acesso administrativo a este negócio."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("admin logs in, creates, edits, and deactivates a persisted Service", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-mail").fill("admin@example.test");
    await page.getByLabel("Senha").fill("e2e-password-strong");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/admin\/servicos$/);
    await expect(page.getByRole("heading", { name: "Serviços", level: 1 })).toBeVisible();

    const authenticatedResponse = await page.goto("/admin/servicos");
    expect(authenticatedResponse?.headers()["cache-control"]).toContain("private");
    expect(authenticatedResponse?.headers()["cache-control"]).toContain("no-store");

    await page.getByRole("button", { name: "Novo serviço" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Consulta de orientação");
    await page.getByLabel(/Descrição/).fill("Encontro individual.");
    await page.getByLabel("Preço").fill("145,90");
    await page.getByLabel("Duração (min)").fill("55");
    await page.getByRole("button", { name: "Criar serviço" }).click();

    await expect(page.getByRole("heading", { name: "Consulta de orientação" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Consulta de orientação" })).toBeVisible();
    await expect(page.getByText("R$ 145,90")).toBeVisible();

    await page.goto("/admin/servicos");
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Consulta personalizada");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("heading", { name: "Consulta personalizada" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Consulta personalizada" })).toBeVisible();
    await expect(page.getByText("Consulta de orientação")).toHaveCount(0);

    await page.goto("/admin/servicos");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Desativar" }).click();
    await expect(page.getByLabel("Status: Inativo")).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("Consulta personalizada")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Nenhum serviço disponível no momento." }),
    ).toBeVisible();
  });
});
