# Sprint 4.3 — Booking Integrity

## 1. Resultado final

**PASS**

A Sprint 4.3 foi validada integralmente contra um PostgreSQL 17.11 local e descartável. O replay das migrations oficiais, a integração real, os cenários concorrentes, a integridade de `Appointment`/`ScheduleOccupancy`, os fluxos E2E público e administrativo, a regressão automatizada, a inspeção visual mobile e os gates estáticos passaram.

Nenhuma migration 0–4 foi alterada. Nenhum banco Supabase DEV foi usado como banco de testes, nenhuma mutação remota foi executada, nenhuma funcionalidade da Sprint 5 foi iniciada e nenhum commit foi criado.

## 2. Banco PostgreSQL usado

Antes de qualquer teste, `TEST_DATABASE_URL` foi definida somente no processo PowerShell da validação. A inspeção programática confirmou, sem imprimir URL completa ou credenciais:

| Campo | Valor validado |
|---|---|
| `TEST_DATABASE_URL` presente | `true` |
| host | `127.0.0.1` |
| port | `5432` |
| database | `saas_agendamento_test` |

A conexão confirmou PostgreSQL 17.11, banco corrente `saas_agendamento_test`, porta 5432 e cliente loopback. O processo efêmero foi encerrado ao final; a variável não foi persistida e nenhum arquivo `.env` foi editado.

## 3. Replay das migrations oficiais

Os schemas de aplicação foram reconstruídos somente no banco local descartável e as migrations foram aplicadas em ordem:

1. `20260823210417_sprint_0_foundation.sql`
2. `20260823214240_sprint_1_services_vertical_slice.sql`
3. `20260823223518_sprint_2_weekly_availability.sql`
4. `20260823231127_sprint_3_date_availability_exceptions.sql`
5. `20260826192118_sprint_4_public_booking.sql`

Resultado: **PASS — 5/5 migrations, todos os processos com exit code 0.**

`git diff --name-only -- supabase/migrations` permaneceu vazio.

## 4. Resultado dos gates

| Gate | Resultado | Evidência |
|---|---|---|
| Replay das migrations | PASS | 5/5 migrations oficiais aplicadas em banco local vazio |
| Integração PostgreSQL real | PASS | 5 arquivos, 32 testes |
| Concorrência | PASS | booking × booking com exatamente um vencedor; configuração × `BlockedPeriod` com locks/constraints reais |
| Integridade `Appointment`/`ScheduleOccupancy` | PASS | agendamento confirmado preservado; occupancy não liberada; conflito termina na constraint PostgreSQL |
| E2E público | PASS | escolha de serviço/data/horário, máscara, confirmação, concorrente derrotado, capability e refresh |
| E2E admin | PASS | configuração semanal, substituição confirmada, refresh e alerta de reserva fora da nova regra |
| Regressão E2E | PASS | 8/8 testes |
| Validação visual mobile | PASS | 390×844 e 360×800; sem overflow ou erros de console |
| Typecheck | PASS | exit code 0 |
| Lint | PASS | exit code 0, sem warnings |
| Unitários | PASS | 24 arquivos, 108 testes |
| Build | PASS | Next.js 16.3.2, exit code 0 |
| `git diff --check` | PASS | nenhum erro de whitespace |

Total automatizado: **148 testes aprovados** — 108 unitários, 32 de integração PostgreSQL e 8 E2E.

## 5. Concorrência e integridade transacional

- Duas tentativas concorrentes para o mesmo horário produziram exatamente um booking confirmado e um conflito tratado.
- A exclusion constraint com intervalo half-open `[)` permaneceu como barreira final de concorrência.
- Alterar a jornada após uma reserva não mudou `Appointment.status = 'CONFIRMED'` e não preencheu `ScheduleOccupancy.released_at`.
- Criar pausa `12:00–14:00` após uma reserva das 13:00 com duração de 50 minutos preservou o Appointment e sua occupancy; uma nova tentativa concorrente no mesmo intervalo falhou.
- Exceção `CLOSED` preservou a reserva preexistente.
- Inserir `BlockedPeriod` sobre a occupancy confirmou o conflito no PostgreSQL com SQLSTATE `23P01` e rollback.
- O papel de runtime não ganhou caminho para `DELETE` físico de occupancy.

## 6. Slots de 45 e 50 minutos

Com cadência de início de 15 minutos:

- serviço de 45 minutos: último início válido às 19:15 para término às 20:00;
- serviço de 50 minutos: último início válido às 19:00; 19:15 não é oferecido;
- em janela 09:00–12:00, 50 minutos oferece 11:00 e rejeita 11:15;
- pausas, horários passados e occupancies removem somente os candidatos inválidos.

Resultado: **PASS** nos testes unitários e no E2E público real.

## 7. Configuração semanal Seg–Sáb

- Seg–Sáb, Seg–Sex e seleções descontínuas alteram somente os weekdays explicitamente escolhidos.
- Dias não selecionados permanecem intactos; domingo não é incluído implicitamente.
- Working windows e breaks usam o mesmo conjunto explícito de dias.
- Substituição continua exigindo confirmação e o refresh confirma o estado persistido.

Resultado: **PASS** em unidade, integração PostgreSQL e E2E admin.

## 8. Continuidade do booking e capability

- A confirmação pública troca o fragment token pelo cookie capability curto e validado.
- Após refresh, a home reconhece a reserva server-side e mostra “Você tem um agendamento”.
- `/manage` abre a reserva somente após revalidar assinatura, expiração, token/version e Appointment.
- O raw token não é salvo no banco, Web Storage, logs ou neste relatório.

Resultado: **PASS** em unitários e E2E.

## 9. Validação visual mobile

Inspeção real no navegador, usando somente o ambiente local:

- 390×844: login admin, criação de serviço, configuração semanal, catálogo público, data, slots, formulário, revisão, confirmação e alerta administrativo;
- 360×800: telas pública, administrativa e `/manage`;
- alvos de serviço, data, slot, inputs e CTAs mantiveram alturas adequadas para toque;
- textos críticos, inclusive aviso de reserva fora da nova jornada, ficaram legíveis;
- nenhum overflow horizontal, overlay indevido, erro de hidratação ou erro/warning de console foi observado.

Resultado: **PASS**.

## 10. Correções adicionais durante a validação

Nenhuma falha funcional de produção foi encontrada nesta retomada. Foram corrigidos somente defeitos de isolamento/sincronização dos testes E2E:

1. o teste semanal passou a aguardar o término da substituição antes do reload, evitando cancelar a própria requisição assíncrona;
2. o E2E público passou a preparar sua terça-feira independentemente do estado deixado por outro spec;
3. a asserção de limite do serviço de 45 minutos foi posicionada antes da criação da occupancy de 50 minutos que, corretamente, bloqueia o intervalo.

A cobertura também foi ampliada para comprovar limites 45/50, booking público completo, derrota concorrente com mensagem humana, refresh/capability e preservação do booking após mudança administrativa.

Na repetição final do build, um cache `.next` anterior marcado pelo OneDrive como reparse/read-only causou `EPERM`. O cache gerado foi isolado e removido; o build limpo passou. Nenhum código-fonte, lockfile ou dependência declarada foi alterado por essa correção ambiental.

## 11. Riscos restantes

- O driver `pg` emitiu warnings de depreciação em testes que chamam `client.query()` enquanto a mesma conexão já executa uma operação. Não houve falha ou perda de integridade, mas o harness deve futuramente serializar essas chamadas para permanecer compatível com versões futuras do driver.
- O cookie capability continua deliberadamente curto (`Max-Age=600`); recuperação duradoura sem conta permanece fora do escopo aprovado.

Nenhum risco restante bloqueia a Sprint 4.3.

## 12. Liberação

**Sprint 5 está liberada para começar, mas não foi iniciada nesta validação.**
