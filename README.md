# Barber SaaS — fundação

Fundação production-oriented do monólito modular aprovado. Este repositório ainda não contém features do produto.

## Requisitos

- Node.js `24.x` (testado com `24.19.0`)
- npm `10.9.8` ou compatível com o intervalo declarado em `package.json`
- Docker apenas para a stack Supabase local

## Começar

```bash
npm install
cp .env.example .env.local
npm run dev
```

A página pública mínima funciona sem credenciais. Clientes Auth, banco e proteções de mutação validam suas variáveis somente quando usados.

## Verificações

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run test:integration` exige `TEST_DATABASE_URL` apontando para PostgreSQL descartável já migrado. A CI inicia PostgreSQL efêmero, aplica `supabase/migrations` exclusivamente com a Supabase CLI e então executa a suíte. Sem essa variável, os testes de banco ficam explicitamente ignorados em vez de simularem PostgreSQL.

## Banco

- Runtime: `DATABASE_URL`, role mínima e Supavisor transaction mode.
- DDL: `MIGRATION_DATABASE_URL`, usada somente pela Supabase CLI/geração de candidato.
- Criar migration: `npm run db:migration:new -- nome_da_mudanca`.
- Aplicar localmente: `npm run db:reset`.
- Aplicar em ambiente ligado: `npm run db:migrate`.
- Gerar SQL candidato Drizzle: `npm run db:generate:candidate`.

O SQL candidato nunca é aplicado diretamente. Não existe script `drizzle push`.

## Fontes de verdade

As sete revisões aprovadas estão preservadas com nomes canônicos em [`docs/`](./docs/). Os diretórios `spikes/` registram evidências técnicas e não substituem essas fontes.
