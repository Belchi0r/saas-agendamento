# SPRINT_1_REPORT

## Resultado

**PASS**

Em 23 de agosto de 2026, a primeira vertical slice foi concluída com o fluxo administrativo de `Service` atravessando UI, Delivery, Application, Domain, Persistence e PostgreSQL. O catálogo público lê somente serviços ativos do único `Business` publicado. Sprint 2 não foi iniciada.

## Ambiente e versões

| Componente | Versão/ambiente validado |
|---|---|
| Node.js | 24.19.0 |
| npm | 10.9.8 |
| Next.js | 16.3.2, App Router, runtime Node |
| React | 19.2.8 |
| TypeScript | 6.0.3, strict |
| `@supabase/ssr` | 0.12.4 |
| `@supabase/supabase-js` | 2.112.3 |
| Drizzle ORM | 0.45.2 |
| `pg` | 8.23.0 |
| Supabase CLI | 2.115.0 |
| PostgreSQL local real | 18.4, efêmero, conexões TCP reais |
| PostgreSQL de CI configurado | 17 |
| Vitest | 4.1.11 |
| Playwright/Chromium | 1.62.1 / Chromium fixado pelo pacote |

O PostgreSQL local foi descartado após a matriz. Nenhuma credencial externa foi persistida ou adicionada ao repositório.

## Funcionalidades implementadas

### Administração

- login por e-mail/senha via fluxo oficial `@supabase/ssr`;
- sessão SSR em cookies com cliente server-side criado por request;
- página `/admin/servicos` protegida;
- listagem com serviços ativos primeiro e inativos separados;
- criação com nome, descrição opcional, preço, duração e atividade;
- edição com controle otimista por `version`;
- ativação e desativação sem exclusão física;
- confirmação contextual antes de desativar, incluindo aviso para o último ativo;
- logout local;
- feedback de validação, processamento, erro, vazio e conflito.

### Público

- `/` resolve no servidor o único `Business` com `public_booking_enabled=true`;
- zero ou mais de um negócio publicado falha de forma segura;
- lista somente `Service.active=true`;
- mostra nome, descrição opcional, preço na moeda do negócio e duração;
- estado vazio natural: “Nenhum serviço disponível no momento.”;
- não contém data, horário, cliente, confirmação ou qualquer operação de booking.

### Dinheiro e campos

- `price_minor` permanece inteiro não negativo no domínio, na validação e no PostgreSQL;
- entrada decimal é convertida para minor units sem persistir ponto flutuante;
- quantidade de casas usa a moeda ISO 4217 do `Business` via `Intl`;
- `currency_code` de `Service` é obtido do `Business` no servidor e não do navegador;
- nenhum campo além dos definidos para `Business` e `Service` foi criado.

## Migration oficial

Arquivo: `supabase/migrations/20260823214240_sprint_1_services_vertical_slice.sql`.

A migration cria somente as tabelas necessárias à slice:

- `app_private.business`, como raiz singleton de escopo e vínculo com `admin_auth_user_id`;
- `app_private.service`, com os campos canônicos do Data Model.

Garantias relevantes:

- checks para nome não vazio, preço não negativo, duração e versão positivas;
- FK de `Service.business_id` para `Business`;
- FK composta `(business_id, currency_code)` que impede moeda diferente da moeda do negócio;
- unique `(business_id, id)` para referências escopadas futuras;
- índice `(business_id, active, name)` aprovado para o catálogo;
- `barber_runtime` recebe `SELECT`, `INSERT` e `UPDATE` apenas nos objetos/colunas necessários;
- `barber_runtime` não recebe `DELETE`, DDL nem mutação de `Business`;
- `anon`, `authenticated` e `service_role`, quando existentes, não recebem acesso ao schema/tabelas privados;
- nenhuma migration toca `auth`, `storage` ou outro schema gerenciado pelo Supabase.

A Supabase CLI foi o único aplicador. A aplicação do zero executou, em ordem, as migrations de Sprint 0 e Sprint 1 e terminou com `Finished supabase db push`.

## Arquitetura atravessada

| Boundary | Implementação |
|---|---|
| Delivery/UI | Server Components para leitura; Client Components apenas nos formulários; Route Handlers para login/logout e mutações |
| Application | casos de uso `listAdminServices`, `listPublicServices`, `createService`, `updateService` e `setServiceActive` |
| Domain | entidade/draft de `Service`, normalização e invariantes puras |
| Persistence | repositórios PostgreSQL para `Business` e `Service`, sempre com predicado de escopo |
| PostgreSQL | schema privado, constraints, índice, optimistic version e privilégios mínimos |
| Infrastructure | Supabase Auth SSR, composição request-scoped, pool PostgreSQL pequeno e ambiente tipado |

O DTO entregue ao browser omite `businessId` e timestamps de persistência. SQL não aparece em UI, Delivery ou Application.

## AuthN × AuthZ

As verificações são separadas:

1. AuthN revalida a sessão com `client.auth.getUser()` no servidor; `getSession()` não é usado como fonte de autorização.
2. AuthZ procura `Business.admin_auth_user_id` com o ID autenticado.
3. Somente então é produzido um `BusinessScope` com origem `admin-auth-user`.
4. O repositório de serviços é construído com esse escopo.

Resultados exercitados:

| Situação | Resultado |
|---|---|
| sem sessão | redirecionado para `/admin/login`; operação administrativa não é executada |
| usuário Auth válido, mas diferente de `admin_auth_user_id` | `403 ADMIN_NOT_AUTHORIZED`; sessão local aberta pelo login é removida |
| administrador correto | acesso à gestão e mutações permitido |

Todos os Route Handlers mutáveis chamam o guard de método mutável, `Origin` e `Host`. Respostas autenticadas usam `private, no-store, max-age=0, must-revalidate` e `Vary: Cookie`; o E2E confirmou esses headers em `next build` + `next start`. O `next dev` substitui Cache-Control por sua política própria, por isso não foi usado como evidência dessa garantia de produção.

## BusinessScope

- o admin resolve o negócio pelo usuário autenticado;
- o público resolve o singleton publicado no servidor;
- nenhum endpoint aceita `business_id` ou `businessId`;
- schemas Zod strict rejeitam esses campos mesmo quando enviados deliberadamente;
- todos os reads e writes de `Service` incluem `scope.businessId`;
- tentativa de atualizar o ID de um serviço do segundo negócio não altera a linha;
- dois negócios são usados somente nos testes de isolamento;
- não foi criado seletor de negócio, membership, RBAC ou RLS multi-tenant completa.

## Testes e evidências

| Gate | Resultado observado |
|---|---|
| Unit/component | **36/36 PASS**, 13 arquivos |
| PostgreSQL integration | **9/9 PASS**, 2 arquivos |
| E2E Playwright | **3/3 PASS** |
| Typecheck | **PASS** |
| ESLint | **PASS**, zero warnings |
| Production build | **PASS** |
| Migration do zero via Supabase CLI | **PASS** |

Cobertura observada:

- invariantes e normalização de `Service`;
- validação e rejeição de preço/duração inválidos;
- rejeição de `business_id`/`businessId` do cliente;
- create, update, activate/deactivate e optimistic version;
- persistência real usando a role mínima;
- SQLSTATE `23503` para violação da FK de moeda/negócio;
- SQLSTATE `42501` para `DELETE` indevido, seguido de reutilização da conexão após rollback;
- isolamento de consultas entre dois Businesses;
- público retorna somente ativos;
- singleton publicado e falha segura quando ambíguo;
- sem sessão, usuário errado e administrador correto;
- E2E: login → criação → lista administrativa → catálogo público → edição → catálogo atualizado → desativação → remoção do catálogo;
- headers de cache autenticado em runtime de produção.

O E2E usa PostgreSQL real e um servidor HTTP determinístico que reproduz somente a fronteira externa necessária do Supabase Auth. A aplicação continua executando o pacote oficial `@supabase/ssr`, cookies SSR, `getClaims()` no Proxy e `getUser()` no boundary confiável. O projeto Supabase hospedado não foi reexecutado: a compatibilidade real com Auth hospedado permanece sustentada pelo SPK-005 = PASS, conforme permitido pela solicitação.

## Rotas relevantes

| Rota | Função |
|---|---|
| `/` | catálogo público dos serviços ativos do Business publicado |
| `/admin/login` | entrada administrativa por e-mail/senha |
| `/admin/servicos` | gestão completa de serviços |
| `POST /api/admin/auth/login` | login SSR + autorização do Business |
| `POST /api/admin/auth/logout` | logout local |
| `POST /api/admin/services` | criação escopada |
| `PATCH /api/admin/services/:serviceId` | edição ou alteração de atividade escopada |

Não foram necessárias screenshots para provar o comportamento; o E2E exercita as superfícies em Chromium real.

## Divergências das fontes

Nenhuma regra de produto ou campo foi redefinido.

A superfície pública exige `public_booking_enabled=true` para não exibir catálogo parcial de um negócio não publicado. O checklist completo de publicação não foi implementado nesta slice; o ambiente E2E provisiona explicitamente o negócio como publicado. A ausência de unicidade case-insensitive de nome é intencional porque a própria fonte canônica mantém essa decisão pendente.

## Riscos e limitações

- `@supabase/ssr` continua sujeito a evolução de API; a versão está fixada no lockfile.
- O Sprint 1 não cria interface de provisionamento de `Business` ou usuário Auth. O vínculo inicial é responsabilidade de provisionamento controlado.
- A fronteira externa de Auth no E2E é determinística; o ambiente Supabase hospedado não foi revalidado nesta slice.
- Conflito otimista retorna orientação para atualizar e tentar novamente; atualização automática da lista não foi adicionada.
- O catálogo já respeita intenção de publicação, mas o checklist completo de disponibilidade pertence às próximas slices.
- O E2E faz um build isolado em `.next-e2e` para verificar comportamento real de produção, aumentando o tempo do gate em troca de determinismo.

## Dívida técnica proporcional

- definir o procedimento de provisionamento seguro do único `Business` antes de um ambiente piloto;
- acompanhar mudanças de `@supabase/ssr` sem remover os testes de cookies/AuthN/AuthZ;
- adicionar tradução central de erros PostgreSQL somente quando surgirem novos erros esperados além dos contratos atuais;
- avaliar atualização automática após `SERVICE_VERSION_CONFLICT` quando houver evidência de uso concorrente do painel.

Nada disso enfraquece os critérios de PASS desta slice.

## Próxima vertical slice recomendada

Implementar **Horários padrão do Business** (`WeeklyWorkingWindow` e `WeeklyBreak`) como próxima slice vertical, seguindo a sequência canônica de UX após Serviços. A próxima ação exata é primeiro fechar o contrato de criação/edição das faixas semanais e seus testes PostgreSQL, sem iniciar booking, Appointment ou Sprint 2 automaticamente nesta entrega.
