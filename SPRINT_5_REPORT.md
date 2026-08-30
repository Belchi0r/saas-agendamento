# Sprint 5 — Agenda Operacional do Profissional

## 1. Resultado final

**PASS**

A Sprint 5 entrega a operação diária do profissional: Hoje, Agenda por dia, detalhes, conclusão, não comparecimento, cancelamento administrativo, agendamento manual, Clientes e Menu. Os oito cenários operacionais definidos estão disponíveis e foram validados sem iniciar Sprint 5.1.

Nenhuma migration 0–4 foi alterada. Nenhum banco Supabase DEV foi usado, nenhuma mutação remota foi executada, nenhum commit foi criado e não foram implementados WhatsApp automático, notificações ou lista de espera.

## 2. Decisões de produto aplicadas

- Navegação principal: `Hoje`, `Agenda`, `Clientes` e `Menu`.
- Serviços, horários, datas especiais e bloqueios permanecem em `Menu`.
- Hoje e Agenda usam o timezone IANA do `Business`, com itens em ordem cronológica e status textual em português.
- O cancelamento administrativo é permitido independentemente da política pública, conforme RF-033 e a tabela canônica de transições.
- `CONFIRMED → COMPLETED` e `CONFIRMED → NO_SHOW` preservam a occupancy ativa.
- `CONFIRMED → CANCELLED` grava `cancelled_at`, `cancellation_actor = ADMIN`, evento e libera `ScheduleOccupancy.released_at`; não há `DELETE`.
- O agendamento manual respeita serviço ativo, jornada, exceções, bloqueios, antecedência, horizonte, cadência, occupancies e exclusion constraint usados pela reserva pública. Não existe override administrativo.
- Cada agendamento manual cria seu próprio `Customer`; WhatsApp não é único e não há merge automático.
- Detalhes e histórico usam snapshots persistidos. Mudanças futuras no serviço não reescrevem agendamentos existentes.
- “Chamar no WhatsApp” abre `wa.me` com o E.164 persistido e não envia mensagem automaticamente.

## 3. Implementação

### Aplicação e persistência

- Casos de uso de agenda por dia, cálculo de “Hoje” no timezone do negócio, próximo atendimento e transições operacionais.
- Repositório PostgreSQL com todas as consultas escopadas por `business_id` resolvido no servidor.
- Transições com lock do `Business`, lock do `Appointment`, versão otimista, evento e efeito de occupancy na mesma transação.
- Agendamento manual idempotente com `origin = ADMIN`, usando o mesmo motor de disponibilidade e a mesma transação/constraint do booking público.
- Busca simples de clientes por nome ou WhatsApp, detalhes, próximo agendamento e histórico.

### Delivery e UI

- `/admin/hoje`
- `/admin/agenda`
- `/admin/agenda/novo`
- `/admin/agenda/[appointmentId]`
- `/admin/clientes`
- `/admin/clientes/[customerId]`
- `/admin/menu`
- APIs administrativas para disponibilidade, datas, criação manual e transições.
- Todas as páginas e APIs administrativas revalidam o usuário via Supabase Auth `getUser()`, resolvem `BusinessScope` no servidor e retornam conteúdo autenticado `private, no-store`.
- Mutações exigem método permitido, `Origin` e `Host` confiáveis.

## 4. Migration

Nova migration oficial criada pela Supabase CLI:

`20260829225836_sprint_5_operational_agenda.sql`

Ela concede ao `barber_runtime` somente os privilégios adicionais necessários:

- leitura de `Customer`, `AppointmentEvent` e `ScheduleOccupancy`;
- atualização apenas das colunas de estado/versão/cancelamento de `Appointment`;
- atualização apenas de `ScheduleOccupancy.released_at`.

Não há concessão de `DELETE`, alteração de schemas gerenciados pelo Supabase nem acesso direto para `anon`, `authenticated` ou `service_role`.

Replay local: **PASS — 6/6 migrations oficiais aplicadas em ordem** no PostgreSQL descartável.

## 5. Banco de validação

`TEST_DATABASE_URL` foi definida somente no processo de validação. A checagem programática, sem imprimir URL completa ou credentials, confirmou:

| Campo | Valor |
|---|---|
| presente | `true` |
| host | `127.0.0.1` |
| port | `5432` |
| database | `saas_agendamento_test` |

A primeira chamada da Supabase CLI tentou SSL, não suportado pelo PostgreSQL local. O replay foi repetido no mesmo alvo validado com `sslmode=disable` e passou. Nenhuma conexão remota foi usada.

## 6. Testes

### Unitários e componentes

**PASS — 25 arquivos, 114 testes.**

Incluem timezone do Business, faixa diária half-open, mapeamento das três transições, ausência/cross-scope e navegação operacional.

### PostgreSQL real

**PASS — 6 arquivos, 42 testes.**

Cobertura específica da Sprint 5:

- Hoje no timezone do negócio e Agenda em ordem cronológica;
- detalhes e eventos;
- concluir e no-show preservando occupancy;
- cancelamento administrativo com ator, timestamp, evento e liberação;
- transição inválida/stale rejeitada;
- criação manual com `origin = ADMIN` e replay idempotente;
- booking manual mesmo com booking público desativado;
- concorrência admin × admin;
- concorrência admin × público;
- concorrência admin × `BlockedPeriod`;
- WhatsApp repetido mantendo clientes separados;
- snapshots históricos preservados após alteração do serviço;
- isolamento por `BusinessScope` em agenda, detalhes e clientes.

### E2E e regressão

**PASS — 10/10 testes.**

- Fluxo operacional: login, criação manual, detalhes, link WhatsApp, conclusão, busca e histórico do cliente.
- Acesso administrativo sem sessão redirecionado ao login.
- Regressão completa das Sprints 1–4, incluindo booking público e capability.

Total automatizado: **166 testes aprovados** — 114 unitários/componentes, 42 PostgreSQL e 10 E2E.

## 7. Validação visual mobile

**PASS** em navegador local real:

- 390×844: login, Hoje, novo agendamento, detalhes, Clientes e Menu;
- 360×800: serviço, data, horário, dados do cliente e revisão;
- sem overflow horizontal, overlay de erro ou mensagens de console;
- alvos interativos mantêm altura adequada para toque;
- status é textual, não depende apenas de cor;
- nenhum identificador técnico é exibido ao usuário.

## 8. Gates finais

| Gate | Resultado | Evidência |
|---|---|---|
| Replay das migrations | PASS | 6/6 no PostgreSQL local descartável |
| Typecheck | PASS | `tsc --noEmit`, exit code 0 |
| Lint | PASS | ESLint sem warnings/erros |
| Unitários/componentes | PASS | 114/114 |
| PostgreSQL real | PASS | 42/42 |
| Concorrência | PASS | admin×admin, admin×público, admin×BlockedPeriod |
| E2E público/admin | PASS | 10/10 |
| Regressão | PASS | Sprints 1–4 incluídas no E2E e suítes unitárias/integração |
| Visual mobile | PASS | 390×844 e 360×800 |
| Build | PASS | Next.js 16.3.2, build de produção |
| `git diff --check` | PASS | nenhum erro de whitespace |

## 9. Correções feitas durante a validação

1. Tipagem explícita dos parâmetros `status` e `timestamptz` no SQL de transição, eliminando inferência inconsistente do PostgreSQL.
2. Atualização de teste legado da Sprint 4.2 que proibia a navegação agora exigida pela Sprint 5.
3. Sincronização do E2E com o redirect de login para evitar navegação antes da persistência da sessão.
4. Renovação da chave idempotente quando a intenção do agendamento manual muda.
5. Exposição de todas as datas válidas do horizonte no fluxo manual.
6. Horários da lista renderizados a partir do instante persistido no timezone atual do `Business`; os snapshots continuam preservados nos detalhes/histórico.

## 10. Riscos e itens adiados

- O harness concorrente existente ainda emite warning do `pg` sobre `client.query()` durante uma consulta em andamento. A integridade e os resultados são corretos, mas o harness deve ser serializado antes do `pg@9`.
- Operações públicas de cancelamento/remarcação, reemissão de capability administrativa, notificações, WhatsApp API, lista de espera e automações permanecem fora da Sprint 5.
- Sprint 5.1 não foi iniciada.

## 11. Liberação

**Sprint 5: PASS.**

Os oito cenários operacionais obrigatórios estão disponíveis: ver Hoje, navegar na Agenda, abrir detalhes, concluir, marcar no-show, cancelar, criar manualmente e consultar Clientes.

**Sprint 5.1 está liberada para planejamento, mas não foi iniciada.**
