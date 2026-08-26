# SPK-001 — PostgreSQL Booking Concurrency and Database Integrity

## 1. Executive Result

**PASS**

A estratégia central foi comprovada em PostgreSQL real com múltiplas conexões: uma tabela única `ScheduleOccupancy`, range UTC meio-aberto `[)`, `btree_gist`, exclusion constraint parcial por `business_id` e transações curtas impedem sobreposição entre bookings e blocks. Remarcações concorrentes foram serializadas por lock de `Appointment` e versão; conflito de remarcação reverteu integralmente e preservou a ocupação antiga.

A ordem global `disponibilidade/configuração → Appointment` não produziu deadlock. Duas inversões deliberadas produziram exatamente uma vítima por ciclo com SQLSTATE `40P01`, e todas as conexões voltaram a ser utilizáveis após rollback.

Para deleção, a conclusão é específica: remover o privilégio `DELETE` da role de runtime é necessário, mas não basta para caminhos privilegiados. Também é necessário que o trigger diferível de integridade owner/occupancy reaja a `DELETE` e impeça o commit que deixaria owner ativo sem ocupação. Com esse trigger, um segundo trigger `BEFORE DELETE` dedicado não é necessário para integridade confirmada.

Evidência bruta: [`evidence/SPK-001_LOCAL_EVIDENCE.json`](evidence/SPK-001_LOCAL_EVIDENCE.json).

## 2. Scope and sources of truth

Fontes de verdade imutáveis usadas:

- `BARBER_ARCHITECTURE_v1`;
- `BARBER_DATA_MODEL_v1`;
- `BARBER_ARCHITECTURE_DECISIONS_v1`.

O SPK-002 foi tratado somente como infraestrutura já comprovada: PostgreSQL efêmero, Supabase CLI, `pg`, `btree_gist` e connection lifecycle. Ele não foi reexecutado nem alterado, e seus resultados não foram contabilizados como evidência dos cenários de concorrência do SPK-001.

Todo artefato novo está em `spikes/spk-001/`. Não foram implementados frontend, Next.js, casos de uso completos, autenticação, idempotência, SaaS, Sprint 0 ou schema integral do produto.

## 3. Environment

| Componente | Versão/valor testado |
|---|---:|
| Host | Windows NT 10.0.26200, x64 |
| Node.js | 24.19.0 |
| pnpm | 11.19.0 |
| PostgreSQL efêmero | 18.4 |
| `btree_gist` | 1.8 |
| Supabase CLI | 2.115.0 |
| `pg` | 8.23.0 |
| `embedded-postgres` | 18.4.0-beta.17 |
| Pool de teste | `max=12` |

No Windows, o mesmo workaround já comprovado mapeou temporariamente o diretório do spike para uma letra de unidade ASCII com `subst`, porque `initdb` não reexecuta corretamente sob o caminho OneDrive com espaços/acentos. O banco e seu diretório foram destruídos ao final.

A migration foi aplicada exclusivamente pelo Supabase CLI:

```text
supabase migration up --db-url <redacted-db-url> --include-all
```

História observada: `20260822210000:spk001_booking_concurrency_lab`. SHA-256 da migration: `aefcd672e62c4f044138c9a0f89c2f8b703c004a6499cbf532fcc103595e8c0f`.

## 4. Minimal laboratory model

O schema descartável contém somente o necessário para o spike:

- `Business(id, availability_version)` como linha de lock de disponibilidade/configuração;
- `Appointment` com status, versão e instantes de serviço/ocupação;
- `BlockedPeriod` com intervalo e atividade;
- `ScheduleOccupancy` com exatamente um owner, `business_id`, `tstzrange` e `released_at`;
- FKs compostas para impedir owner de outro negócio;
- unique parcial por `appointment_id` e `blocked_period_id`;
- trigger de integridade owner/occupancy, diferível e inicialmente deferred, em owners e occupancy;
- role `spk001_runtime` com `SELECT/INSERT/UPDATE` e sem `DELETE` em `ScheduleOccupancy`.

A exclusion constraint observada foi:

```sql
EXCLUDE USING gist (
  business_id WITH =,
  occupied_period WITH &&
)
WHERE (released_at IS NULL)
```

## 5. Deterministic synchronization

Nenhum cenário dependeu de um `sleep` arbitrário para decidir sucesso:

- booking × booking e booking × block usaram uma barreira de duas partes para liberar os dois inserts concorrentes;
- nas esperas por row lock, um terceiro backend consultou `pg_stat_activity` até observar `wait_event_type='Lock'` antes de liberar o holder;
- o deadlock foi criado por ciclos reais de locks já adquiridos; `deadlock_timeout=100ms` apenas antecipou o detector nativo do PostgreSQL;
- o volume foi gerado de forma determinística por `generate_series`.

Os waits observados nos cenários ordenados foram `transactionid`.

## 6. Experiments executed

1. Owner confirmado/ativo sem occupancy, com validação no commit.
2. Booking × booking no mesmo intervalo.
3. Booking × block no mesmo intervalo.
4. Reschedule × reschedule sobre o mesmo `Appointment` e mesma versão esperada.
5. Remarcação para intervalo já ocupado, com verificação do estado após rollback.
6. Intervalos adjacentes `[)` no mesmo negócio.
7. Mesmo intervalo em dois negócios.
8. Conflito antes de `released_at`, liberação atômica e reutilização da capacidade.
9. `DELETE` pela role de runtime.
10. `DELETE` privilegiado de occupancy ativa, tentativa de reutilização e validação diferível no commit.
11. `DELETE` privilegiado de histórico já liberado.
12. Ordem global correta com configuração concorrendo com remarcação.
13. Deadlock deliberado entre duas linhas de `Appointment`.
14. Deadlock deliberado por inversão `Appointment → configuração` contra `configuração → Appointment`.
15. Cinquenta mil ocupações históricas, divididas entre liberadas e retidas no GiST.
16. `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` da consulta de overlap após o volume.
17. Reutilização de cada conexão após `23P01`, `23514`, `42501` e `40P01`.
18. Encerramento do pool e rejeição de consulta posterior.

## 7. Expected vs observed

| Cenário | Esperado | Observado | Resultado |
|---|---|---|---|
| Booking × booking | exatamente um sucesso | 1 `SUCCESS`, 1 `23P01`; uma occupancy persistida | PASS |
| Booking × block | exatamente um sucesso | booking venceu nesta execução; block recebeu `23P01`; uma occupancy persistida | PASS |
| Reschedule × reschedule | uma versão vence | primeira levou versão 1→2; segunda aguardou lock, observou versão 2 e retornou `VERSION_CONFLICT` | PASS |
| Remarcação conflitante | estado antigo atômico | `23P01`; versão 1 e quatro instantes antigos preservados | PASS |
| Adjacência `[)` | ambos persistem | 10:00–11:00 e 11:00–12:00 coexistiram | PASS |
| Negócios distintos | ambos persistem | mesmo range coexistiu sob `business_id` diferente | PASS |
| `released_at` | libera capacidade | antes: `23P01`; após cancelamento+release, replacement persistiu | PASS |
| DELETE runtime | negado | `42501`, conexão reutilizável | PASS |
| DELETE privilegiado ativo | commit não pode criar orphan | delete e replacement ocorreram dentro da transação; commit falhou `23514` e rollback restaurou original | PASS |
| Lock order correto | nenhuma espera circular | contender aguardou configuração, depois adquiriu Appointment; zero deadlock | PASS |
| Deadlocks deliberados | uma vítima e recuperação | uma vítima `40P01` em cada um dos dois ciclos; survivor confirmou | PASS |
| Volume/GiST | plano e custo observáveis | 50.000 rows; GiST seletivo usado; 0,124 ms neste host | PASS |

## 8. Booking × booking

As duas transações adquiriram lock compartilhado de disponibilidade, criaram owners independentes e chegaram juntas ao insert de occupancy. A exclusion constraint permitiu um commit. A outra transação recebeu:

- SQLSTATE: `23P01`;
- constraint: `schedule_occupancy_no_overlap`.

Após rollback, a conexão perdedora respondeu a nova query. O catálogo continha exatamente uma occupancy ativa para o intervalo.

## 9. Booking × block

Booking e BlockedPeriod disputaram a mesma tabela e a mesma constraint. Não houve regra especial nem lock em memória por tipo de owner. Nesta execução o booking venceu e o block recebeu `23P01`; inverter o vencedor não alteraria o invariante exigido, que é exatamente um sucesso.

Isto confirma a vantagem da tabela de occupancy única sobre exclusions separadas em Appointment e BlockedPeriod.

## 10. Concurrent reschedule

Ambas as transações adquiriram primeiro o lock compartilhado do `Business`. A primeira obteve `FOR UPDATE` no `Appointment`; a segunda foi observada por `pg_stat_activity` esperando um lock `transactionid`.

A vencedora moveu a mesma occupancy, atualizou o Appointment e incrementou a versão de 1 para 2. Quando a segunda adquiriu o lock, observou versão 2 contra `expectedVersion=1`, não escreveu e retornou `VERSION_CONFLICT`.

Resultado final: somente o primeiro novo intervalo, Appointment versão 2 e occupancy correspondente.

## 11. Failed reschedule atomicity

A occupancy foi atualizada antes do Appointment dentro da mesma transação para forçar o ponto de falha mais perigoso. O novo período se sobrepunha a outra occupancy já confirmada; PostgreSQL lançou `23P01`.

Após rollback:

- Appointment permaneceu na versão 1;
- `scheduled_start_at`/`scheduled_end_at` permaneceram antigos;
- bounds da mesma `ScheduleOccupancy` permaneceram antigos;
- a conexão executou nova query normalmente.

A estratégia “mover a mesma occupancy na transação” preserva atomicamente o horário anterior.

## 12. Range, business scope and release

- A semântica `[)` permitiu fronteira 11:00 sem overlap.
- O mesmo range em dois `business_id` distintos foi aceito.
- Uma nova booking sobre occupancy ativa recebeu `23P01`.
- Na mesma transação, o Appointment original mudou para `CANCELLED` e sua occupancy recebeu `released_at`.
- Após commit, uma nova booking no range idêntico foi aceita; havia exatamente uma occupancy ativa naquele período.

## 13. Global lock order

Ordem validada para ambas as operações:

```text
availability/configuration → Appointment
```

A transação de configuração segurou `FOR UPDATE` no Business e depois no Appointment. A remarcação tentou primeiro `FOR SHARE` no Business e foi observada em espera real. Após o commit da configuração, ela obteve Business e só então Appointment. Não ocorreu deadlock.

Esse teste não prova que código futuro respeitará a ordem; a ordem precisa virar helper/convenção única e teste de integração obrigatório.

## 14. Deliberate deadlocks

Dois ciclos foram construídos:

1. Tx A bloqueou Appointment 1 e pediu 2; Tx B bloqueou 2 e pediu 1.
2. Tx A violou a ordem ao bloquear Appointment e pedir Business; Tx B seguiu Business e pediu Appointment.

Em cada ciclo:

- PostgreSQL detectou o ciclo sem timeout de aplicação;
- exatamente uma transação recebeu SQLSTATE `40P01`;
- a vítima foi revertida;
- a outra transação prosseguiu e confirmou;
- ambas as conexões responderam a queries posteriores.

Tratamento necessário: `40P01` exige rollback da transação inteira. Retry deve ser limitado e somente ocorrer no boundary transacional completo, com idempotência apropriada; não se deve repetir apenas a última query.

## 15. Deletion defense

### Runtime role

`spk001_runtime` possui `SELECT`, `INSERT` e `UPDATE`, mas `has_table_privilege(..., 'DELETE') = false`. A tentativa de delete recebeu `42501` e não alterou dados.

### Privileged path

Como superuser do banco efêmero, o statement de delete de uma occupancy ativa executou. Dentro da mesma transação foi possível inserir outra occupancy no range recém-aberto. Isso demonstra o risco real que existiria sem defesa no banco.

No commit, o trigger diferível `schedule_occupancy_owner_guard` verificou o owner antigo e levantou:

- SQLSTATE: `23514`;
- constraint lógica: `schedule_occupancy_owner_required`.

O rollback restaurou a occupancy original e removeu a replacement transitória. Após cancelamento e `released_at`, um delete privilegiado do histórico foi aceito; a role de runtime continuou sem esse privilégio.

### Decision

- **Sim**, uma defesa por trigger é necessária além do `REVOKE DELETE`.
- Essa defesa deve fazer parte do trigger diferível de integridade owner/occupancy e cobrir `INSERT/UPDATE/DELETE` de occupancy.
- Um segundo `BEFORE DELETE` dedicado é redundante para integridade no commit e não é recomendado agora.
- Purge histórico permanece fora do MVP.

## 16. Owner/occupancy integrity

Um Appointment `CONFIRMED` e um BlockedPeriod ativo foram inseridos deliberadamente sem occupancy. Os inserts foram aceitos dentro da transação, permitindo criar owner antes de occupancy, mas cada commit falhou com `23514`/`schedule_occupancy_owner_required`.

Três constraint triggers foram observados no catálogo — em Appointment, BlockedPeriod e ScheduleOccupancy — todos `DEFERRABLE INITIALLY DEFERRED`. Isso fecha tanto owner sem occupancy quanto mutation/delete que rompa a correspondência ao final da transação.

## 17. GiST and volume

O dataset de volume usou um Business isolado e 50.000 occupancies:

- 25.000 `CANCELLED` com `released_at` preenchido;
- 25.000 `COMPLETED` históricos com `released_at` nulo, preservados no índice conforme a baseline.

| Momento | Heap bytes | Total relation bytes | GiST bytes |
|---|---:|---:|---:|
| Antes do lote | 8.192 | 90.112 | 8.192 |
| Após 25k liberadas | 2.932.736 | 5.390.336 | 8.192 |
| Após +25k retidas | 5.660.672 | 13.844.480 | 3.465.216 |

Impacto observado:

- ocupações liberadas aumentaram tabela/índices auxiliares, mas o GiST parcial cresceu **0 bytes**;
- históricos retidos acrescentaram **3.457.024 bytes** ao GiST;
- inserts + validações diferíveis levaram 6.593,84 ms para liberadas e 13.689,37 ms para retidas;
- a probe seletiva usou `Index Scan` em `schedule_occupancy_no_overlap`, encontrou uma row, usou quatro shared hits/zero reads e executou em 0,124 ms, com planning de 0,387 ms.

Esses tempos são observações de um único host e não constituem SLA. Para o MVP, 25 mil históricos retidos não justificam mudar a estratégia. O crescimento é real e deve ser monitorado; retenção, archival, partitioning ou mudança de semântica de liberação só devem ser considerados se volume/planos reais mostrarem necessidade.

## 18. SQLSTATE and connection recovery

| SQLSTATE/resultado | Situação | Tratamento recomendado | Conexão após rollback |
|---|---|---|---|
| `23P01` | exclusion violation | conflito de horário; mapear pela constraint | reutilizável |
| `23514` | owner/occupancy ou estado/release incoerente | falha de integridade/programação; não apresentar como slot disputado | reutilizável |
| `42501` | runtime tentou DELETE | erro de configuração/privilégio; alertar | reutilizável após rollback/reset de role |
| `40P01` | deadlock detectado | rollback total e retry limitado da operação inteira quando seguro | reutilizável |
| `VERSION_CONFLICT` | segunda remarcação com versão antiga | conflito de domínio; nenhuma escrita | reutilizável |

Não se deve reconhecer erro por texto localizado. Para `23P01`, usar SQLSTATE + `schedule_occupancy_no_overlap`; para integridade de owner, SQLSTATE + constraint lógica registrada pelo trigger.

Antes do fechamento, o pool tinha zero waiters. `pool.end()` encerrou o pool e uma nova consulta foi rejeitada.

## 19. Risks and required architectural clarifications

Nenhuma mudança na estratégia central é necessária. As seguintes clarificações de implementação são necessárias antes de considerar ADR-004 pronto para aceitação:

1. O mecanismo diferível de owner/occupancy deve reagir a mudanças nos owners e a `INSERT/UPDATE/DELETE` em `ScheduleOccupancy`.
2. A role de runtime continua sem `DELETE`; o trigger é defesa adicional, não substituto de least privilege.
3. Acesso a locks deve passar por helper/convenção que sempre adquira configuração antes de Appointment.
4. `40P01` deve ser uma classe técnica retryable somente no nível da transação completa e com limite; `23P01` continua conflito de negócio sem retry cego.
5. Métrica/observabilidade deve distinguir `23P01`, `40P01`, `23514` e `42501`.
6. O tamanho do GiST e o plano da consulta de overlap devem ser acompanhados, mas não justificam purge/partitioning no MVP.

Recomendação de governança: o gate técnico do SPK-001 para ADR-004 está satisfeito. Este relatório não altera o ADR; a mudança de status depende do rito arquitetural.

## 20. What remains unproven

- Throughput, latência e contenção sob carga distribuída/serverless real.
- Crescimento, vacuum/bloat e planos muito além de 50 mil occupancies ou após churn prolongado.
- Valores de pool/concurrency adequados à Vercel e ao plano Supabase.
- Criação e privilégios da role mínima no ambiente gerenciado; isso pertence ao SPK-006.
- Interação com idempotência, eventos, tokens, políticas comerciais e configuração completa, que pertencem a outros spikes/casos de uso.
- Retry end-to-end de `40P01` com idempotency receipt e resposta incerta.

Não foi necessário usar novamente o projeto Supabase hospedado: os comportamentos em questão são garantias nativas do PostgreSQL e foram exercitados com conexões reais. O SPK-002 já comprovou separadamente a infraestrutura gerenciada, sem ser reexecutado.

## 21. Exact next action

Encerrar o SPK-001 como **PASS** e submeter este relatório e `evidence/SPK-001_LOCAL_EVIDENCE.json` à revisão arquitetural como evidência do gate do ADR-004. Não alterar automaticamente ADR-004, outros documentos oficiais ou iniciar Sprint 0.

## File tree

```text
spikes/spk-001/
├── .gitignore
├── SPK-001_REPORT.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
├── evidence/
│   └── SPK-001_LOCAL_EVIDENCE.json
├── scripts/
│   ├── lib/
│   │   ├── embedded-db.ts
│   │   ├── process.ts
│   │   ├── scenarios.ts
│   │   ├── supabase-cli.ts
│   │   └── synchronization.ts
│   ├── run-local-spike.ts
│   └── versions.ts
└── supabase/
    ├── config.toml
    └── migrations/
        └── 20260822210000_spk001_booking_concurrency_lab.sql
```

`node_modules/`, `.tmp/` e `supabase/.temp/` são gerados e omitidos.

