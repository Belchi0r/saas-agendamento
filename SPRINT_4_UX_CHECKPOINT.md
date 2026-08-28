# Sprint 4 — UX Checkpoint

## Resultado

**PASS**

O fluxo público deixou de exigir que o cliente adivinhe a agenda: após escolher um serviço, a interface apresenta primeiro as próximas datas com horários realmente disponíveis. Escolher uma data carrega os horários diretamente, sem o botão intermediário `Ver horários`.

Sprint 5 não foi iniciada. Não houve aplicação remota, migration nova ou alteração das migrations 0–4, de `ScheduleOccupancy`, das invariantes de booking, nem dos mecanismos de token, segurança ou idempotência.

## UX entregue

- Serviço apresentado como uma linha inteira acionável, com nome, duração, preço, descrição e ação `Escolher` explícita.
- Progresso numerado com `aria-current="step"` na etapa atual e marcação visual das etapas concluídas.
- Descoberta server-side de datas dentro do horizonte e da antecedência, usando timezone IANA, duração, jornada semanal, pausas, `CLOSED`, `REPLACE` e occupancies ativas.
- Datas sem jornada, fechadas, fora da antecedência, incompatíveis com a duração ou completamente ocupadas não são apresentadas como opções normais.
- Classificação distinta entre `NOT_WORKING`, `TOO_SOON` e `FULLY_BOOKED`; slots continuam efêmeros e não são persistidos.
- Se uma data ficar sem horários entre a descoberta e a seleção, a interface explica a lotação e oferece a próxima disponibilidade acionável.
- Datas e horários possuem alvos de toque mobile adequados; a seleção de data abre diretamente a etapa de horário.
- Estados vazios explicam a situação e oferecem retorno aos serviços, sem tela morta.

## Implementação

Foi adicionado `GET /api/public/availability/dates?serviceId=...`. O endpoint resolve o `BusinessScope` singleton no servidor, rejeita campos extras como `business_id`, consulta o schema privado com a role runtime e devolve uma classificação efêmera do horizonte.

A persistência usa uma única conexão e consultas parametrizadas para carregar perfil, regras recorrentes, exceções e occupancies do intervalo. A confirmação de booking continua recalculando disponibilidade dentro da transação já existente; a descoberta de datas não concede reserva nem substitui a exclusion constraint.

## Evidência

| Caso | Resultado observado |
|---|---|
| Dia fora da jornada semanal | `NOT_WORKING / NO_WORKING_WINDOW`; não oferecido na UI |
| Exceção `CLOSED` | `NOT_WORKING / CLOSED`; não oferecida |
| Exceção `REPLACE` | horários da substituição usados; data oferecida quando o serviço cabe |
| Dia completamente ocupado | `FULLY_BOOKED / OCCUPIED`, distinto de ausência de jornada |
| Próxima disponibilidade | localizada no horizonte e apresentada após indisponibilidade superveniente |
| Data → horários | transição direta, sem `Ver horários` |
| BusinessScope | resolvido server-side; input com `business_id` rejeitado |
| Slots | calculados sob demanda; nenhuma persistência nova |

Verificação visual real no navegador, viewport `390 × 844`:

- página com conteúdo e sem overlay/erro de console;
- etapa atual e concluídas legíveis;
- botões de data com 74 px de altura;
- botões de horário com 48 px de altura;
- fluxo serviço → próximas datas → horários funcionando sem etapa intermediária.

## Gates

| Gate | Resultado |
|---|---|
| Typecheck | PASS |
| Lint | PASS — zero warnings |
| Unitários | PASS — 23 arquivos, 74 testes |
| Integração PostgreSQL real | PASS — 5 arquivos, 25 testes |
| E2E completo | PASS — 8 testes |
| Build Next.js 16.3.2 | PASS |
| Replay local das migrations 0–4 | PASS via Supabase CLI |
| `git diff --check` | PASS |

Os testes de integração/E2E mantiveram verdes concorrência, atomicidade, idempotência, capability token, autorização, jornada semanal, exceções e bloqueios.

## Migrations

Nenhuma migration foi criada ou modificada. Os SHA-256 das migrations 0–4 permaneceram:

- `20260823210417_sprint_0_foundation.sql`: `CECA0BB222D10A162151FC37E80BB1D0D52C1E2BCA0ACA984F094C936A7144A3`
- `20260823214240_sprint_1_services_vertical_slice.sql`: `40C86878721F8AC2B6F257B696B3122B4419FDBBB2E15D0CAD752E15E7C298AF`
- `20260823223518_sprint_2_weekly_availability.sql`: `5CE807C60C2F0E62864BA0172E2ADE918DC9488C6C5B585C2489CD22F2A0D596`
- `20260823231127_sprint_3_date_availability_exceptions.sql`: `15572B0BCDD230CC9A7AF8A25A98F7F136AEC8EB0D1AD09AFF042D673D066918`
- `20260826192118_sprint_4_public_booking.sql`: `BD7F7336B56E8F16218E8D90EF6D4804BC2AE860C7754DEF2C8A53E81E823B11`

## Riscos e próxima ação

A disponibilidade exibida continua sendo um retrato momentâneo; outro cliente pode ocupar o horário antes da confirmação. A UI trata essa mudança, e o PostgreSQL continua sendo a garantia final. A descoberta avalia todo o horizonte configurado em memória após leituras consolidadas; para o limite atual de 30 dias isso é pequeno, mas deve receber telemetria antes do piloto.

Próxima ação exata: validação manual final no DEV com dados representativos e, somente após aprovação separada, planejamento da Sprint 5.
