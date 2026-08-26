# SPRINT_2_REPORT

## Resultado

**PASS**

Em 23 de agosto de 2026, a vertical slice de horários semanais foi concluída de ponta a ponta: UI → Delivery → Application → Domain → Persistence → PostgreSQL. O administrador autenticado consegue criar, editar, listar e remover `WeeklyWorkingWindow` e `WeeklyBreak`; uma recarga lê a configuração persistida. Sprint 3 não foi iniciada.

## Ambiente e versões

| Componente | Versão/ambiente validado |
|---|---|
| Node.js | 24.19.0 |
| npm | 10.9.8 |
| Next.js | 16.3.2, App Router, runtime Node |
| React | 19.2.8 |
| TypeScript | 6.0.3, strict |
| `@supabase/ssr` | 0.12.4 |
| Supabase CLI | 2.115.0 |
| Drizzle ORM | 0.45.2 |
| `pg` | 8.23.0 |
| PostgreSQL real local | 18.4, efêmero, conexão TCP real |
| PostgreSQL de CI configurado | 17 |
| Vitest | 4.1.11 |
| Playwright | 1.62.1, Chromium |

## Funcionalidades

- página administrativa `/admin/horarios`, mobile-first, em lista de segunda a domingo;
- estado explícito “Não trabalha” para dias sem faixa;
- criação, edição e remoção de múltiplas faixas de trabalho por dia;
- criação, edição e remoção de pausas semanais;
- resumo legível de trabalho e pausas por dia;
- navegação mínima entre Serviços e Horários;
- mensagens humanas para intervalos inválidos, sobreposição, pausa fora da jornada e conflito de versão;
- recarga da página a partir do PostgreSQL, sem estado local como fonte de verdade.

O modelo não define `active` nem soft delete para essas entidades. Portanto, “remover” executa `DELETE` físico escopado, dentro da mesma transação que incrementa `Business.availability_version`. Isso não altera a política distinta de `ScheduleOccupancy`, que continua sem `DELETE` no runtime.

## Migration

Migration oficial criada pela Supabase CLI:

`supabase/migrations/20260823223518_sprint_2_weekly_availability.sql`

Ela cria somente:

- `app_private.weekly_working_window`;
- `app_private.weekly_break`;
- `btree_gist` no schema padrão `extensions`;
- índices B-tree por `(business_id, weekday, start_local_time)`;
- exclusion constraints GiST por negócio, dia e intervalo local `[)`.

A aplicação do zero executou, em ordem, Sprint 0, Sprint 1 e Sprint 2 e terminou com `Finished supabase db push`. A Supabase CLI foi o único aplicador; não houve `drizzle push`. O advisor de segurança/performance da CLI terminou com `results: []` e “No issues found”.

As migrations não alteram `auth`, `storage` ou outros schemas internos do Supabase.

## Invariantes

| Invariante | Mecanismo | Evidência |
|---|---|---|
| weekday ISO 1–7 | Domain + Zod + `CHECK` | unitário e SQLSTATE `23514` |
| início anterior ao fim | Domain + Zod/Use Case + `CHECK` | unitário, integração e UI |
| faixa não atravessa meia-noite | consequência de início `<` fim no mesmo dia | unitário |
| múltiplas faixas por dia | permitido | integração com faixas adjacentes |
| working windows não sobrepostos | Domain + GiST exclusion | erro de domínio e SQLSTATE `23P01` |
| breaks não sobrepostos | Domain + GiST exclusion | unitário e constraint equivalente |
| adjacência `[)` | aceita | `09:00–12:00` + `12:00–18:00` |
| pausa intersecta faixa útil do mesmo dia | Domain dentro da transação serializada | unitário e integração PostgreSQL |
| remoção de faixa não deixa pausa órfã | projeção/validação antes da escrita | integração prova rollback atômico |
| alteração concorrente não sobrescreve configuração nova | lock da linha Business + `availability_version` | conflito `AVAILABILITY_VERSION_CONFLICT` |

A política de sobreposição não estava aberta nas fontes: o Data Model proíbe sobreposição entre faixas do mesmo tipo. Não foi criada regra adicional de união, arredondamento, cópia automática ou contenção total de pausa.

Uma pausa `12:00–13:00` entre duas faixas separadas `09:00–12:00` e `13:00–18:00` não intersecta jornada e é rejeitada. As representações canônicas equivalentes são: uma faixa `09:00–18:00` com pausa `12:00–13:00`, ou duas faixas separadas sem pausa redundante.

## Timezone e semântica local

- `weekday`, `start_local_time` e `end_local_time` permanecem regras locais recorrentes;
- a persistência usa `time without time zone`, nunca `timestamptz`;
- a tela informa o timezone IANA atual do `Business`;
- nenhuma conversão para UTC ocorre nesta slice;
- o `int4range` da exclusion constraint representa apenas segundos desde a meia-noite local para comparar intervalos; não cria nem persiste um instante UTC;
- nenhuma regra depende do timezone do processo ou do browser.

A validação de timezone IANA e a política de mudança de timezone continuam sustentadas pelo baseline/SPK-004. Esta slice não implementa edição do timezone.

## AuthN × AuthZ

O baseline da Sprint 1 foi reutilizado sem refatoração:

1. `@supabase/ssr` cria client server-side por request;
2. identidade é revalidada pelo boundary confiável existente, sem usar `getSession()` para autorizar;
3. `resolveAdminAccess` separa AuthN de AuthZ;
4. o usuário autenticado precisa corresponder a `Business.admin_auth_user_id`;
5. somente depois é criado `BusinessScope` server-side;
6. Route Handlers mutáveis validam método, `Origin` e `Host`;
7. páginas e respostas autenticadas usam `private, no-store` e `Vary: Cookie`.

O E2E cobre ausência de sessão, usuário Auth não mapeado e administrador correto. A fronteira Auth externa continua determinística no CI; a aplicação usa o pacote oficial e a evidência hospedada do SPK-005 não foi reexecutada.

## BusinessScope e privilégios

- o browser nunca envia nem escolhe `business_id`;
- DTOs enviados ao Client Component omitem `businessId` e timestamps de persistência;
- schemas Zod estritos rejeitam `business_id`, `businessId` e qualquer campo extra;
- todos os `SELECT`, `UPDATE` e `DELETE` incluem `BusinessScope` resolvido no servidor;
- duas instâncias de `Business` nos testes provam isolamento e permitem o mesmo intervalo local em negócios diferentes;
- tentativa de editar ID pertencente a outro negócio retorna `WEEKLY_ITEM_NOT_FOUND` e preserva a linha original.

Privilégios adicionados à role mínima:

| Objeto | Privilégios do runtime |
|---|---|
| `business` | `SELECT`; `UPDATE` somente de `availability_version` e `updated_at` |
| `weekly_working_window` | `SELECT`, `DELETE`, `INSERT` e `UPDATE` apenas das colunas canônicas necessárias |
| `weekly_break` | `SELECT`, `DELETE`, `INSERT` e `UPDATE` apenas das colunas canônicas necessárias |

`anon`, `authenticated`, `service_role` e `PUBLIC` não recebem acesso ao domínio privado. O browser continua usando Supabase somente para Auth.

## Testes e gates

| Gate | Resultado |
|---|---|
| `npm test` | **46/46 PASS**, 16 arquivos |
| `npm run test:integration` | **14/14 PASS**, 3 arquivos |
| `npm run test:e2e` | **5/5 PASS**, incluindo 2 cenários da Sprint 2 |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS**, zero warnings |
| `npm run build` | **PASS** |
| migrations do zero via Supabase CLI | **PASS** |
| Supabase database advisors | **PASS**, nenhum achado |

Cobertura específica:

- create/update/delete de working window e break;
- horários e weekday inválidos;
- adjacência e sobreposição;
- pausa fora da jornada;
- rollback ao tentar remover a única faixa que sustenta uma pausa;
- persistência e recarga;
- isolamento entre dois Businesses;
- versão otimista;
- SQLSTATEs `23P01` e `23514` e reutilização da conexão após erro;
- sessão ausente, usuário incorreto e administrador correto;
- rejeição de autoridade de Business enviada pelo browser;
- E2E login → Horários → faixa → pausa → reload → dados preservados.

## Riscos

- A relação “pausa intersecta trabalho” pertence deliberadamente ao Domain/Application, conforme o Data Model. A role runtime poderia violá-la se código futuro executar SQL direto e contornar o repositório; qualquer SQL desse tipo exige revisão e teste. Não foi inventado trigger cross-table nesta slice.
- Alterações de disponibilidade precisarão verificar appointments futuros quando `Appointment` existir. Essa interação não pode ser provada antes da slice correspondente e não foi simulada.
- `@supabase/ssr` permanece em evolução; a versão continua fixada e protegida pelos testes do baseline.
- Configuração por segundo é aceita pelo domínio/DB, embora a UI operacional use precisão de minuto. Nenhum arredondamento silencioso é feito.
- `npm ci` reportou quatro advisories moderados no grafo de dependências existente. Nenhum `audit fix` automático foi aplicado para não introduzir upgrades breaking fora do escopo; a triagem pertence a uma tarefa separada de manutenção de dependências.

## Decisões ainda abertas

Nenhuma decisão aberta bloqueou `WeeklyWorkingWindow` ou `WeeklyBreak`.

Continuam fora desta slice e sem default inventado:

- semântica de `buffer_minutes`;
- cadência/`slot_step_minutes`;
- política inicial de antecedência e cancelamento;
- comportamento de alterações de disponibilidade diante de appointments futuros;
- eventual constraint customizada de banco para a relação faixa–pausa.

## Fora do escopo preservado

Não foram implementados `DateAvailabilityException`, `ExceptionWorkingWindow`, `BlockedPeriod`, geração de slots, `Appointment`, `ScheduleOccupancy`, cliente, booking, reschedule, capability token, idempotência, dashboard, financeiro ou WhatsApp.

## Próxima vertical slice recomendada

A próxima slice canônica é **Ajustes de disponibilidade (`BusinessSchedulingPolicy`)**, mas somente após fechar explicitamente as decisões ainda abertas de `slot_step_minutes`, buffer, antecedência e cancelamento. A próxima ação exata é realizar esse checkpoint de produto/arquitetura; não iniciar implementação com defaults silenciosos. Sprint 3 não foi iniciada nesta entrega.
