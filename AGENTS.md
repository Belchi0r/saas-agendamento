# Regras obrigatórias do repositório

## Arquitetura

- Manter um monólito modular em runtime Node.js: `delivery/UI -> application -> domain`; `application -> persistence/infrastructure`.
- `domain` não importa Next.js, React, Supabase, Drizzle, `pg` nem objetos HTTP.
- Não criar microserviços ou abstrações sem regra/fronteira concreta.

## Persistência e migrations

- PostgreSQL é a fonte de verdade. Acesso ao domínio é server-side por Drizzle/`pg`; SQL manual deve ser localizado e parametrizado.
- SQL final oficial vive em `supabase/migrations` e somente a Supabase CLI o aplica. Drizzle Kit gera apenas candidato em `drizzle-candidate`; `drizzle push` é proibido.
- Migrations da aplicação nunca administram `auth`, `storage` ou outros schemas internos do Supabase.
- Runtime usa role mínima, pool pequeno e Supavisor transaction mode sem prepared statements nomeados. Operações críticas mantêm uma única conexão/transação.

## Escopo e segurança

- Todo repositório pertencente ao negócio exige `BusinessScope` resolvido no servidor. `business_id` vindo do browser nunca concede autoridade.
- Autenticação não é autorização. Não usar `getSession()` para autorizar; revalidar o usuário no servidor e comparar com `Business.admin_auth_user_id`.
- Clientes Supabase server-side são request-scoped. Browser usa Supabase somente para Auth e nunca acessa tabelas do domínio.
- Respostas autenticadas são `private, no-store`. Mutações sensíveis validam método, Origin e Host. Nunca registrar secrets, tokens ou PII desnecessária.

## Invariantes críticas

- Timezone IANA explícito; conversões críticas no servidor via Temporal. Gap DST não gera horário, fold usa a primeira ocorrência; instantes confirmados permanecem UTC com snapshots.
- Concorrência de agenda termina em constraint PostgreSQL com `tstzrange` half-open `[)` e exclusion constraint; respeitar a ordem global de locks aprovada.
- Idempotência usa fingerprint canônico/versionado e efeito+recibo na mesma transação.
- ID de Appointment não é capability. Token de cliente é CSPRNG >=256 bits; persistir somente HMAC-SHA-256 com pepper externo; token bruto nunca vai para banco, logs ou evidências.

## Qualidade e visual

- Antes de concluir: implementação + testes adequados + `npm run typecheck` + `npm run lint`.
- Mudanças críticas de banco/concorrência/Auth/token/timezone exigem testes reais apropriados, não mocks superficiais.
- UI é mobile-first e segue a direção aprovada. Não inventar linguagem visual, SaaS genérico, gradientes decorativos, excesso de cards, badges inúteis, KPIs/gráficos inventados ou animações decorativas. Copy curta e natural em português.
- Consultar as sete fontes canônicas em `docs/`; relatórios de `spikes/` são evidência, não especificações concorrentes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
