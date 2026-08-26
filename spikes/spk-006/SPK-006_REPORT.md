# SPK-006 — Business Scope, Private Schema and Runtime Privileges

## Resultado

**PASS**

Os mecanismos propostos são tecnicamente viáveis para o MVP singleton:

- o domínio pode permanecer em schema privado, fora da Data API;
- a conexão da aplicação pode operar com uma role PostgreSQL sem DDL, sem delegação efetiva de privilégios, sem `DELETE` e com `INSERT`/`UPDATE` limitados por coluna;
- `BusinessScope` pode ser obrigatório na construção dos repositórios e aplicado em todas as queries pertencentes ao Business;
- o Business público pode ser resolvido no servidor sem confiar em `business_id` do browser;
- o Business administrativo pode ser resolvido por `admin_auth_user_id`;
- FKs compostas impedem referências cruzadas relevantes entre Businesses;
- duas instâncias de Business em testes detectam queries sem escopo, sem exigir multi-tenancy completo ou RLS de tenant no MVP.

O PASS não afirma isolamento de linha contra SQL arbitrário executado pela própria role runtime. Esse isolamento continua pertencendo à camada Application/Persistence no MVP singleton, com FKs compostas como proteção de integridade relacional.

## Escopo e fontes de verdade

Foram usados como fontes normativas:

- `BARBER_ARCHITECTURE_v1`;
- `BARBER_DATA_MODEL_v1`;
- `BARBER_ARCHITECTURE_DECISIONS_v1`.

SPK-001 e SPK-002 não foram reexecutados nem modificados. No projeto descartável hospedado, o schema `app_private` já continha infraestrutura do SPK-002. O SPK-006 somente leu seus metadados e criou um controle positivo próprio em `public`; os metadados de `app_private` foram idênticos antes e depois.

Nenhum ADR ou documento oficial foi alterado. Sprint 0 e implementação do SaaS não foram iniciados.

## Ambiente

### Local

- Windows `win32 x64`;
- Node.js `v24.19.0`;
- TypeScript `7.0.2`;
- PostgreSQL `18.4` embutido, acessado por conexões TCP reais;
- driver `pg 8.23.0`;
- Supabase CLI `2.115.0`;
- migrations aplicadas pela CLI com exit code `0`;
- login de teste separado, sem privilégios, assumindo somente a role `barber_runtime`.

Migrations locais aplicadas:

1. `20260822213956_spk006_business_scope_private_schema.sql`;
2. `20260823161021_spk006_managed_data_api_probe.sql`.

### Supabase hospedado descartável

- conexão PostgreSQL gerenciada com TLS;
- Supabase Data API REST via HTTPS;
- chave pública enviada somente no header `apikey`;
- nenhuma `service_role` ou secret key utilizada;
- hostname, URL de banco e credenciais não persistidos nas evidências;
- migration hospedada restrita ao controle `public.spk006_public_probe`, em transação única.

As premissas de Data API foram conferidas na documentação atual: schemas customizados precisam ser explicitamente expostos e receber grants; grants controlam acesso ao objeto e RLS controla linhas após o objeto ser alcançável. Referências: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api), [Using Custom Schemas](https://supabase.com/docs/guides/api/using-custom-schemas) e [mudança de exposição opt-in](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## Resumo dos experimentos

| Experimento | Resultado esperado | Resultado observado | Status |
|---|---|---|---|
| Contrato estático de `BusinessScope` | rejeitar repositório sem scope, string crua ou objeto imitador | três `@ts-expect-error` consumidos; `tsc` exit `0` | PASS |
| Login runtime real | sessão não privilegiada assume somente `barber_runtime` | `session_user=barber_runtime_harness_login`; `current_user=barber_runtime` | PASS |
| Público com dois Businesses | falhar fechado, mesmo com `business_id` no input | `BUSINESS_SCOPE_AMBIGUOUS`, contagem `2` | PASS |
| Público singleton | ignorar `business_id` malicioso | browser indicou B; servidor resolveu A | PASS |
| Público sem Business elegível | não executar query sem escopo | `BUSINESS_SCOPE_NOT_FOUND` | PASS |
| Admin conhecido/desconhecido | resolver por `admin_auth_user_id`; negar desconhecido | B resolvido; desconhecido retornou `ADMIN_NOT_AUTHORIZED` | PASS |
| Repositório A versus dados B | não listar, ler ou atualizar B | lista somente A; leitura B ausente; update B afetou `0` linhas | PASS |
| SQL runtime sem repositório | tornar explícita a ausência de isolamento de linha no banco | SQL cru autorizado observou dois Businesses | PASS com risco documentado |
| FKs compostas | impedir Service, Customer e Occupancy cruzados | três violações `23503` nas constraints esperadas | PASS |
| DML runtime necessário | permitir DML somente nos objetos/colunas autorizados | inserts e updates permitidos concluíram | PASS |
| DDL e escalada | negar create schema/table, alter table e `SET ROLE postgres` | `42501` em todas as tentativas | PASS |
| Delegação de grant | nenhuma ACL deve ser alterada | warning `01007`; `aclChanged=false` | PASS |
| `DELETE` runtime | negar exclusão de `ScheduleOccupancy` | `42501` | PASS |
| Mudança de `business_id` | IDs de escopo devem ser imutáveis para runtime | `42501` em Service, Customer e Appointment | PASS |
| Repoint de Occupancy | `appointment_id` não pode ser trocado por runtime | `42501` | PASS |
| Roles da Data API no schema privado | negar acesso SQL mesmo fora do gateway | `42501` para `anon`, `authenticated` e `service_role` | PASS |
| Controle Data API hospedado | provar que o endpoint REST estava operacional | `GET public.spk006_public_probe` retornou `200` e uma linha RLS | PASS |
| Leitura hospedada de `app_private` | rejeitar antes do acesso ao objeto | `406/PGRST106`, `Invalid schema: app_private` | PASS |
| Escrita hospedada em `app_private` | rejeitar e não persistir linha | `406/PGRST106`; contagem posterior `0` | PASS |
| Preservação da infraestrutura anterior | não alterar objetos/ACLs de `app_private` | snapshot de metadados idêntico antes/depois | PASS |
| Browser | não conter credencial PostgreSQL nem repositório de domínio | somente URL/chave pública de Auth; scan sem `DATABASE_URL`, `pg` ou repository | PASS |
| Recuperação após erros | mesma conexão deve voltar a operar após rollback | todas as conexões reutilizadas com sucesso | PASS |

Foram concluídos 34 experimentos locais, além das sondas hospedadas.

## Matriz de privilégios

### Atributos da role `barber_runtime`

| Atributo | Valor observado |
|---|---:|
| `SUPERUSER` | false |
| `INHERIT` | false |
| `CREATEROLE` | false |
| `CREATEDB` | false |
| `LOGIN` | false |
| `REPLICATION` | false |
| `BYPASSRLS` | false |
| connection limit | 12 |

O harness usou um login separado `NOINHERIT`, membro apenas de `barber_runtime`. Isso evitou o falso positivo que ocorreria ao testar `SET ROLE` dentro de uma sessão cujo `session_user` fosse `postgres`.

### Schema e objetos

| Principal | `app_private` | Domínio privado | `public.spk006_public_probe` | `external_private` |
|---|---|---|---|---|
| `barber_runtime` | `USAGE` | DML mínimo descrito abaixo | nenhum acesso | nenhum acesso |
| `anon` | sem `USAGE` | nenhum acesso | `SELECT` com RLS | nenhum acesso |
| `authenticated` | sem `USAGE` | nenhum acesso | `SELECT` com RLS | nenhum acesso |
| `service_role` | sem `USAGE` | nenhum acesso | nenhum acesso | nenhum acesso |

`public` conserva `USAGE` ambiental do PostgreSQL/Supabase, mas isso não concedeu acesso a tabelas ao runtime. Revogar `USAGE` de `PUBLIC` globalmente seria uma alteração ampla e desnecessária para o MVP; o controle efetivo permanece nos grants por objeto e no `search_path` da aplicação.

### DML concedido ao runtime

| Tabela | `SELECT` | `INSERT` | `UPDATE` | Negado explicitamente/por ausência de grant |
|---|---|---|---|---|
| `business` | tabela | nenhum | `public_name`, `public_booking_enabled`, `operational_enabled`, `availability_version` | `id`, `admin_auth_user_id`, insert, delete, DDL |
| `service` | tabela | `id`, `business_id`, `name`, `active`, `version` | `name`, `active`, `version` | update de `id`/`business_id`, delete, DDL |
| `customer` | tabela | `id`, `business_id`, `display_name` | `display_name` | update de `id`/`business_id`, delete, DDL |
| `appointment` | tabela | `id`, `business_id`, `service_id`, `customer_id`, `status` | `service_id`, `customer_id`, `status` | update de `id`/`business_id`, delete, DDL |
| `schedule_occupancy` | tabela | `id`, `business_id`, `appointment_id`, `released_at` | `released_at` | update de IDs, delete, DDL |

Grants de `INSERT` e `UPDATE` são por coluna. Assim, colunas sensíveis adicionadas no futuro não se tornam mutáveis automaticamente.

## Isolamento entre dois Businesses

Dois Businesses foram criados somente como fixtures de teste.

1. Com A e B públicos/operacionais, o resolver público encontrou dois candidatos e falhou com `BUSINESS_SCOPE_AMBIGUOUS`.
2. Após B deixar de ser elegível para booking público, um payload malicioso contendo `business_id=B` foi ignorado e A foi resolvido.
3. O resolver administrativo mapeou `admin_auth_user_id` de B para B e negou um usuário desconhecido.
4. O repositório construído com scope A listou somente A.
5. Scope A não leu Service de B e não atualizou Service de B (`rowCount=0`).
6. Scope B não leu Service de A.
7. Uma query SQL crua, válida para a role runtime, observou A e B.

Conclusão: o padrão de scope funciona e detecta omissões, mas o PostgreSQL não impõe isolamento de linha para SQL arbitrário da role runtime. Para o MVP singleton isso é aceitável somente enquanto:

- o browser não acessa tabelas de domínio;
- todo acesso de domínio passa pela camada Persistence;
- repositórios Business-owned só podem ser construídos com `BusinessScope`;
- testes de conformidade usam dois Businesses;
- nenhuma segunda instância operacional é introduzida sem revisitar autorização e isolamento.

## Composite FK evidence

| Tentativa cruzada | Constraint | SQLSTATE | Recuperação |
|---|---|---|---|
| Appointment A → Service B | `appointment_service_business_fk` | `23503` | mesma conexão reutilizada |
| Appointment A → Customer B | `appointment_customer_business_fk` | `23503` | mesma conexão reutilizada |
| Occupancy B → Appointment A | `schedule_occupancy_appointment_business_fk` | `23503` | mesma conexão reutilizada |

As FKs compostas impedem referências relacionais cruzadas. Elas não substituem filtros de leitura por BusinessScope.

## Tentativas de acesso indevido e SQLSTATEs

Retornaram `42501 insufficient_privilege`:

- `CREATE TABLE` em `app_private`;
- `CREATE SCHEMA`;
- `ALTER TABLE`;
- `SET ROLE postgres`;
- acesso ao schema-isca;
- leitura do controle público pela role runtime;
- `DELETE` de `ScheduleOccupancy`;
- `INSERT` de Business;
- alteração de `admin_auth_user_id`;
- alteração de `business_id` em Service, Customer e Appointment;
- alteração de `appointment_id` em ScheduleOccupancy;
- acesso de `anon`, `authenticated` e `service_role` a `app_private`.

`GRANT SELECT ... TO anon` executado pela role runtime não lançou erro fatal: PostgreSQL emitiu warning `01007 privilege_not_granted`. A ACL permaneceu inalterada após `COMMIT`. Portanto, a afirmação correta é “runtime não consegue delegar privilégio”, e não “todo GRANT inválido retorna 42501”.

Após cada erro transacional foi executado `ROLLBACK`, seguido por consulta na mesma conexão e sob a mesma role. Todas permaneceram reutilizáveis.

## Private schema / Data API evidence

### Local

- `api.schemas = ["public", "graphql_public"]`;
- `app_private` e `external_private` ausentes da allowlist;
- `anon`, `authenticated` e `service_role` sem `USAGE` e sem privilégios de tabela no domínio;
- default privileges do owner `postgres` revogados para novos objetos privados;
- controle público com RLS acessível a `anon`/`authenticated`.

### Hospedado

| Sonda | Resultado |
|---|---|
| controle `GET /rest/v1/spk006_public_probe` | `200`, uma linha esperada |
| `GET` com `Accept-Profile: app_private` | `406/PGRST106` |
| `POST` com `Content-Profile: app_private` | `406/PGRST106` |
| schemas anunciados no erro | somente `public`, `graphql_public` |
| linha da escrita negativa persistida | `0` |
| ACLs/metadados privados antes/depois | idênticos |

Há duas barreiras independentes:

1. `app_private` não está na lista de schemas expostos pelo PostgREST;
2. roles da Data API também não possuem `USAGE` nem grants de objetos no schema.

RLS foi usado somente no controle positivo público. Não foi necessário adicionar RLS multi-tenant às tabelas privadas do MVP.

## Browser e fronteira servidor

O protótipo de configuração do browser aceita somente:

- URL pública do Supabase;
- publishable key para sessão de Auth.

Variáveis PostgreSQL (`DATABASE_URL`/`DIRECT_DATABASE_URL`), driver `pg` e repositórios não são importados pela superfície browser. O servidor mantém a connection string separada e resolve o scope antes de construir repositórios.

Essa prova é de contrato e scan estático do spike; não é uma auditoria de bundle de um SaaS, que não foi implementado.

## Proteções por camada

### PostgreSQL

- schema privado e ACLs;
- ausência de grants para roles da Data API;
- role runtime sem atributos administrativos;
- grants explícitos por objeto e coluna;
- ausência de `DELETE`, `TRUNCATE`, `REFERENCES` e `TRIGGER` para runtime;
- FKs compostas de Business;
- default privileges revogados para o owner de migrations;
- abort transacional e recuperação por rollback.

### Application / Persistence

- resolver público singleton e fail-closed;
- input `business_id` do browser ignorado;
- resolver admin por `admin_auth_user_id` autenticado;
- tipo nominal `BusinessScope`;
- construção centralizada de repositórios com scope obrigatório;
- predicates `business_id = $1` em reads e writes;
- suíte de conformidade com dois Businesses.

### Provisionamento/runtime

- credencial PostgreSQL somente no servidor;
- login de conexão sem privilégios próprios, capaz de assumir somente o grupo de grants runtime;
- publishable key no browser; nenhuma secret/service key.

## Riscos encontrados

1. **SQL cru da role runtime pode ver dois Businesses.** Isso é deliberadamente aceito no MVP singleton, mas impede afirmar isolamento multi-tenant no banco.
2. **Um repositório futuro pode omitir o filtro.** O tipo nominal reduz o risco somente se a construção for centralizada e os repositórios não aceitarem conexão crua fora do factory.
3. **Default privileges são específicos do owner.** Se migrations futuras criarem objetos com outra role, os revokes precisam ser declarados também para esse owner.
4. **`public` possui `USAGE` ambiental.** Não houve acesso a objetos pelo runtime, mas funções públicas futuras precisam de auditoria de `EXECUTE`, especialmente qualquer `SECURITY DEFINER`.
5. **A role runtime não foi provisionada no projeto hospedado.** Isso não era necessário para a garantia gerenciada da Data API e evitar criar privilégios sobre infraestrutura do SPK-002. A prova da role foi feita localmente com conexão TCP real.
6. **O contrato cobre o protótipo de ServiceRepository.** A conformidade de todos os repositórios futuros ainda dependerá de testes equivalentes.
7. **Adicionar um segundo Business operacional muda a premissa.** Nesse momento serão necessários routing, membership/authorization e nova decisão sobre RLS ou isolamento equivalente.

## Simplificações possíveis e recomendadas para o MVP

- manter exatamente um Business operacional;
- usar dois Businesses somente em testes negativos;
- não aceitar `business_id` como autoridade no fluxo público;
- não expor tabelas do domínio pela Data API;
- não usar `service_role` para domínio;
- manter um único grupo de grants runtime e um login de conexão sem privilégios próprios;
- usar FKs compostas somente nas relações que podem cruzar Business;
- não introduzir RLS multi-tenant, tenant claims, memberships ou roteamento por tenant agora;
- usar grants por coluna para tornar `business_id` imutável ao runtime.

## Proteção adicional realmente necessária no MVP

Não é necessária RLS multi-tenant completa.

São necessárias, além do desenho original em alto nível:

1. grants de `UPDATE` por coluna, sem `business_id`/IDs;
2. factory único que exija `BusinessScope` para repositórios Business-owned;
3. teste de conformidade com dois Businesses para cada novo repositório;
4. FKs compostas nas relações cruzáveis;
5. verificação de `api.schemas` e revokes de roles Data API em migrations/CI;
6. auditoria de funções públicas e de default privileges sempre que o owner de migrations mudar.

## Alterações arquiteturais necessárias

Nenhuma alteração semântica aos ADRs aceitos é necessária. O spike confirma a arquitetura proposta.

As seguintes precisões devem entrar na futura implementação, sem editar os documentos oficiais nesta etapa:

- tratar `barber_runtime` preferencialmente como role `NOLOGIN` de grants e usar um login rotacionável que só possa assumi-la;
- declarar grants de insert/update por coluna, não grants amplos de tabela;
- considerar `business_id` e IDs imutáveis após insert para a role runtime;
- aplicar default privileges para a role que efetivamente possuirá objetos;
- proibir acesso direto à conexão fora de Persistence;
- manter `app_private` fora dos schemas expostos e sem grants para `anon`, `authenticated` e `service_role`.

## Itens não provados

- auditoria de bundle de uma aplicação web real;
- integração real de Supabase Auth/JWT com o resolver administrativo;
- provisionamento e rotação do login runtime no Supabase hospedado;
- comportamento de todos os repositórios futuros;
- isolamento de linha de SQL arbitrário da role runtime;
- multi-tenancy, memberships, routing ou RLS por tenant;
- comportamento após introduzir um segundo Business operacional;
- auditoria de funções `public` que venham a existir no SaaS;
- pipeline CI/CD e Security Advisor do projeto definitivo.

Esses itens pertencem à implementação futura ou a uma decisão de multi-tenancy, não bloqueiam o MVP singleton nem o resultado do spike.

## Evidências

- `evidence/SPK-006_LOCAL_EVIDENCE.json` — ambiente, migrations e 34 experimentos;
- `evidence/SPK-006_PRIVILEGE_MATRIX.json` — atributos, schemas, tabelas e grants por coluna;
- `evidence/SPK-006_SQLSTATE_EVIDENCE.json` — SQLSTATEs e reutilização das conexões;
- `evidence/SPK-006_DATA_API_EVIDENCE.json` — sondas HTTP gerenciadas e preservação de `app_private`;
- `supabase/migrations/20260822213956_spk006_business_scope_private_schema.sql` — laboratório de schema/role;
- `supabase/migrations/20260823161021_spk006_managed_data_api_probe.sql` — controle hospedado isolado;
- `scripts/run-local-spike.ts` e `scripts/run-remote-spike.ts` — harnesses reproduzíveis;
- `tests/type-contracts.ts` — contrato nominal de `BusinessScope`.

## Próxima ação exata

**Encerrar o SPK-006 como PASS e arquivar este relatório com as quatro evidências JSON.**

Quando Sprint 0 for explicitamente autorizado, a primeira ação deve ser criar a migration inicial do projeto definitivo contendo `app_private`, FKs compostas, default-privilege revokes e grants runtime por coluna; em seguida, adicionar o teste de conformidade de dois Businesses ao factory de repositórios antes de implementar qualquer caso de uso.

Não iniciar essa ação como parte deste spike.
