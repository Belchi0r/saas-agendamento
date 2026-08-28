# Sprint 4 — Public Booking

## Resultado

**PASS**

A vertical slice pública foi concluída de ponta a ponta: serviço ativo → data → horários calculados → dados do cliente → revisão → confirmação transacional → `Appointment`/`ScheduleOccupancy` persistidos → capability segura de leitura do próprio agendamento.

Não houve aplicação remota, `supabase db push`, alteração das migrations 0–3 nem início da Sprint 5. O `Business.public_booking_enabled` existente não foi alterado; a implementação não publica a agenda automaticamente.

## Ambiente validado

| Componente | Versão/ambiente |
|---|---|
| Node.js | 24.19.0 |
| Next.js | 16.3.2, runtime Node.js |
| PostgreSQL local real | `embedded-postgres` 18.4.0-beta.17, loopback descartável |
| Supabase CLI | 2.115.0 |
| `pg` | 8.23.0 |
| Drizzle ORM | 0.45.2 |
| Temporal polyfill | 0.5.1 |
| Vitest | 4.1.11 |
| Playwright | 1.62.1 |

## Funcionalidades entregues

- Fluxo público mobile-first em etapas, sem conta de cliente e sem `business_id` aceito do browser.
- Enumeração efêmera com cadência explícita de 15 minutos; a duração continua sendo a duração própria do serviço.
- Aplicação de timezone IANA, jornada semanal, pausas, exceções `CLOSED`/`REPLACE`, ocupações de `BlockedPeriod`/`Appointment`, antecedência, horizonte, serviço ativo e publicação explícita.
- Conversão local → UTC exclusivamente no servidor via Temporal, inclusive política de gap/fold já aprovada.
- Confirmação que ignora a disponibilidade previamente exibida e recalcula os fatos dentro de uma única conexão/transação.
- Criação atômica de `Customer`, `Appointment`, `ScheduleOccupancy`, `AppointmentEvent`, token de acesso e recibo idempotente.
- `Appointment` inicial `CONFIRMED`, snapshots de serviço/cliente/timezone/data/hora/offset e intervalos half-open `[)`.
- Conflito final da exclusion constraint `23P01` convertido em `409 BOOKING_SLOT_UNAVAILABLE`, sem `Appointment` órfão.
- WhatsApp normalizado para E.164, indexado para busca, mas deliberadamente não único e sem merge automático.
- Página `/manage` limitada à leitura do próprio agendamento; cancelamento/remarcação não foram inventados nem implementados.

## Migration

Foi criada a migration oficial:

`supabase/migrations/20260826192118_sprint_4_public_booking.sql`

Ela adiciona:

- `BusinessSchedulingPolicy`, com `slot_step_minutes NOT NULL`, constraint do valor aprovado `15` e **sem default**;
- `Customer`, `Appointment`, `AppointmentEvent`, `AppointmentAccessToken` e `IdempotencyRequest` no schema `app_private`;
- vínculo de `ScheduleOccupancy` com exatamente um proprietário (`BlockedPeriod` ou `Appointment`);
- FK composta por Business, índices, constraints de shape, trigger diferido de `Appointment` × occupancy e grants mínimos do runtime;
- revogação explícita para roles/Data API e preservação da ausência de `DELETE` de occupancy no runtime.

O nome/timestamp foi produzido pelo Supabase CLI. Como o CLI 2.115.0 não conseguiu criar o arquivo diretamente sob o reparse point do OneDrive, a geração vazia foi feita em diretório descartável e o arquivo oficial foi então preenchido no diretório canônico. Nenhum SQL foi aplicado por Drizzle.

Replay do zero observado em PostgreSQL local novo:

```text
20260823210417_sprint_0_foundation.sql
20260823214240_sprint_1_services_vertical_slice.sql
20260823223518_sprint_2_weekly_availability.sql
20260823231127_sprint_3_date_availability_exceptions.sql
20260826192118_sprint_4_public_booking.sql
```

Comando aplicador: `supabase migration up --db-url <loopback-redacted> --include-all`. As migrations 0–3 permaneceram sem alterações.

## Disponibilidade e concorrência

- Slots livres não são persistidos.
- A cadência começa em cada janela efetiva e avança de 15 em 15 minutos.
- O intervalo completo do serviço deve caber na janela e não pode sobrepor occupancy ativa.
- Adjacência é aceita por `[)`: um serviço pode começar exatamente quando outro termina.
- `ScheduleOccupancy` continua sendo a capacidade concreta e a exclusion constraint GiST é a garantia final.
- A confirmação obtém o lock da configuração do Business antes do serviço e mantém a conexão transacional até o commit.
- Leitura de fatos na conexão crítica é sequencial, compatível com `pg` e Supavisor transaction mode.
- Booking × booking no mesmo intervalo: exatamente um commit; o perdedor recebe 409.
- Booking × `BlockedPeriod`: a ordem global de locks serializa a operação; o bloqueio vencedor faz o booking falhar com 409.

## Idempotência e capability

- Chave de idempotência é HMAC-SHA-256 com pepper externo e nunca é persistida em claro.
- Fingerprint canônico/versionado: `public-booking/v1`.
- Advisory lock transacional serializa a mesma chave sem ampliar privilégios do runtime.
- Mesmo request retorna o mesmo Appointment/link; mesma chave com request diferente retorna 409 explícito.
- O efeito e o recibo são gravados na mesma transação.
- O envelope de recuperação é AES-256-GCM autenticado, com chave versionada, TTL de 24 horas e recibo de 72 horas.
- Token de gerenciamento é CSPRNG de 256 bits; somente HMAC-SHA-256 é persistido.
- Existe no máximo um token ativo por Appointment; rotação e revogação são transacionais e foram testadas.
- O token bruto chega por fragmento, é removido da URL antes do exchange e vira cookie de 10 minutos: `HttpOnly; Secure; SameSite=Strict; Path=/manage`.
- Respostas de booking/manage são `private, no-store` e `Referrer-Policy: no-referrer`; não há logging de token, nome ou WhatsApp no fluxo implementado.

## Gates

| Gate | Resultado observado |
|---|---|
| Typecheck | PASS — `tsc --noEmit --incremental false` |
| Lint | PASS — ESLint, zero warnings |
| Unitários | PASS — 23 arquivos, 70 testes |
| Integração PostgreSQL real | PASS — 5 arquivos, 25 testes |
| E2E | PASS — 8 testes, incluindo o fluxo público completo e capability |
| Build | PASS — Next.js 16.3.2, 11 páginas geradas/coletadas |
| Replay de migrations | PASS — 5 migrations aplicadas do zero pelo Supabase CLI |
| Contratos migration/arquitetura | PASS — incluídos nos unitários |
| `git diff --check` | PASS |

Os testes cobrem explicitamente cadência de 15 minutos, durações independentes, pausa, exceções, data fechada, bloqueio/occupancy, timezone/DST, `[)`, serviço inativo, agenda desligada, configuração incompleta, criação, concorrência, retry, fingerprint incompatível, capability, ausência do token bruto em persistência, atomicidade, snapshots e WhatsApp não único. A integração da Sprint 4 usa a role runtime real, não o usuário administrador do banco.

## Decisões de implementação

- `BusinessSchedulingPolicy` é obrigatório para publicação e confirmação; nenhuma configuração é inferida.
- Como a semântica de buffer continua aberta nas fontes, `buffer_minutes` não nulo e diferente de zero bloqueia a agenda em vez de inventar comportamento.
- O acesso do cliente nesta sprint é somente leitura. Cancelamento e remarcação continuam fora do escopo até decisão de produto/Sprint autorizada.
- A resolução do Business da página pública exige exatamente um singleton publicado; o gerenciamento resolve o singleton operacional no servidor e nunca recebe escopo do browser.
- Locks desnecessários que exigiriam ampliar a role runtime foram evitados: idempotência usa advisory lock e rotação bloqueia apenas o token mutável.

## Arquivos alterados

### Configuração e runtime

- `.env.example`
- `next-env.d.ts`
- `next.config.ts`
- `playwright.config.ts`
- `src/infrastructure/config/server-env.ts`
- `src/infrastructure/time/temporal.ts`
- `src/infrastructure/composition/public-booking-context.ts`
- `src/infrastructure/security/booking-secrets.ts`

### Delivery e UI

- `src/app/api/public/availability/route.ts`
- `src/app/api/public/bookings/route.ts`
- `src/app/api/public/manage/exchange/route.ts`
- `src/app/manage/page.tsx`
- `src/components/public/service-catalog.tsx`
- `src/components/public/management-bootstrap.tsx`
- `src/delivery/booking/public-booking-input.ts`
- `src/delivery/http/json-response.ts`

### Application, Domain e Persistence

- `src/application/availability/calculate-availability.ts`
- `src/application/booking/public-booking-repository.ts`
- `src/application/booking/public-booking-use-cases.ts`
- `src/application/business/resolve-business-scope.ts`
- `src/domain/booking/public-booking.ts`
- `src/persistence/booking/postgres-public-booking-repository.ts`
- `src/persistence/business/business-repository.ts`
- `src/persistence/database/schema/index.ts`
- `supabase/migrations/20260826192118_sprint_4_public_booking.sql`

### Testes

- `tests/e2e/sprint-4-public-booking.spec.ts`
- `tests/e2e/support/start-environment.mjs`
- `tests/e2e/support/stop-environment.mjs`
- `tests/integration/public-booking-vertical-slice.test.ts`
- `tests/integration/date-blocked-availability-vertical-slice.test.ts`
- `tests/integration/service-vertical-slice.test.ts`
- `tests/integration/weekly-availability-vertical-slice.test.ts`
- `tests/unit/booking/public-booking.test.ts`
- `tests/unit/booking/security.test.ts`
- `tests/unit/database/migration-contract.test.ts`
- `SPRINT_4_REPORT.md`

Os três testes de integração legados foram ajustados somente para limpar, na ordem transacional válida, os novos registros de Appointment/token/idempotência antes dos fixtures das Sprints 1–3.

## Riscos e pendências reais

- A migration ainda não está no Supabase DEV; isso foi deliberado e exigirá aprovação separada.
- Antes de qualquer piloto, precisam existir secrets independentes de 32 bytes para token, idempotência, envelope e cookie, além da política explícita do Business. Chaves antigas do envelope devem permanecer disponíveis durante a janela de recuperação.
- A reemissão administrativa após expiração do envelope existe na camada de aplicação, mas não ganhou UI/endpoint administrativo porque isso invadiria a Sprint 5.
- Cancelamento/remarcação pelo cliente seguem indisponíveis até a política de produto ser fechada.
- `buffer_minutes` não zero bloqueia a publicação até sua semântica ser aprovada.
- O banco local foi PostgreSQL 18.4 beta embarcado. Não surgiu garantia nova dependente do ambiente gerenciado; Supavisor, migrations e schema privado já foram comprovados nos spikes aceitos.

## Divergências arquiteturais

Nenhuma divergência conhecida. O escopo continua server-side, o domínio permanece privado, a role runtime é mínima, a capacidade termina no PostgreSQL e segredos brutos não são persistidos.

## Próxima ação exata

Revisar e aprovar separadamente `20260826192118_sprint_4_public_booking.sql`; depois, em uma janela autorizada, provisionar as variáveis de segurança (quatro materiais secretos independentes e a versão ativa do envelope), inserir/confirmar explicitamente `BusinessSchedulingPolicy(slot_step_minutes = 15)`, aplicar a migration no DEV via Supabase CLI e executar smoke test mantendo `public_booking_enabled = false` até a publicação ser aprovada. Não iniciar a Sprint 5 automaticamente.
