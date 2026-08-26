# Sprint 3 — Date exceptions, blocked periods e disponibilidade

## Resultado

**PASS**

A implementação local de `DateAvailabilityException`, `ExceptionWorkingWindow`, `BlockedPeriod` e do avaliador determinístico de candidatos foi concluída e todos os gates executados passaram.

O checkpoint final resolveu as duas condições anteriores:

- `BusinessSchedulingPolicy.slot_step_minutes` permanece uma decisão de produto aberta e não bloqueia a Sprint 3. O motor representa intervalos efetivos e valida deterministicamente candidatos explícitos, sem enumerar grade pública nem introduzir default silencioso.
- A infraestrutura mínima de `ScheduleOccupancy` necessária para `BlockedPeriod` está expressamente autorizada. A implementação existente já era canônica e suficiente: owner e occupancy são criados, alterados e liberados atomicamente, com garantia final contra overlap no PostgreSQL.

Nenhuma implementação de produção precisou ser refeita neste checkpoint. O contrato unitário da migration foi fortalecido para congelar FK composta, range `[)`, GiST parcial, triggers diferíveis, ausência de `DELETE` runtime, ausência de `Appointment` e ausência de `slot_step_minutes` persistido.

Nenhuma migration foi aplicada ao Supabase hospedado. Sprint 4 não foi iniciada.

## Ambiente validado

| Componente | Versão/ambiente |
|---|---|
| Node.js | 24.19.0 |
| npm | 10.9.8 (versão declarada pelo projeto) |
| Next.js | 16.3.2 |
| React | 19.2.8 |
| TypeScript | 6.0.3 |
| Drizzle ORM | 0.45.2 |
| `pg` | 8.23.0 |
| Temporal polyfill | `@js-temporal/polyfill` 0.5.1 |
| Supabase CLI | 2.115.0 |
| PostgreSQL local descartável | 18.4, conexão real em `127.0.0.1` |
| `btree_gist` | 1.8 |

O PostgreSQL foi iniciado de forma efêmera. As quatro migrations oficiais foram aplicadas do zero com `supabase migration up --db-url <local-redacted> --include-all`. O histórico observado terminou em `20260823231127_sprint_3_date_availability_exceptions`, e o advisor local da Supabase CLI informou `No issues found`.

## Funcionalidades concluídas

- Administração autenticada de datas fechadas (`CLOSED`).
- Administração autenticada de horários excepcionais (`REPLACE`) com uma ou mais faixas locais.
- Criação, edição e remoção canônica de exceções de data.
- Criação e edição de bloqueios pontuais em hora local do `Business`.
- Remoção de bloqueio por inativação e liberação de capacidade, preservando histórico.
- Telas administrativas mobile-first para datas especiais e bloqueios, integradas à navegação existente.
- Boundaries HTTP com Zod estrito; `business_id` extra é rejeitado e nunca concede autoridade.
- Respostas autenticadas continuam `private, no-store`; mutações reutilizam os guards de método, Origin e Host.
- Cálculo determinístico de candidatos fornecidos explicitamente, cobrindo jornada semanal, pausas, exceção da data, duração do serviço, bloqueios, timezone e DST.

Não foi criada superfície pública de horários porque ela exigiria enumerar candidatos com uma cadência ainda não aprovada. Sob o checkpoint aprovado, o avaliador na fronteira de aplicação/testes satisfaz a Sprint 3: recebe candidatos explícitos, calcula seus intervalos UTC e devolve somente os válidos.

## Migration

Foi mantido e alterado **no próprio lugar** o arquivo já restaurado:

`supabase/migrations/20260823231127_sprint_3_date_availability_exceptions.sql`

Ele não foi recriado, renumerado nem substituído. A revisão deste checkpoint **não alterou a migration**. SHA-256 local final:

`15572B0BCDD230CC9A7AF8A25A98F7F136AEC8EB0D1AD09AFF042D673D066918`

A migration contém:

- `date_availability_exception`, com unicidade por `Business`/data;
- `exception_working_window`, com intervalos locais `[)` e exclusion constraint contra sobreposição por exceção;
- `blocked_period`, com instantes UTC, timezone snapshot, estado, versão e escopo composto;
- infraestrutura mínima `schedule_occupancy` apenas para o owner `BlockedPeriod` nesta etapa;
- exclusion constraint GiST por `business_id` e `tstzrange` `[)` para ocupações não liberadas;
- triggers diferíveis que impedem `BlockedPeriod` ativo sem occupancy e occupancy ativa de owner inativo;
- privilégios DML mínimos para `barber_runtime` e revogação de Data API roles;
- ausência de `DELETE` de occupancy para a role runtime.

Não há tabela, FK, coluna ou comportamento de `Appointment` nesta migration. Uma migration futura explicitamente autorizada terá de ampliar a ownership de `ScheduleOccupancy` para o XOR canônico, sem recriar a garantia de overlap.

## Algoritmo de disponibilidade

Entrada implementada:

- data local;
- timezone IANA do `Business`;
- duração positiva do `Service`;
- horários locais candidatos fornecidos explicitamente;
- jornada semanal e pausas;
- exceção daquela data;
- bloqueios ativos.

Processamento:

1. valida data, duração e timezone IANA;
2. resolve o dia ISO da semana sem usar timezone implícito da máquina;
3. usa jornada semanal menos pausas quando não há exceção;
4. aplica `CLOSED` como indisponibilidade total ou `REPLACE` como substituição integral da semana;
5. converte cada início local no servidor via Temporal;
6. rejeita gap DST e escolhe a primeira ocorrência cronológica no fold;
7. calcula o fim por duração decorrida e exige que o intervalo completo caiba em uma única faixa efetiva;
8. rejeita overlap UTC com qualquer `BlockedPeriod` ativo;
9. ordena os resultados pelo instante UTC.

O retorno explicita `cadenceApplied: false`. A função não presume 15, 30 ou qualquer outro passo.

## Semântica de intervalos

- Faixas recorrentes e excepcionais permanecem horas locais, não instantes persistidos.
- Candidatos e bloqueios são comparados como intervalos half-open `[)`.
- Um serviço que termina exatamente no fechamento cabe.
- Intervalos adjacentes não conflitam.
- Um bloqueio parcial elimina apenas candidatos cujo intervalo efetivo o sobreponha.
- Um bloqueio fora da faixa de trabalho não cria disponibilidade nem altera as faixas efetivas.

## Timezone e DST

- O timezone vem do `Business` e é validado como identificador IANA; offsets numéricos não são aceitos como timezone.
- Conversões local → UTC ocorrem somente no servidor.
- Gaps retornam `NONEXISTENT_LOCAL_TIME` e não produzem slot.
- Folds retornam `AMBIGUOUS_FIRST` e usam a primeira ocorrência cronológica.
- Duração é aplicada ao instante, preservando tempo decorrido ao atravessar mudança de offset.
- Testes alternando o `TZ` do processo entre `UTC`, `Asia/Tokyo` e `America/Los_Angeles` produziram o mesmo resultado.
- `BlockedPeriod` persiste instantes UTC e `timezone_snapshot`; o motivo privado não entra no resultado público do motor.

## Auth, AuthZ e BusinessScope

- O baseline Supabase Auth SSR da Sprint 1 não foi refatorado.
- O usuário é revalidado no servidor; autenticação continua separada da autorização do `Business`.
- Os contextos de exceções e bloqueios recebem `BusinessScope` resolvido no servidor.
- Todas as queries de repositório filtram pelo `business_id` do scope.
- IDs pertencentes a outro Business são tratados como inexistentes.
- Composite FKs preservam o mesmo `Business` entre bloqueio e occupancy.
- Os schemas de input são estritos e não possuem `business_id`.
- Browser/Data API não receberam acesso às tabelas privadas.

## Evidência de PostgreSQL real

Foram observados e testados:

- migration history completa e ordenada;
- extension `btree_gist` 1.8;
- exclusion constraint `EXCLUDE USING gist (business_id WITH =, occupied_period WITH &&) WHERE (released_at IS NULL)`;
- conflito de overlap com SQLSTATE `23P01`, convertido para `BLOCKED_PERIOD_CONFLICT`;
- violação de unicidade da exceção com SQLSTATE `23505`;
- integridade diferível owner/occupancy com SQLSTATE `23514`;
- tentativa de `DELETE` de occupancy pela runtime com SQLSTATE `42501`;
- conexão reutilizável após rollback/erro;
- adjacency permitida e mesmo intervalo permitido em Businesses diferentes;
- inativação do bloqueio e preenchimento de `released_at` na mesma transação.

## Testes e gates

| Gate | Resultado |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, zero warnings |
| `npm test` | PASS — 21 arquivos, 61 testes |
| `npm run test:integration` contra PostgreSQL real | PASS — 4 arquivos, 20 testes |
| `npm run test:e2e` | PASS — 7 testes, 1 worker determinístico |
| `npm run build` | PASS — Next.js 16.3.2/Turbopack |
| Supabase CLI migration replay | PASS — 4 migrations |
| Supabase database advisors | PASS — nenhum achado |

O E2E da Sprint 3 cobre login administrativo, criação de horário excepcional, criação de bloqueio pontual e persistência após reload. A consulta pública não pertence ao critério final deste checkpoint enquanto a cadência continuar aberta.

## Decisões ainda abertas

1. Valor inicial de `BusinessSchedulingPolicy.slot_step_minutes`.
2. Se essa cadência será editável no painel.

Essas decisões não bloqueiam o PASS da Sprint 3, mas precisam ser fechadas antes de a Sprint 4 implementar seleção pública de horários. Nenhuma foi preenchida por default silencioso.

## Riscos e pendências

- Sem cadência aprovada, deliberadamente ainda não existe enumerador de grade nem fluxo público serviço → data → slots.
- O motor valida candidatos explícitos; a Sprint 4 deverá compor Service, políticas e conjuntos escopados em um caso de uso público somente depois da decisão de cadência.
- Buffers e demais políticas não foram inventados nem aplicados quando as fontes não fornecem valores implementáveis.
- A ownership de occupancy está deliberadamente limitada a `BlockedPeriod`; Appointment não pode ser implementado sem uma migration incremental que conclua o XOR e as FKs canônicas.
- A migration existe somente no repositório/local; DEV hospedado continua sem a Sprint 3.
- O arquivo apagado em `supabase/paused-migrations/20260823231127_sprint_3_date_availability_exceptions.sql` já estava nesse estado ao retomar e não foi recriado nem alterado.

## Próxima ação exata

Antes de iniciar Sprint 4:

1. decidir o valor de `slot_step_minutes` e se ele será editável;
2. aplicar a migration em Supabase DEV somente em uma ação posterior explicitamente autorizada;
3. iniciar seleção pública/enumeração de slots apenas após essas duas condições, em escopo próprio da Sprint 4.
