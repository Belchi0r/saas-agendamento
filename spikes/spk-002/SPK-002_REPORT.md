# SPK-002 — Migrations + Drizzle + Supavisor

## 1. Executive Result

**PASS**

O caminho local reproduzível e a matriz remota hospedada passaram. A migration final foi aplicada exclusivamente pelo Supabase CLI usando a conexão DDL; Drizzle + `pg`, SQL PostgreSQL avançado, transações, rollback, recuperação, row lock e pool pequeno passaram pelo Supavisor em transaction mode. Nenhuma prepared statement nomeada foi observada.

Os snapshots dos schemas Supabase reais `auth` e `storage` permaneceram estruturalmente idênticos antes e depois da migration. O comparador de drift também encontrou paridade entre o schema Drizzle e o catálogo hospedado. Assim, não resta bloqueio dentro do escopo definido para o SPK-002.

Evidências brutas: [`evidence/SPK-002_LOCAL_EVIDENCE.json`](evidence/SPK-002_LOCAL_EVIDENCE.json) e [`evidence/SPK-002_SUPAVISOR_EVIDENCE.json`](evidence/SPK-002_SUPAVISOR_EVIDENCE.json).

## 2. Environment

- Host: Microsoft Windows NT 10.0.26200.0, x64.
- Workspace isolado: `spikes/spk-002/`.
- Estado inicial do host: sem Docker, PostgreSQL, `psql` ou Supabase CLI no `PATH`; sem `DATABASE_URL`, `DIRECT_DATABASE_URL` ou variável Supabase configurada.
- Node foi fornecido pelo runtime local do Codex.
- PostgreSQL descartável foi executado a partir do pacote fixado `embedded-postgres`.
- No Windows, `initdb` não aceitou o caminho OneDrive com espaços/acentos durante seu re-exec. O harness usa temporariamente `subst` para apontar uma letra de unidade ao mesmo diretório do spike. Nenhum dado é movido para fora do workspace.
- O Supabase CLI foi instalado como dependência de desenvolvimento do spike, não globalmente.
- A etapa remota usou o projeto hospedado descartável identificado apenas como `spk-002-disposable-dev`.
- DDL/migration usou a URL direta/DDL; o runtime usou uma URL distinta do Supavisor transaction pooler na porta 6543.
- As connection strings foram carregadas de arquivo temporário, nunca registradas nas evidências, e o arquivo foi removido ao final da execução.
- Nenhum SaaS, frontend, Next.js, tela ou schema completo de produto foi criado.

## 3. Versions

| Componente | Versão efetivamente testada |
|---|---:|
| Node.js | 24.19.0 |
| pnpm | 11.19.0 |
| PostgreSQL local | 18.4 |
| PostgreSQL hospedado | 17.6 |
| `btree_gist` local | 1.8 |
| `btree_gist` hospedado | 1.7 |
| Supabase CLI | 2.115.0 |
| Drizzle ORM | 0.45.2 |
| Drizzle Kit | 0.31.10 |
| `pg` | 8.23.0 |
| `embedded-postgres` | 18.4.0-beta.17 |
| TypeScript | 7.0.2 |
| Vitest | 4.1.11 |
| `tsx` | 4.23.12 |

O lockfile fixa a resolução completa. Não há `latest` em `package.json`.

## 4. Experiments executed

1. Geração de SQL candidato pelo Drizzle Kit a partir de `src/db/schema.ts`.
2. Revisão do candidato e criação da migration final em `supabase/migrations`.
3. Criação de PostgreSQL limpo, pré-condição controlada `auth`/`storage`, aplicação pelo Supabase CLI e fingerprint do schema.
4. Destruição do primeiro cluster, criação de segundo cluster limpo e repetição completa.
5. Comparação dos fingerprints dos dois schemas resultantes.
6. CRUD com Drizzle.
7. SQL parametrizado com payload em formato de tentativa de injection.
8. `btree_gist`, `tstzrange`, ranges `[)`, exclusion constraint GiST parcial e índice correspondente.
9. Transação que grava linha auxiliar, grava ocupação válida e falha em ocupação conflitante.
10. Verificação de rollback integral e reconhecimento estável de SQLSTATE/constraint.
11. Reutilização da conexão após erro.
12. Três transações explícitas consecutivas (`COMMIT`, `ROLLBACK`, `COMMIT`).
13. Disputa de row lock com dois clientes e `lock_timeout` determinístico.
14. Inspeção de `pg_prepared_statements` após operações Drizzle/`pg`.
15. Verificação do ciclo de vida de `Pool` com `max=2` e fechamento real.
16. Comparação programática entre colunas do schema Drizzle e catálogo do banco migrado.
17. Segunda execução do Drizzle Kit sem mudança nos artefatos candidatos.
18. Snapshot de schemas, relações, colunas, owners e ACLs de `auth`/`storage` reais antes da migration hospedada.
19. Aplicação da migration hospedada pelo Supabase CLI através da URL DDL.
20. Repetição da matriz de runtime pelo Supavisor transaction pooler na porta 6543.
21. Snapshot posterior, comparação profunda de `auth`/`storage` e comparação de drift contra o catálogo hospedado.

## 5. Commands executed

Comandos lógicos relevantes, executados a partir de `spikes/spk-002`:

```powershell
pnpm install --frozen-lockfile=false
supabase init --force
drizzle-kit generate --config=drizzle.config.ts
tsc --noEmit
vitest run
tsx scripts/run-local-spike.ts
drizzle-kit generate --config=drizzle.config.ts
supabase --version
pnpm test:remote
```

O executor local invocou, em cada banco novo:

```text
supabase migration up --db-url <redacted-db-url> --include-all
```

O `DATABASE_URL` local incluiu `sslmode=disable`, pois o PostgreSQL embutido não oferece TLS. Na etapa hospedada, as connection strings foram consumidas apenas pelo processo e não foram gravadas no relatório ou nas evidências.

## 6. Expected vs observed results

| Experimento | Esperado | Observado | Resultado |
|---|---|---|---|
| Aplicação de migration | somente Supabase CLI aplica SQL final | CLI registrou `20260822190000_spk002_app_private_lab` nos dois bancos locais e aplicou a mesma migration no hospedado pela URL DDL | PASS |
| Reconstrução do zero | schemas idênticos | SHA-256 idêntico `a6dd7fde7cb1702aaee6d592b55a2f20740cd0f13ac4e357ec74f01de94d8884` | PASS |
| Isolamento Drizzle | somente `app_private` | candidato contém três tabelas somente em `app_private`; `schemaFilter` fixado | PASS local |
| Segurança `auth`/`storage` | metadados intactos | snapshots hospedados reais de schemas, OIDs, relações, colunas, owners e ACLs idênticos antes/depois; sentinelas locais também intactas | PASS |
| Recursos avançados | extensão, range e exclusão operantes | local: PostgreSQL 18.4/`btree_gist` 1.8; hospedado: PostgreSQL 17.6/`btree_gist` 1.7; GiST exclusion operante em ambos | PASS |
| Conflito | overlap rejeitado | SQLSTATE `23P01`, constraint `schedule_occupancy_no_overlap` | PASS |
| Rollback | nenhum efeito parcial | linha auxiliar e ocupações da transação ausentes | PASS |
| Recuperação | conexão segue utilizável | `select 42` passou após o erro | PASS |
| Row lock | segundo cliente não obtém lock | SQLSTATE `55P03` após `lock_timeout=250ms`, inclusive pelo pooler | PASS |
| Prepared statements nomeados | nenhum | `pg_prepared_statements = []`, inclusive pelo pooler | PASS |
| Pool | pequeno e encerrável | `max=2`, total 2, waiting 0; consulta após `end()` rejeitada, inclusive pelo pooler | PASS |
| Supavisor transaction mode | evidência hospedada real | matriz remota completa retornou `HOSTED_SUPAVISOR_PASS` | PASS |
| `auth`/`storage` Supabase reais | catálogo idêntico antes/depois | `authStorageUnchanged=true` sobre snapshots reais | PASS |

## 7. Migration workflow validated

Fluxo validado localmente e repetido no projeto hospedado:

```text
src/db/schema.ts
  -> drizzle-kit generate
  -> drizzle-candidate/0000_clear_magus.sql
  -> revisão explícita
  -> supabase/migrations/20260822190000_spk002_app_private_lab.sql
  -> supabase migration up --db-url ...
```

O candidato forneceu tabelas, FK, checks e índices b-tree. A revisão adicionou `btree_gist` e a exclusion constraint que o candidato não expressou. Drizzle Kit não recebeu URL de deploy e não aplicou migrations. Não existe script `drizzle-kit push`.

Em ambos os bancos locais limpos, somente o Supabase CLI aplicou a migration e gravou a história em `supabase_migrations.schema_migrations`. No projeto hospedado, o mesmo CLI aplicou a mesma migration usando a conexão DDL antes de o runtime acessar o schema pelo pooler.

## 8. Drizzle schema isolation evidence

- O schema TypeScript usa `pgSchema("app_private")`.
- `drizzle.config.ts` fixa `schemaFilter: ["app_private"]`.
- O arquivo candidato contém somente `app_private.business`, `app_private.transaction_probe` e `app_private.schedule_occupancy`.
- A migration final não contém alvo `auth.*` ou `storage.*` após remoção de comentários.
- A segunda geração respondeu `No schema changes, nothing to migrate`; hashes dos artefatos candidatos permaneceram iguais.

O `schemaFilter` é defesa para operações de pull/push; a defesa principal neste workflow é a combinação de `pgSchema`, entrada TypeScript explícita, revisão do SQL final e proibição de `push`. Referência: [Drizzle Kit configuration](https://orm.drizzle.team/docs/drizzle-config-file).

## 9. auth/storage safety evidence

Evidência local controlada:

- antes da migration foram criados schemas/sentinelas que representam objetos externos;
- a criação ocorreu no harness, nunca em `supabase/migrations`;
- foram capturados OIDs de schema/relação, owner, ACL, colunas e valores sentinela;
- antes e depois são byte-equivalentes nos dois ciclos;
- OIDs iguais demonstram que os objetos não foram removidos/recriados.

Evidência hospedada real:

- os snapshots foram obtidos do catálogo do projeto antes e depois da migration;
- `auth` continha 115 relações e 348 colunas; `storage`, 25 relações e 94 colunas;
- schemas, OIDs, relações, colunas, owners e ACLs foram comparados profundamente;
- `authStorageUnchanged=true`, sem alteração estrutural observada;
- as listas de sentinelas locais permaneceram vazias no hospedado, portanto não foram usadas como substituto dos schemas reais.

Resultado: **PASS**. Evidência: [`evidence/SPK-002_SUPAVISOR_EVIDENCE.json`](evidence/SPK-002_SUPAVISOR_EVIDENCE.json).

## 10. PostgreSQL advanced-feature evidence

- `create extension if not exists btree_gist with schema extensions` aplicado.
- `occupied_period tstzrange not null` aplicado.
- check exige range não vazio, inclusivo embaixo, exclusivo em cima e `lower < upper`.
- períodos 10:00–11:00 e 11:00–12:00 coexistiram.
- overlap liberado (`released_at` preenchido) coexistiu.
- overlap ativo foi rejeitado.
- definição observada:

```sql
EXCLUDE USING gist (business_id WITH =, occupied_period WITH &&)
WHERE (released_at IS NULL)
```

- índice observado:

```sql
CREATE INDEX schedule_occupancy_no_overlap
ON app_private.schedule_occupancy
USING gist (business_id, occupied_period)
WHERE (released_at IS NULL)
```

## 11. Transaction/rollback evidence

Dentro de uma única `db.transaction`:

1. foi inserida uma linha em `transaction_probe`;
2. foi inserida uma ocupação válida;
3. foi tentada uma ocupação sobreposta;
4. PostgreSQL lançou `23P01`;
5. Drizzle/`pg` executou rollback.

Após a falha, tanto a linha auxiliar quanto as duas ocupações estavam ausentes. A consulta de recuperação passou. O teste combina CRUD Drizzle e SQL PostgreSQL parametrizado construído em `src/db/advanced-sql.ts`.

## 12. Supavisor evidence

**PASS — `HOSTED_SUPAVISOR_PASS`**

O executor `scripts/run-supavisor-spike.ts` foi executado contra o ambiente `spk-002-disposable-dev`. Ele exigiu deliberadamente:

- projeto Supabase explicitamente descartável/dev, sem dados reais;
- `DIRECT_DATABASE_URL` para DDL/migrations;
- `SUPAVISOR_DATABASE_URL` do transaction pooler, normalmente porta 6543;
- `SPK002_ENVIRONMENT_LABEL` contendo indicação de dev/test/spike/descartável;
- `SPK002_ALLOW_REMOTE_TESTS=1`.

Resultados observados através do transaction pooler:

- CRUD Drizzle e SQL parametrizado: PASS;
- ranges adjacentes `[)` e overlap liberado: PASS;
- overlap ativo: `23P01` na constraint `schedule_occupancy_no_overlap`;
- rollback integral e recuperação da conexão: PASS;
- transações consecutivas: `COMMIT`, `ROLLBACK`, `COMMIT`;
- row lock: `55P03`;
- prepared statements nomeadas: nenhuma;
- pool: `max=2`, duas conexões ociosas antes do fechamento, zero waiters e consulta rejeitada após `end()`;
- paridade de drift no catálogo hospedado: PASS.

A migration foi executada separadamente pela conexão DDL; a connection string aparece redigida na evidência. Evidência: [`evidence/SPK-002_SUPAVISOR_EVIDENCE.json`](evidence/SPK-002_SUPAVISOR_EVIDENCE.json), gerada em `2026-08-22T20:59:23.438Z`.

O Supabase recomenda conexão direta para migrations e transaction mode para tráfego serverless; transaction mode não suporta prepared statements. Referência: [Connect to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 13. Prepared statement findings

No caminho testado com `pg` 8.23.0:

- nenhuma query fornece a propriedade `name`;
- Drizzle usa o driver `node-postgres` configurado sobre `Pool`;
- `pg_prepared_statements` ficou vazio após CRUD, SQL parametrizado, transações, erro e locks.

Em `node-postgres`, uma prepared statement nomeada é ativada ao fornecer `name`; omitir esse campo é a correção para Supavisor transaction mode. Não se deve copiar `prepare: false` de `postgres.js`, porque esta arquitetura usa `pg`. Referências: [node-postgres queries](https://node-postgres.com/features/queries) e [Supabase disabling prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL).

Resultado local: PASS. Resultado no pooler: **PASS**.

## 14. SQLSTATE/error handling findings

- Exclusion violation: `23P01`.
- Nome da constraint: `schedule_occupancy_no_overlap`.
- Lock não adquirido no prazo: `55P03`.
- O helper `isExclusionViolation` percorre `cause` porque Drizzle pode encapsular o erro do driver.
- O mapeamento estável recomendado usa o par SQLSTATE + nome da constraint, não texto localizado da mensagem.

## 15. Connection lifecycle findings

- Um `Pool` é criado com `max=2`, `connectionTimeoutMillis=5000`, `idleTimeoutMillis=5000` e `allowExitOnIdle=true`.
- Transações explícitas usam um client obtido por `pool.connect()` e liberado em `finally`.
- O teste de lock chegou a duas conexões, com zero waiters.
- Três transações consecutivas passaram, incluindo rollback.
- A conexão/pool permaneceu utilizável depois de `23P01`.
- `pool.end()` encerrou o pool; nova consulta foi rejeitada.
- A mesma matriz passou pelo Supavisor transaction pooler hospedado, com `max=2` e nenhuma prepared statement nomeada observada.

Isto detecta incompatibilidades óbvias, não dimensiona Vercel nem substitui load test.

## 16. Drift findings

Risco confirmado: o SQL avançado final não está completamente representado pelo schema Drizzle. A extensão e a exclusion constraint são adições manuais legítimas; portanto, comparar somente arquivos gerados é insuficiente.

Mecanismo mínimo recomendado para CI:

1. executar `drizzle-kit generate` e falhar se `drizzle-candidate/` mudar sem commit/revisão;
2. criar PostgreSQL efêmero do zero;
3. aplicar somente `supabase/migrations` via Supabase CLI;
4. executar o comparador `assertDrizzleMigrationColumnParity`, que compara em ambas as direções tabela/coluna/tipo/null/default/PK do TypeScript contra o catálogo real;
5. executar testes explícitos das partes manuais: extensão, checks, FK, exclusion constraint, índice e SQLSTATE;
6. falhar se qualquer migration tocar `auth` ou `storage`.

O proof-of-concept passou nos dois ciclos locais e no catálogo hospedado, e detectaria colunas extras ou ausentes.

## 17. Problems discovered

1. Sem Docker, `supabase start`/`db reset --local` não pôde criar uma stack Supabase completa. A etapa hospedada supriu a evidência real de `auth`, `storage` e Supavisor prevista pelo harness. A documentação oficial declara um runtime Docker-compatible como pré-requisito do fluxo local: [Supabase local workflow](https://supabase.com/docs/guides/local-development/cli-workflows).
2. Supabase CLI 2.115.0 tentou TLS por padrão em `migration up --db-url`; o PostgreSQL local exigiu `sslmode=disable`.
3. `initdb` do PostgreSQL 18.4 no Windows falhou ao reexecutar com o caminho OneDrive contendo espaços/acentos; `subst` resolveu sem sair do workspace.
4. O shutdown Windows de `embedded-postgres` ficou preso em `taskkill` e deixou processo filho; o harness foi corrigido para `pg_ctl stop -m fast -w`, validado nos dois ciclos finais.
5. Drizzle Kit não gerou a extensão nem a exclusion constraint; revisão SQL manual continua obrigatória.
6. O PostgreSQL local era 18.4/`btree_gist` 1.8 e o hospedado era 17.6/`btree_gist` 1.7; a migration e os comportamentos avançados passaram em ambos.

Nenhum problema encontrado exige abandonar Drizzle + `pg` + SQL explícito + Supabase CLI. Nenhuma incompatibilidade foi observada no Supavisor transaction mode.

## 18. Changes recommended to ADR-002

O gate hospedado do SPK-002 foi satisfeito. Recomendações textuais, sem alterar o ADR agora:

1. Explicitar que, com `pg`, prepared statement nomeada é evitada omitindo `name` nas queries; `prepare: false` pertence a outro driver.
2. Fixar duas URLs/funções: direct/DDL para Supabase CLI e transaction pooler para runtime.
3. Tornar obrigatórios os dois gates de drift descritos na seção 16.
4. Registrar que recursos não expressáveis pelo Drizzle permanecem em SQL revisado e com teste de catálogo/comportamento.
5. Registrar `sslmode=disable` somente para harness local sem TLS; nunca como recomendação hospedada.
6. Considerar o requisito de SPK-002 atendido para a decisão do ADR-002; a mudança para `ACCEPTED` ainda depende dos demais gates e do rito de decisão aplicável.

## 19. Changes recommended to ADR-008

Manter `PROPOSED` quanto aos aspectos que excedem o pooling; o recorte Supavisor/connection lifecycle do SPK-002 está validado.

1. Registrar que o executor hospedado passou como gate técnico de transaction pooling.
2. Começar com `Pool max=2` por instância somente como limite conservador; validar contra plano/região/concurrency reais.
3. Proibir migrations pelo pooler; usar conexão direta/DDL.
4. Tornar a ausência de query `name` uma verificação de review/teste.
5. Não inferir dimensionamento Vercel a partir deste smoke hospedado; load test permanece separado.

## 20. What remains unproven

- Limites de conexão, cold starts, churn e concorrência em Vercel.
- Comportamento sob carga sustentada, alta concorrência, indisponibilidade e mudanças de região/plano.
- Backup/restore, observabilidade e capacidade do plano, que excedem este spike.

## 21. Exact next action

Encerrar o SPK-002 como **PASS** e submeter este relatório e as duas evidências à revisão do rito arquitetural. Registrar o gate técnico do SPK-002 como satisfeito, sem alterar automaticamente ADR-002, ADR-008 ou qualquer documento oficial.

## File tree

```text
spikes/spk-002/
├── .gitignore
├── SPK-002_REPORT.md
├── drizzle.config.ts
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
├── drizzle-candidate/
│   ├── 0000_clear_magus.sql
│   └── meta/
│       ├── 0000_snapshot.json
│       └── _journal.json
├── evidence/
│   ├── SPK-002_LOCAL_EVIDENCE.json
│   └── SPK-002_SUPAVISOR_EVIDENCE.json
├── scripts/
│   ├── lib/
│   │   ├── drift-check.ts
│   │   ├── embedded-db.ts
│   │   ├── experiments.ts
│   │   ├── process.ts
│   │   ├── snapshots.ts
│   │   └── supabase-cli.ts
│   ├── run-local-spike.ts
│   ├── run-supavisor-spike.ts
│   └── versions.ts
├── src/db/
│   ├── advanced-sql.ts
│   ├── pool.ts
│   ├── postgres-error.ts
│   └── schema.ts
├── supabase/
│   ├── .gitignore
│   ├── config.toml
│   └── migrations/
│       └── 20260822190000_spk002_app_private_lab.sql
└── tests/
    ├── postgres-error.test.ts
    └── static-safety.test.ts
```

`node_modules/` é gerado e omitido da árvore.
