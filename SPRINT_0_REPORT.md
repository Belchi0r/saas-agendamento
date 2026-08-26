# Sprint 0 — Foundation Report

## Resultado

**PASS**

A fundação real do repositório foi criada e validada sem iniciar Sprint 1 nem implementar features de produto. A aplicação Next.js inicia em Node.js 24, a arquitetura física respeita os boundaries aprovados, o banco possui uma migration oficial mínima, Auth SSR possui factories request-scoped e as verificações de tipos, lint, testes, build, E2E e PostgreSQL real passaram.

## Fontes de verdade incorporadas

As sete revisões aprovadas foram copiadas integralmente para `docs/` com nomes canônicos. A comparação SHA-256 entre Downloads e repositório retornou `Identical=true` para todos os arquivos:

| Arquivo canônico | SHA-256 |
|---|---|
| `BARBER_PRODUCT_DISCOVERY_v1.md` | `70419BCFFC05ADF53ADBAEA3A1C438AEBAB9BBF8E99A66A3B02DA159880EEFE7` |
| `BARBER_PRD_v1.md` | `8CF54A94040754ABF7143383364D7547E17C19311CECCCCB34144E25123EA991` |
| `PRODUCT_DECISION_GENERIC_SCHEDULING_v1.md` | `4C7D3DDB90B7BA890E1160A1D08E62B92FAD94E1B2D9D78808D04191FA0BE5F8` |
| `BARBER_UX_SPEC_v1.md` | `2988BC535493A8028A0A197318C156FF4CA2D4F6288780BDACEC223182288585` |
| `BARBER_ARCHITECTURE_v1.md` | `6E7BCA448F1AFE95849EFBE0810DEEA5C0D78B317871EB30A67C4D37D6DA1607` |
| `BARBER_DATA_MODEL_v1.md` | `23BCEDABB7167EF0EAA6B1DC66703E272F18B463C11605EBF248CB7A1D6E0147` |
| `BARBER_ARCHITECTURE_DECISIONS_v1.md` | `AB2C08BB1AE05C0D6E460A8D970C4E0BB54F249F61D183EBF6DD7577002B6835` |

Os relatórios `SPK-001` a `SPK-006` permanecem inalterados e são tratados somente como evidência.

## Ambiente e versões exatas

| Item | Versão testada |
|---|---:|
| Windows | `win32 x64` |
| Node.js LTS | `24.19.0` |
| npm | `10.9.8` |
| TypeScript | `6.0.3` |
| Next.js | `16.3.2` |
| React / React DOM | `19.2.8` |
| Tailwind CSS / PostCSS plugin | `4.3.3` |
| Zod | `4.4.3` |
| `@supabase/supabase-js` | `2.112.3` |
| `@supabase/ssr` | `0.12.4` |
| Supabase CLI | `2.115.0` |
| Drizzle ORM | `0.45.2` |
| Drizzle Kit | `0.31.10` |
| `pg` | `8.23.0` |
| `@js-temporal/polyfill` | `0.5.1` |
| Vitest | `4.1.11` |
| Testing Library React | `16.3.2` |
| Playwright | `1.62.1` |
| ESLint | `9.39.5` |
| PostgreSQL da integração local | `18.4`, efêmero |
| PostgreSQL configurado para Supabase local/CI | major `17` |

Todas as dependências diretas estão fixadas sem `^`, `~`, beta, RC ou canary. `package-lock.json` é o lockfile oficial. TypeScript 7.0.2 e ESLint 10.9.0, embora estáveis, foram rejeitados durante o bootstrap porque o toolchain atual do `eslint-config-next` não suporta essa combinação; foram selecionadas as linhas estáveis compatíveis acima.

## Estrutura criada

```text
src/
  app/                 página e layout mínimos
  application/         resolução server-side de BusinessScope
  domain/              tipo nominal de BusinessScope, sem adapters
  infrastructure/      Auth SSR/browser, env server-only e Temporal
  persistence/         pool pg, Drizzle, schema privado e contrato scoped
  delivery/            refresh SSR, cache e proteção method/origin/host
  shared/              validação de env e erros comuns
supabase/
  config.toml
  migrations/20260823210417_sprint_0_foundation.sql
tests/
  unit/
  integration/
  e2e/
docs/                  sete fontes de verdade canônicas
.github/workflows/ci.yml
```

Não foram criados módulos, telas, tabelas ou endpoints de booking, catálogo, agenda, dashboard, clientes, onboarding, remarcação, analytics, billing ou multi-business.

## Scripts oficiais

| Script | Finalidade | Resultado observado |
|---|---|---|
| `npm run dev` | servidor Next local | PASS; ready em `127.0.0.1:3200`, `GET /` = `200` |
| `npm run build` | build production | PASS; rota `/` estática e Proxy compilado |
| `npm run typecheck` | TypeScript strict | PASS |
| `npm run lint` | ESLint/Next, zero warnings | PASS |
| `npm test` | unit/component/contratos | PASS; 8 arquivos, 18 testes |
| `npm run test:integration` | PostgreSQL real quando `TEST_DATABASE_URL` existe | PASS; 3/3 no PostgreSQL efêmero; sem URL, 3 skips explícitos |
| `npm run test:e2e` | smoke HTTP Playwright | PASS; 1/1 |
| `npm run db:migration:new -- <nome>` | cria migration oficial | Supabase CLI |
| `npm run db:reset` | recria Supabase local e aplica migrations | preparado; exige stack local/Docker |
| `npm run db:migrate` | aplica migrations em projeto ligado | Supabase CLI |
| `npm run db:generate:candidate` | gera SQL candidato | Drizzle Kit, saída ignorada em `drizzle-candidate/` |

Também foi executado `npm ci` com sucesso para provar instalação determinística.

## Banco e migrations

- `supabase init` e `supabase migration new sprint_0_foundation` foram executados pela Supabase CLI `2.115.0`.
- `app_private` é o schema de domínio e não aparece em `api.schemas`, que contém somente `public` e `graphql_public`.
- `barber_runtime` é uma role de grants `NOLOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOREPLICATION` e `NOBYPASSRLS`.
- A role recebe somente `USAGE` no schema vazio; grants por tabela/coluna serão adicionados pelas migrations das features que realmente criarem essas tabelas.
- Default privileges mantêm tabelas, sequences e routines futuras privadas para `PUBLIC` e roles Data API existentes.
- A migration não administra nem referencia objetos `auth.*` ou `storage.*`.
- `DATABASE_URL` pertence ao runtime server-side com pool máximo pequeno; `MIGRATION_DATABASE_URL` fica separado para DDL/candidato.
- O runtime usa `pg`/Drizzle e não fornece named prepared statements; a URL documenta Supavisor transaction mode.
- Não existe `drizzle push` nos scripts.

### Evidência PostgreSQL real

Em PostgreSQL `18.4` descartável:

1. a Supabase CLI executou `db push --include-all` e aplicou a migration do zero;
2. `app_private` e os atributos da role foram observados no catálogo;
3. `SET LOCAL ROLE barber_runtime` seguido de `CREATE SCHEMA` retornou SQLSTATE `42501`;
4. após `ROLLBACK`, a mesma conexão executou `SELECT 1` com sucesso;
5. 3 testes de integração passaram.

A CI repete a estratégia em `postgres:17`, versão configurada no Supabase local. Nenhum wrapper PostgreSQL beta usado apenas para iniciar o processo local foi adicionado às dependências ou ao lockfile da aplicação.

## Auth e fronteiras server-side

- Browser client contém somente URL pública e publishable key e é explicitamente Auth-only.
- Server client é criado por request e adapta cookies via `getAll`/`setAll` oficial.
- A política administrativa preserva o comportamento validado: `SameSite=Lax`, `Secure` em produção e `HttpOnly=false`; nenhuma garantia falsa de HttpOnly foi introduzida.
- `src/proxy.ts` prepara refresh para `/admin` e `/api/admin` usando `getClaims()`.
- Decisão de autorização revalida identidade com `getUser()`; `getSession()` não é usado.
- Autorização de domínio continua separada: o resolver administrativo exige correspondência por `admin_auth_user_id` e produz `BusinessScope` server-side.
- O resolver público não recebe `business_id` e falha fechado se o singleton estiver ausente ou ambíguo.
- Respostas autenticadas possuem helper `private, no-store` e `Vary: Cookie`.
- Mutações sensíveis possuem guarda estrita de método, Origin e Host, pronta para Route Handlers futuros.
- Não há `service_role`, conexão PostgreSQL ou repositório de domínio no browser.

## Testes

Cobertura de fundação criada:

- página mínima e ausência de feature;
- resolução pública/admin de `BusinessScope`, incluindo ambiguidade e usuário incorreto;
- método/Origin/Host válidos e inválidos;
- cache privado e `no-store`;
- validação tipada de env sem ecoar valores;
- timezone IANA explícito e fronteira temporal adjacente;
- scan de dependências proibidas no Domain;
- scan da superfície browser;
- contrato estático das migrations;
- schema privado, role mínima, DDL negado e recuperação da conexão em PostgreSQL real;
- smoke E2E HTTP da aplicação.

As garantias aprofundadas de concorrência, Auth hospedado, tokens e DST continuam cobertas pelos spikes já concluídos; não foram reexecutadas nem convertidas em features.

## CI

`.github/workflows/ci.yml` define:

1. checkout;
2. Node `24.19.0`;
3. `npm ci`;
4. typecheck;
5. lint;
6. testes unitários/componentes;
7. PostgreSQL 17 efêmero;
8. aplicação das migrations exclusivamente pela Supabase CLI;
9. integração PostgreSQL real;
10. build production.

O job usa somente dados sintéticos e não contém secrets. GitHub Actions não foi executado remotamente nesta máquina; os comandos equivalentes passaram localmente.

## Arquivos principais criados

- raiz: `.env.example`, `.gitignore`, `.npmrc`, `AGENTS.md`, `README.md`, `package.json`, `package-lock.json`, `tsconfig.json` e este relatório;
- framework/tooling: `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.integration.config.ts`, `playwright.config.ts`, `drizzle.config.ts`;
- aplicação: todos os arquivos sob `src/` listados na seção de estrutura;
- banco: `supabase/config.toml` e `supabase/migrations/20260823210417_sprint_0_foundation.sql`;
- testes: 11 arquivos sob `tests/`, incluindo setup, 8 unitários, 1 integração e 1 E2E;
- CI: `.github/workflows/ci.yml`;
- documentação: os sete arquivos canônicos sob `docs/`.

Os diretórios `spikes/` e os documentos originais em Downloads não foram modificados.

## Pequenas decisões de bootstrap

1. **Validação lazy por boundary:** a página/build mínimos não exigem secrets; cada factory valida somente seu grupo de env quando usado.
2. **Publishable key atual:** o browser usa `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; nenhuma secret key é prevista.
3. **Sem tabelas de domínio na Sprint 0:** a migration cria a barreira privada e a role-base, mas deixa grants por coluna junto das futuras tabelas/features.
4. **Proxy restrito:** refresh Auth roda apenas nas superfícies administrativas ainda futuras, sem impor credenciais à página mínima.
5. **Pool compartilhado por instância:** o client PostgreSQL server-only reutiliza um pool pequeno; Auth permanece request-scoped.
6. **E2E sem browser binário:** Playwright usa seu cliente HTTP para provar startup/entrega sem adicionar download de navegador a uma sprint sem UI real.
7. **Signup local desabilitado:** o MVP possui um único admin provisionado; não foi aberto cadastro público administrativo.

## Divergências em relação às fontes

Nenhuma divergência semântica foi introduzida.

- A árvore física usa as sete pastas top-level solicitadas nesta Sprint 0, mantendo a direção aprovada; módulos de feature internos só aparecerão quando houver regra concreta.
- Vercel, Sentry e observabilidade de produção não foram configurados porque ADR-008 continua `PROPOSED` e o escopo autorizou somente a fundação/CI.
- Nenhuma tabela conceitual de `BARBER_DATA_MODEL_v1` foi antecipada como implementação de feature.

## Riscos restantes

1. A documentação atual do Supabase ainda qualifica `@supabase/ssr` como API em evolução. A versão `0.12.4` está fixada e o SPK-005 já validou o fluxo; upgrades exigem revisão de cookies/refresh.
2. ESLint 9 está fora da janela corrente de suporte após o lançamento do ESLint 10, mas os plugins do `eslint-config-next 16.3.2` ainda não aceitam ESLint 10. Atualizar em conjunto quando o peer contract oficial mudar.
3. `npm audit` completo aponta 4 vulnerabilidades moderadas somente na cadeia dev do Drizzle Kit (`@esbuild-kit`/esbuild antigo). `npm audit --omit=dev` retornou zero vulnerabilidades; o fix sugerido faria downgrade incompatível do Drizzle Kit. O gerador candidato não é servidor e não aplica migrations.
4. A CI foi definida, mas ainda precisa da primeira execução no GitHub para provar o runner remoto.
5. A integração local usou PostgreSQL 18.4; a CI e a stack Supabase estão fixadas no major 17 e devem ser a verificação de compatibilidade de merge.
6. Credenciais/runtime login, projeto Supabase definitivo, Vercel, backup/restore e observabilidade continuam deliberadamente não provisionados.
7. Nenhuma garantia de feature foi criada: constraints de booking, schema de domínio, token/idempotência e fluxos Auth só entram nos sprints correspondentes com seus testes críticos.

## Próxima ação recomendada

Executar a workflow `CI` no primeiro push/PR e encerrar eventuais diferenças do runner. Depois disso, planejar a Sprint 1 a partir das fontes canônicas, sem iniciá-la automaticamente e sem antecipar as decisões ainda abertas do ADR-008.
