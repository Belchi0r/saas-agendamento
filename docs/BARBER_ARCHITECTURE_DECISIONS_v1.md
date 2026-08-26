# BARBER_ARCHITECTURE_DECISIONS_v1

## Controle do documento

| Campo | Valor |
|---|---|
| Produto | Barber SaaS — núcleo genérico de agendamento |
| Fase | FASE 4 — Technical Spikes |
| Versão | 1.0 |
| Data | 23 de agosto de 2026 |
| Status do conjunto | **TECHNICAL_SPIKES_COMPLETE — sete ADRs ACCEPTED; ADR-008 permanece PROPOSED sem bloquear Sprint 0** |
| Changeset | Checkpoint arquitetural final da FASE 4 registrado após PASS dos SPK-001 a SPK-006 |
| Fontes | BARBER_PRODUCT_DISCOVERY_v1, BARBER_PRD_v1, BARBER_UX_SPEC_v1 e PRODUCT_DECISION_GENERIC_SCHEDULING_v1 |

## 0. Registro

| ADR | Título | Status |
|---|---|---|
| ADR-001 | Application Architecture | ACCEPTED |
| ADR-002 | Persistence and Data Access | ACCEPTED |
| ADR-003 | Business Scope and `business_id` | ACCEPTED |
| ADR-004 | Booking Concurrency and Database Integrity | ACCEPTED |
| ADR-005 | Authentication and Customer Access Tokens | ACCEPTED |
| ADR-006 | Time and Timezone Strategy | ACCEPTED |
| ADR-007 | Testing Strategy | ACCEPTED |
| ADR-008 | Deployment and Observability | PROPOSED |

ADR-001 e ADR-007 permanecem aceitos por aprovação explícita da FASE 3. ADR-002, ADR-004, ADR-005 e ADR-006 passam a `ACCEPTED` pela evidência dos technical spikes; o ADR-003 permanece `ACCEPTED` com seus mecanismos técnicos validados. ADR-008 continua `PROPOSED` nos termos de seu status.

---

# ADR-001 — Application Architecture

## Context

O MVP possui fluxo público, painel administrativo, regras críticas de agenda e um único desenvolvedor. Precisa ser simples para operar, mas regras de disponibilidade, autorização e concorrência não podem ficar espalhadas por componentes React ou handlers.

## Problem

Definir uma estrutura que:

- mantenha um único deploy;
- centralize regras testáveis;
- não misture UI, autorização e persistência;
- evite Clean Architecture cerimonial;
- permita evolução sem microserviços.

## Options considered

### A. Next.js organizado apenas por páginas/rotas

Código de regra e banco é colocado próximo das telas.

**Vantagens:** início rápido e poucos arquivos.

**Desvantagens:** regras duplicadas entre público/admin, testes dependentes do framework, autorização dispersa e transações difíceis de enxergar.

### B. Monólito modular com boundaries leves

Uma aplicação Next.js separa UI/delivery, casos de uso, regras de domínio, persistência e infraestrutura. Módulos são definidos por capacidades do produto.

**Vantagens:** um deploy; regras centralizadas; teste por nível; pouca infraestrutura.

**Desvantagens:** exige disciplina de dependências e mais estrutura que um protótipo.

### C. Clean Architecture completa/hexagonal cerimonial

Toda dependência recebe interface, adapter, factory e entidade própria.

**Vantagens:** separação formal e alta substituibilidade teórica.

**Desvantagens:** muitas abstrações sem segunda implementação, carga cognitiva e manutenção desproporcional para uma pessoa.

### D. Backend separado do frontend

API Node independente e Next.js somente como cliente.

**Vantagens:** deploy e escala independentes.

**Desvantagens:** dois projetos/deploys, contratos e autenticação duplicados sem necessidade atual.

## Proposed decision

Adotar **B: monólito modular em Next.js**, executado em runtime Node.

Direção de dependência:

`UI/Delivery → Application → Domain`, com `Application → Persistence/Infrastructure` por contratos pequenos quando úteis.

Regras:

- Server Components para leitura/renderização server-side por padrão.
- Client Components somente para interação local.
- Server Actions para mutações administrativas adequadas a formulários.
- Route Handlers para contratos públicos, token exchange e operações com idempotência HTTP explícita.
- Ambos chamam os mesmos casos de uso.
- Consultas públicas de disponibilidade validam com Zod, no servidor, um teto absoluto pequeno por request; horizontes comerciais maiores são percorridos em páginas/chunks.
- Nenhum caso de uso importa React, componente ou objeto de request do Next.js.
- Nenhum módulo cria interface apenas “por arquitetura”.

## Rationale

O monólito modular entrega a separação necessária para segurança e testes sem introduzir custo operacional de serviços distribuídos. Next.js já cobre entrega de UI e execução server-side; um backend separado não resolve nenhum gargalo confirmado.

## Consequences

### Positivas

- Uma base de código e um deploy.
- Regras reutilizadas entre fluxo público e administrativo.
- Casos críticos testáveis sem navegador.
- Migração futura de um módulo é possível se surgir pressão real.

### Negativas

- Erro de boundaries pode transformar o monólito em código acoplado.
- Build/deploy afeta todo o produto.
- Disciplina de imports e code review será necessária.

## Risks

- Criar pastas cerimoniais sem comportamento.
- Colocar regra comercial em Server Actions por conveniência.
- Importar cliente de banco diretamente em componentes/rotas.

Mitigação: lint de boundaries quando necessário, revisão por caso de uso e testes de domínio.

## Rejected alternatives

- **A** rejeitada por risco de duplicação e autorização dispersa.
- **C** rejeitada por overengineering.
- **D** rejeitada por custo sem demanda de escala independente.

## Status

**ACCEPTED — aprovado documentalmente em 22 de agosto de 2026**

---

# ADR-002 — Persistence and Data Access

## Context

O sistema precisa de CRUD tipado, transações, locks, ranges, exclusion constraints, índices parciais, extensões e migrations SQL específicas. A hospedagem será Supabase e o runtime Vercel serverless.

## Problem

Escolher entre Prisma, Drizzle, Supabase client, SQL direto ou combinação, sem perder garantias avançadas do PostgreSQL nem criar manutenção excessiva.

## Options considered

### A. Prisma como acesso principal

**Vantagens:** client gerado, ecossistema maduro, boa experiência de CRUD e relações.

**Desvantagens:** recursos PostgreSQL sem representação completa exigem SQL/migrations externas; client e pooling exigem cuidado serverless; a camada mais abstrata não elimina SQL crítico.

### B. Drizzle como acesso principal

**Vantagens:** TypeScript próximo de SQL, schema tipado, transações, baixa abstração e migrations customizadas possíveis.

**Desvantagens:** menos proteção contra SQL avançado incorreto; alguns recursos exigem migrations manuais; API ainda precisa ser fixada por versão.

### C. Supabase client/PostgREST para todos os dados

**Vantagens:** integração simples com Auth, RLS e acesso HTTP; reduz gestão direta de conexão.

**Desvantagens:** transações de múltiplos passos e locks ficam menos naturais; lógica crítica tenderia a funções SQL/RPC; risco de exposição acidental ao browser.

### D. SQL direto com `pg`

**Vantagens:** controle total do PostgreSQL, erros e transações explícitos.

**Desvantagens:** mais boilerplate, mapeamento manual, menor segurança de tipos e maior custo em CRUD simples.

### E. Combinação Drizzle + SQL explícito + Supabase Auth

**Vantagens:** consultas comuns tipadas, PostgreSQL avançado sem bloqueio de ORM e Auth gerenciado.

**Desvantagens:** duas formas de consulta precisam de convenção clara; testes de integração são obrigatórios.

## Proposed decision

Adotar **E**:

- Drizzle ORM com driver `pg` para schema TypeScript, CRUD e consultas comuns.
- SQL parametrizado localizado para ranges, exclusion constraints, locks, migrations customizadas e operações críticas quando a API tipada não expressar a intenção claramente.
- Supabase CLI é o único mecanismo que aplica migrations em todos os ambientes.
- Os arquivos SQL finais versionados pertencem a `supabase/migrations` e passam por revisão.
- Drizzle Kit pode gerar SQL candidato para o schema do domínio, mas não é autoridade de aplicação; sua configuração limita o escopo ao schema da aplicação.
- Migrations da aplicação não gerenciam, removem ou recriam schemas/tabelas administrados pelo Supabase, incluindo `auth` e `storage`.
- `drizzle-kit push` é proibido em produção.
- Supabase client fica restrito a Auth/SSR e serviços explicitamente aprovados; não é o acesso principal às tabelas do domínio.
- Browser não recebe credencial de banco nem consulta tabelas de domínio.
- Runtime usa uma role PostgreSQL mínima e schema não exposto pela Data API.
- Supabase CLI usa conexão apropriada a DDL; runtime serverless usa Supavisor transaction mode sem prepared statements nomeados.

## Rationale

A aplicação depende de capacidades nativas do PostgreSQL. Prisma não removeria a necessidade de SQL e adicionaria uma camada mais distante do mecanismo crítico. Drizzle preserva tipos e produtividade, mas permite sair da abstração de modo explícito e localizado.

## Consequences

### Positivas

- Recursos PostgreSQL são primeira classe.
- SQL crítico fica visível em review.
- CRUD não vira repetição manual.
- Migrations permanecem arquivos auditáveis sob uma única autoridade de aplicação.

### Negativas

- A equipe precisa compreender SQL e PostgreSQL.
- Alteração de schema exige sincronizar definição Drizzle e migration.
- Não há portabilidade de banco como objetivo.

## Risks

- Misturar SQL manual em qualquer camada.
- Usar `drizzle-kit push` em produção.
- Permitir que migrations da aplicação alterem `auth` ou `storage`.
- Divergir o schema Drizzle dos arquivos finais em `supabase/migrations`.
- Abrir conexões demais em Vercel.
- Prepared statements incompatíveis com transaction pooler.
- Role de runtime ampla demais.

Mitigações: repositórios, revisão dos arquivos finais, Supabase CLI em CI/ambientes, escopo do Drizzle restrito, pool pequeno, SPK-002 do zero e role mínima.

## Rejected alternatives

- **Prisma sozinho:** não cobre a parte mais importante sem escape para SQL.
- **Supabase client sozinho:** transações críticas ficariam dependentes de RPCs extensas ou contratos menos claros.
- **SQL direto sozinho:** custo excessivo para toda a aplicação.

## Status

**ACCEPTED — evidenciado por SPK-001 e SPK-002 em 23 de agosto de 2026**

Nota de evidência: Supabase CLI é o único aplicador das migrations oficiais; Drizzle + `pg` estão aprovados; Supavisor em transaction mode foi validado sem prepared statements nomeadas; SQL localizado, revisado e parametrizado permanece permitido quando os recursos PostgreSQL não forem expressáveis pelo Drizzle.

---

# ADR-003 — Business Scope and `business_id`

## Context

`Business` é primeira classe com uma única instância no MVP. Edmar levantou potencial de outros negócios, mas multi-tenancy não está aprovado. A Product Decision exigiu ADR próprio e proibiu assumir que uma coluna produz isolamento seguro.

## Problem

Decidir onde armazenar escopo de negócio, como garantir consistência e qual é o custo futuro de incluir um segundo Business.

## Options considered

### A. Ausência de `business_id`

Configurações e tabelas são globais.

**Benefícios:** menor schema inicial e queries curtas.

**Custos:** migração ampla; dificuldade de propriedade; unicidades globais incorretas; risco ao adicionar segundo negócio sob pressão.

### B. `business_id` indiscriminado

Toda tabela, inclusive filhos, repete a coluna.

**Benefícios:** aparência de escopo explícito em qualquer query.

**Custos:** duplicação, FKs complexas, divergência entre pai e filho e falsa segurança se filtros forem esquecidos.

### C. Escopo seletivo por Business

Raízes pertencentes ao negócio guardam `business_id`; filhos o derivam. Entidades críticas podem repetir a coluna quando constraint/consulta justificar, com FK composta garantindo coerência.

**Benefícios:** propriedade clara e custo futuro menor sem espalhar coluna sem propósito.

**Custos:** decisões por entidade, repositórios escopados e testes específicos.

## Proposed decision

Adotar **C**.

### Guardam `business_id`

- BusinessSchedulingPolicy;
- Service;
- Customer;
- WeeklyWorkingWindow;
- WeeklyBreak;
- DateAvailabilityException;
- BlockedPeriod;
- Appointment;
- ScheduleOccupancy;
- IdempotencyRequest.

### Derivam escopo

- ExceptionWorkingWindow pela exceção;
- AppointmentEvent pelo Appointment;
- AppointmentAccessToken pelo Appointment.

### Enforcement

- Composite foreign keys impedem cruzamento de Service/Customer/Appointment/Occupancy.
- Índices e unicidades incluem business onde a regra é por negócio.
- `Customer` possui índice não-único `(business_id, whatsapp_e164)`; WhatsApp não é identidade única, números podem ser compartilhados e não existe merge automático baseado apenas no telefone.
- `BusinessScope` é resolvido no servidor e obrigatório nos repositórios.
- Público resolve o singleton; não aceita escopo do browser.
- Admin resolve pelo `admin_auth_user_id`.
- Testes isolados usam duas empresas para detectar consulta sem filtro.
- Produção não possui rota para criar segundo Business e monitora cardinalidade operacional igual a um.

Não será criada constraint física que impeça para sempre uma segunda linha, porque isso impediria testar isolamento e criaria migration artificial. O limite “exatamente um” é de capacidade da aplicação e provisionamento do MVP.

## Rationale

Os dados já pertencem a um negócio real. Armazenar escopo nas raízes não é multi-tenancy; é modelar propriedade. Repetição em Appointment e ScheduleOccupancy é justificada por autorização, consulta e exclusion constraint, e fica protegida por FK composta.

## Consequences

### Positivas

- Busca de WhatsApp e integridade da agenda ficam escopadas ao negócio sem transformar telefone em identidade única.
- Double booking é escopado corretamente.
- Futuro segundo negócio começa com propriedade explícita.
- Filhos não acumulam colunas redundantes.

### Negativas

- Toda API de repositório precisa de escopo.
- Testes e índices ficam um pouco mais verbosos.
- Ainda será necessário reavaliar RLS, routing, membership e suporte antes de multi-business.

## Risks

- Query manual esquecer `business_id`.
- Desenvolvedor interpretar schema como multi-tenancy pronto.
- Duplicar escopo sem composite FK.
- Credencial do banco com acesso amplo contornar aplicação.

Mitigação: role mínima, schema privado, contratos de repositório, testes com duas empresas e checklist de review.

## Rejected alternatives

- **A** rejeitada porque Business já é conceito aprovado e a preparação agora é barata.
- **B** rejeitada por duplicação e falsa sensação de isolamento.
- RLS multi-tenant completa rejeitada neste estágio; não há usuário pertencendo a vários negócios nem roteamento de tenant.

## Status

**ACCEPTED — decisão conceitual aprovada em 22 de agosto de 2026; mecanismos técnicos validados pelo SPK-006 em 23 de agosto de 2026**

Nota de evidência: browser/Data API não acessa o domínio em schema privado; a role de runtime opera com least privilege; `BusinessScope` é resolvido no servidor. O singleton do MVP não exige RLS multi-tenant completa.

---

# ADR-004 — Booking Concurrency and Database Integrity

## Context

Duas requisições podem ver o mesmo horário e confirmar em instâncias diferentes. Bloqueios administrativos também disputam a mesma capacidade. `SELECT livre → INSERT` não é garantia.

## Problem

Impedir qualquer sobreposição ativa, preservar atomicidade de remarcação e integrar bloqueios sem depender de memória ou de uma única instância.

## Options considered

### A. Revalidar e inserir sem constraint

**Vantagem:** implementação simples.

**Falha:** corrida clássica; duas transações podem ler “livre”.

### B. Unique constraint por horário inicial

**Vantagem:** simples e eficiente.

**Falha:** não detecta serviços com durações diferentes nem sobreposição parcial.

### C. Lock pessimista em linha de slot pré-criado

**Vantagem:** disputa clara.

**Falha:** exige materializar slots, dificulta duração variável e multiplica linhas.

### D. Advisory lock por negócio/data + checagem

**Vantagem:** funciona entre instâncias e pode serializar operações heterogêneas.

**Falha:** depende de todas as rotas usarem a mesma chave; serializa operações sem conflito e não é prova estrutural do intervalo.

### E. Exclusion constraint em Appointment

**Vantagem:** PostgreSQL impede sobreposição de ranges.

**Falha:** protege appointment contra appointment, mas não necessariamente bloqueio contra appointment em outra tabela.

### F. Tabela única de ocupação + exclusion constraint

**Vantagem:** toda capacidade concreta disputa a mesma constraint; suporta duração, buffer, bloqueio e várias instâncias.

**Falha:** adiciona tabela técnica e precisa garantir que toda entidade proprietária crie ocupação.

## Proposed decision

Adotar **F**, complementada por lock/versionamento de configuração:

- `ScheduleOccupancy` guarda `business_id`, range UTC `[)` e proprietário Appointment ou BlockedPeriod.
- Exclusion constraint GiST impede ranges sobrepostos com mesmo business nas linhas não liberadas.
- `btree_gist` oferece igualdade do UUID no mesmo índice.
- Transação cria proprietário, ocupação, evento e idempotência.
- Mecanismo diferível no commit verifica que Appointment confirmado/BlockedPeriod ativo não fique sem ocupação.
- Reservation lê a versão de disponibilidade sob lock compartilhado; alterações de regra usam lock exclusivo e incrementam versão.
- Conflito de constraint é mapeado para resultado “horário indisponível”, não erro 500.
- Quando uma transação precisar de lock de disponibilidade/configuração e de `Appointment`, adquire primeiro o lock de escopo/configuração e depois o lock do `Appointment`.
- A aplicação nunca usa `DELETE` para liberar `ScheduleOccupancy`; cancelamento/remarcação/liberação usam estado e `released_at`, e a role de runtime não possui esse privilégio.

### Remarcação

- Lock compartilhado de disponibilidade/configuração antes do Appointment.
- Lock `FOR UPDATE` no Appointment.
- Verificação de version esperada.
- Update da mesma ocupação para o novo range.
- Evento e snapshots na mesma transação.
- Falha de exclusão reverte update e preserva range antigo.

### Estados

- Cancelamento libera ocupação.
- Concluído/no-show preservam ocupação histórica.
- Reabertura de terminal não existe no MVP.
- Purge histórico de ocupações está fora do MVP.

## Rationale

A capacidade simultânea igual a um é uma invariante de banco, não apenas regra de tela. Centralizar ocupações evita a brecha de concorrência entre booking e bloqueio e mantém a garantia válida com múltiplas instâncias.

## Consequences

### Positivas

- Double booking estruturalmente impedido.
- Duração e buffer são intervalos reais.
- Bloqueio concorre pela mesma capacidade.
- Remarcação é atomicamente demonstrável.

### Negativas

- Tabela técnica adicional.
- Constraint GiST e trigger diferível exigem SQL customizado.
- Erros do PostgreSQL precisam de tradução explícita.
- Testes de banco são obrigatórios.

## Risks

- Proprietário sem ocupação se o mecanismo no commit estiver incorreto.
- Deadlock se a ordem global de locks for violada; o deadlock determinístico aventado na revisão não foi confirmado porque booking/remarcação usam locks compartilhados de disponibilidade.
- Deleção indevida de ocupação contornar a exclusão se privilégios/defesas forem incorretos.
- Longas transações em runtime serverless.
- Constraint mal indexada afetar consultas.

Mitigações: transações curtas, ordem global de locks, runtime sem `DELETE`, testes de deleção indevida, deadlocks deliberados, pares concorrentes, volume significativo, impacto histórico no GiST e observabilidade de SQLSTATE. O SPK-001 validou essas defesas e concluiu que a integridade contra deleção privilegiada deve permanecer coberta pelo trigger diferível owner/occupancy, sem exigir um segundo `BEFORE DELETE` dedicado.

## Rejected alternatives

- **A/B** rejeitadas por não cobrirem sobreposição real.
- **C** rejeitada por materialização prematura de slots.
- **D sozinha** rejeitada por depender de disciplina de chamada.
- **E** rejeitada por não unificar bloqueios.

## Status

**ACCEPTED — evidenciado pelo SPK-001 em 23 de agosto de 2026**

Nota de evidência: a exclusion constraint PostgreSQL é a garantia final contra overlap; ocupações usam intervalos `[)`; a role de runtime não possui `DELETE` em `ScheduleOccupancy`; a ordem global de locks foi validada; remarcação que encontra conflito preserva atomicamente a ocupação anterior.

---

# ADR-005 — Authentication and Customer Access Tokens

## Context

Somente o administrador possui conta. Clientes acessam um Appointment por link secreto e devem poder consultar, cancelar ou remarcar. O sistema precisa evitar IDOR, enumeração, vazamento em logs e efeitos duplicados após timeout.

## Problem

Escolher autenticação administrativa e formato/ciclo do token de cliente, incluindo sessão, recuperação, armazenamento, rotação, revogação e idempotência.

## Options considered

### Autenticação administrativa

#### A. Auth próprio

Controle completo, mas exige senha, reset, e-mail, sessão e hardening próprios.

#### B. Supabase Auth

Integra com stack proposta, oferece sessão e recuperação, mas requer integração SSR/cookies cuidadosa.

#### C. Provedor externo adicional

Recursos maduros, mas adiciona custo e dependência sem necessidade de um usuário.

### Token do cliente

#### D. ID/UUID do Appointment na URL

Insuficiente: identificador não é segredo e permite IDOR se tratado como autorização.

#### E. Token assinado stateless

Não exige lookup inicial, mas revogação/versionamento e resposta incerta ficam mais complexos.

#### F. Token aleatório com hash armazenado

Lookup simples, rotação/revogação explícitas e vazamento do banco não revela token bruto.

#### G. Conta/OTP para cliente

Maior prova de identidade, mas viola o MVP sem conta e adiciona fricção/custo.

## Proposed decision

### Administrador

- **Supabase Auth** com e-mail/senha e recuperação oficial.
- Fluxo oficialmente suportado pelo `@supabase/ssr`, com sessão baseada em cookies; o modelo padrão não promete `HttpOnly`.
- Cookies com `Secure` em produção e `SameSite` adequado ao fluxo validado.
- Cliente Supabase criado por request, nunca singleton compartilhado entre usuários.
- Respostas autenticadas protegidas contra cache compartilhado.
- Identificador autenticado deve corresponder a `Business.admin_auth_user_id`.
- Sem RBAC, membership ou equipe.
- Middleware protege navegação; autenticação e autorização são novamente verificadas no servidor em toda operação.
- Origin/host e método protegem mutações com cookie contra CSRF.
- Recuperação, logout e refresh serão validados no SPK-005.

Um eventual modelo server-only/`HttpOnly` exigirá ADR separado; não será criado agora.

### Cliente

- Token aleatório de no mínimo 256 bits gerado no servidor.
- Banco guarda hash com pepper; bruto é entregue apenas na emissão.
- Um token ativo por Appointment, com rotação e revogação transacionais.
- Token válido em estado terminal concede somente leitura.
- Perda do link exige reemissão administrativa após verificação humana; sem recuperação pública.
- Erro de lookup é uniforme.

### Transporte recomendado

- Link carrega token no fragmento.
- Bootstrap do gerenciamento troca fragmento por cookie-capability curto e remove o fragmento da URL.
- Páginas usam no-store/no-referrer e não carregam analytics de terceiros.
- Cookie-capability é assinado, contém apenas referência e versão, e é revalidado no servidor.

### Resposta incerta

- IdempotencyRequest guarda resultado junto ao efeito.
- `request_fingerprint` usa comando validado/normalizado → representação canônica versionada → serialização determinística → SHA-256; nunca hash de serialização JSON arbitrária.
- Para repetir a primeira resposta contendo token, um envelope cifrado e de TTL curto armazena somente o necessário.
- Chave de cifra fica fora do banco e suporta rotação versionada.
- O SPK-003 compara alternativas de simplificação, mas não aceita como resultado normal uma reserva confirmada cujo cliente perdeu imediatamente o acesso de gerenciamento.

## Rationale

Supabase Auth evita construir segurança de senha para um único admin. Token randômico com hash armazenado é simples de revogar e não expõe outros agendamentos. Fragment exchange reduz vazamento em referrer e logs de URL. O envelope cifrado fecha a lacuna entre token “mostrar uma vez” e retry após commit incerto.

## Consequences

### Positivas

- Sem senha para cliente.
- Sem token bruto permanente no banco.
- Revogação e rotação explícitas.
- Sessão administrativa gerenciada.
- Idempotência pode repetir a confirmação.

### Negativas

- Fragment exchange depende de JavaScript.
- Cookie-capability adiciona um passo.
- Envelope cifrado exige gestão de chave e expurgo.
- Token roubado continua sendo credencial válida.

## Risks

- Token aparecer em telemetria do cliente.
- Recovery do Supabase enumerar conta por mensagem inadequada.
- Cookie mal configurado em preview/produção.
- Cache compartilhado de resposta autenticada ou cliente SSR singleton misturar sessões.
- Envelope cifrado persistir além do TTL.
- Comprometimento simultâneo do banco e chave de aplicação.

Mitigação validada: SPK-003 cobriu fragmento/idempotência e SPK-005 cobriu Auth SSR, headers, cliente por request, scrubbing, testes de URL/log, rotação e TTL.

## Rejected alternatives

- Auth próprio e provedor adicional rejeitados por custo.
- ID como token rejeitado por IDOR.
- Token stateless rejeitado por revogação e retry mais difíceis.
- OTP/conta de cliente rejeitado por escopo e fricção.

## Status

**ACCEPTED — evidenciado por SPK-003 e SPK-005 em 23 de agosto de 2026**

Nota de evidência do acesso do cliente: token CSPRNG com pelo menos 256 bits; somente o HMAC-SHA-256 é persistido, com pepper externo ao banco; há um token ativo por Appointment; rotação e revogação são transacionais; fragment bootstrap/exchange foi aprovado com capability cookie curta `HttpOnly; Secure; SameSite=Strict`. O fingerprint idempotente é canônico e versionado; concorrência/retry produzem um único efeito; response envelope AES-256-GCM de TTL curto foi aprovado para recuperar token/link após commit com resposta perdida. Token bruto não aparece em persistência, logs ou evidências.

Nota de evidência administrativa: Supabase Auth + SSR foi aprovado com clients server-side request-scoped; autenticação e autorização de Business permanecem separadas; `getSession()` não é fonte de autorização; respostas autenticadas usam `private, no-store`. Os cookies padrão observados usam `Secure=true`, `SameSite=Lax` e `HttpOnly=false`. Route Handlers sensíveis exigem validação estrita de método, Origin e Host conforme esta arquitetura.

---

# ADR-006 — Time and Timezone Strategy

## Context

O negócio configura horários locais recorrentes; agendamentos confirmados precisam representar instantes inequívocos. Dispositivo do usuário, DST e mudança de timezone não podem alterar silenciosamente compromissos.

## Problem

Definir armazenamento, conversão, precedência temporal, DST, antecedência e mudança de timezone.

## Options considered

### A. Guardar tudo como hora local

**Vantagem:** próximo da agenda humana.

**Falha:** Appointment fica ambíguo em DST e integrações.

### B. Guardar tudo em UTC

**Vantagem:** instantes inequívocos.

**Falha:** regra “segunda às 09:00” não é um instante e muda de offset ao longo do ano.

### C. Modelo híbrido local + UTC

Regras recorrentes ficam locais; confirmação converte para UTC e preserva snapshots do contexto.

**Vantagem:** representa corretamente os dois conceitos.

**Desvantagem:** conversão e testes são obrigatórios.

### Bibliotecas

- `Date` nativo: simples, mas APIs e timezone implícito são propensos a erro.
- Bibliotecas tradicionais: maduras, porém políticas de ambiguidade variam.
- Temporal/polyfill: tipos explícitos de data, hora, zona e instante; desambiguação controlável.

## Proposed decision

Adotar **C** e Temporal no servidor.

### Persistência

- Business timezone: IANA.
- Semana: weekday + `time` local.
- Exceção: `date` local + faixas locais.
- Appointment/BlockedPeriod: instantes UTC.
- Appointment snapshot: timezone IANA, data/hora local e offset escolhido.

### Conversão DST

- Zero instantes possíveis: horário inexistente, não gerar slot.
- Dois instantes possíveis: escolher a primeira ocorrência cronológica.
- Um instante: usar normalmente.
- Nunca deslocar horário inexistente para a próxima hora.

### Antecedência

- Mínima em minutos decorridos desde `now` do servidor.
- Máxima em dias de calendário local do Business.
- Datas/horas no passado são rejeitadas na confirmação.
- O horizonte do `Business` não autoriza requests públicos arbitrariamente grandes: o boundary aplica com Zod um teto técnico pequeno, aproximadamente mensal, e pagina/chunka horizontes maiores. O número exato depende da Sprint 0/load test.

### Mudança de timezone

- Bloquear enquanto existir Appointment confirmado futuro.
- Sem futuros, atualizar sob lock exclusivo e incrementar `availability_version`.
- Não reescrever histórico.
- Migração assistida é pós-MVP.

## Rationale

Uma agenda possui duas naturezas temporais. Regras recorrentes precisam “seguir o relógio local”; reservas confirmadas precisam permanecer no mesmo instante. Temporal torna essa diferença explícita e permite controlar DST sem depender do timezone do processo.

## Consequences

### Positivas

- Horários históricos inequívocos.
- Regras recorrentes permanecem humanas.
- DST possui comportamento determinístico e testável.
- Mudança de timezone falha de forma segura.

### Negativas

- Mais campos de snapshot.
- Polyfill adiciona dependência enquanto runtime/browser não oferecer suporte uniforme.
- Tzdata pode mudar após confirmação.

## Risks

- App e PostgreSQL usarem tzdata de versões diferentes.
- Formatação cliente divergir do servidor.
- Horizonte inclusivo ser interpretado de modo diferente na UI.
- Timezone mudar por regra governamental.

Mitigação: servidor como autoridade, snapshots, fixtures DST, versão de runtime fixada e testes de fronteira.

## Rejected alternatives

- Tudo local rejeitado por ambiguidade.
- Tudo UTC rejeitado por recorrência incorreta.
- `Date` sem camada explícita rejeitado por timezone implícito.
- Ajuste silencioso de horário inexistente rejeitado.

## Status

**ACCEPTED — evidenciado pelo SPK-004 em 23 de agosto de 2026**

Nota de evidência: timezone IANA é obrigatório; gaps DST não geram slots; folds escolhem deterministicamente a primeira ocorrência cronológica; Appointment confirmado permanece um instante UTC inequívoco.

---

# ADR-007 — Testing Strategy

## Context

Compilação não prova segurança, concorrência, dinheiro, timezone ou integridade. O projeto é mantido por uma pessoa com auxílio de IA e precisa de feedback rápido e provas nos pontos críticos.

## Problem

Definir uma estratégia suficiente para o risco sem criar suíte lenta e frágil.

## Options considered

### A. Predominância de E2E

Alta confiança visual, mas lentos, caros para combinações e ruins para diagnosticar regra pura.

### B. Predominância de unit com banco mockado

Rápidos, mas não provam constraints, locks, transactions ou SQL.

### C. Pirâmide orientada a risco

Muitas unidades para regras, integração real de banco para integridade, poucos E2E de jornadas.

## Proposed decision

Adotar **C**:

### Unit — Vitest

- intervalos e disponibilidade;
- duração/buffer;
- estados e políticas;
- snapshots e dinheiro;
- timezone/DST com relógio fixo;
- validação Zod.
- canonicalização versionada de fingerprint: representações equivalentes produzem o mesmo SHA-256 e intenções diferentes não colidem semanticamente.
- teto técnico de disponibilidade independente do booking horizon.

### Component — Testing Library

- formulários;
- feedback de erros/conflitos;
- foco e ações destrutivas;
- estados loading/vazio/offline;
- acessibilidade essencial.

### Database integration — PostgreSQL real

- aplicar todas as migrations do zero exclusivamente pelo Supabase CLI;
- provar que migrations da aplicação não afetam `auth`/`storage`;
- testar FKs, checks, unique, GiST exclusion e trigger diferível;
- rollback após exclusion violation e idempotência;
- queries escopadas;
- plano mínimo para índices críticos.

### Concurrency

- duas ou mais conexões reais sincronizadas por barreira;
- booking/booking;
- booking/block;
- reschedule/reschedule;
- deleção indevida de occupancy, ordem global de locks e tentativas deliberadas de deadlock;
- retry idempotente;
- configuração/booking.

### E2E — Playwright

- configurar → publicar → reservar → operar;
- conflito público;
- manual booking;
- token view/cancel/reschedule;
- auth e sessão expirada;
- viewport mobile prioritário e desktop mínimo.

### CI gates

- lint, format check, typecheck, unit/component, database/concurrency, build e smoke/E2E essenciais.
- teste crítico falhando bloqueia merge.
- cobertura percentual não substitui lista de invariantes.

## Rationale

O risco está concentrado em domínio e banco. Testes de unidade cobrem combinações; PostgreSQL real prova o que mocks não conseguem; E2E confirma integração sem replicar toda matriz.

## Consequences

### Positivas

- Feedback rápido na maioria das mudanças.
- Corridas e constraints realmente exercitadas.
- IA não consegue “passar” apenas compilando.

### Negativas

- CI precisa iniciar PostgreSQL/extensões.
- Testes concorrentes exigem engenharia cuidadosa.
- E2E depende de seed e ambiente estáveis.

## Risks

- Flakiness por `sleep`.
- Teste usando SQLite e dando falsa confiança.
- Mocks reproduzirem a implementação.
- Muitos E2E aumentarem tempo de CI.

Mitigação: barreiras determinísticas, fixtures pequenas, relógio injetável, dados isolados e matriz de risco.

## Rejected alternatives

- E2E predominante rejeitado por lentidão e diagnóstico ruim.
- Unit/mocks predominante rejeitado por não provar PostgreSQL.
- Meta de cobertura isolada rejeitada como indicador principal.

## Status

**ACCEPTED — aprovado documentalmente em 22 de agosto de 2026**

---

# ADR-008 — Deployment and Observability

## Context

O MVP precisa de baixo custo, deploy simples, ambientes seguros, migrations controladas e diagnóstico de falhas sem vazamento de PII. Vercel e Supabase são candidatos naturais para Next.js/PostgreSQL.

## Problem

Escolher hospedagem, ambientes, fluxo de migration, backup, CI e observabilidade mínima sem infraestrutura excessiva.

## Options considered

### A. Vercel + Supabase

**Vantagens:** integração com Next.js, preview, Auth/PostgreSQL gerenciados e baixa operação.

**Desvantagens:** serverless/pooling, limites de plano, dois provedores e cuidado com preview/secrets.

### B. VPS única com app e PostgreSQL

**Vantagens:** controle e custo potencialmente baixo.

**Desvantagens:** backup, patch, TLS, disponibilidade e banco ficam a cargo de uma pessoa.

### C. Plataforma containerizada alternativa + Postgres gerenciado

**Vantagens:** runtime persistente e portabilidade.

**Desvantagens:** mais configuração sem benefício confirmado para o MVP.

### Observabilidade

- Somente `console.log`: simples, mas busca/alerta e stack tracking limitados.
- Suite completa OpenTelemetry: flexível, mas excessiva agora.
- Logs estruturados + error tracking: equilíbrio proporcional.

## Proposed decision

### Hospedagem

- Vercel para Next.js em runtime Node.
- Supabase para PostgreSQL e Auth.
- Node 24 LTS e versões fixadas.
- Região da aplicação próxima à região do banco quando configurável.
- Supavisor transaction mode no runtime; conexão DDL separada para migrations.

### Ambientes

- Local: Supabase local e dados sintéticos.
- CI: PostgreSQL efêmero com `btree_gist`; Supabase local para testes de Auth necessários.
- Preview: Vercel + dados exclusivamente não produtivos.
- Produção: projetos/secrets exclusivos.

### CI/CD

- GitHub Actions em PR e branch principal.
- Supabase CLI é a única autoridade que aplica migrations; os arquivos finais revisados vivem em `supabase/migrations`.
- Drizzle Kit pode produzir SQL candidato somente para o schema da aplicação; não altera `auth`/`storage` e `drizzle-kit push` é proibido em produção.
- Migrations versionadas são aplicadas por etapa explícita, uma vez por release.
- Sem migration automática concorrente em toda instância de app.
- Compatibilidade forward quando deploy e migration não forem atômicos.
- Tags/releases após marcos demonstráveis e piloto.

### Backup

- Confirmar capacidade do plano Supabase antes do piloto.
- Backup antes de migration de risco.
- Teste documentado de restauração em ambiente não produtivo.
- Exportações contendo PII são cifradas e têm acesso/retenção limitados.

### Observabilidade

- Logs JSON estruturados por allowlist.
- Correlation ID por request/operação.
- Sentry para exceções server-side, sem Session Replay no MVP, com PII scrubbing.
- Métricas de booking, conflito, remarcação, auth e constraint.
- Release/version associada a evento.
- Nenhum token bruto, telefone integral ou segredo.

## Rationale

Vercel/Supabase reduz operação para um desenvolvedor e mantém PostgreSQL real. Logs estruturados mais error tracking são suficientes para investigar fluxos críticos sem implantar stack de telemetria própria.

## Consequences

### Positivas

- Deploy e preview rápidos.
- Auth e banco gerenciados.
- Menor carga operacional.
- Erros associados a release e request.

### Negativas

- Dependência de limites e preços dos provedores.
- Preview compartilhado pode sofrer conflito de schema/dados.
- Pooling serverless exige configuração/teste.
- Sentry é terceiro adicional.

## Risks

- Preview acessar produção por secret incorreto.
- Duas pipelines aplicarem migration.
- Conexões excederem limite.
- Logs do provedor capturarem URL sensível.
- Backup existir, mas restauração nunca ter sido testada.

Mitigação: secrets separados, environment protection, migration lock, token fora da URL enviada, smoke test e restore drill.

## Rejected alternatives

- VPS rejeitada por carga operacional.
- Containers próprios rejeitados sem necessidade.
- OpenTelemetry completo rejeitado como prematuro.
- Somente logs livres rejeitado por diagnóstico e privacidade insuficientes.

## Status

**PROPOSED — não bloqueia Sprint 0; decisões de deployment e observability devem ser fechadas antes do piloto/produção**

---

## 9. Classificação para aprovação

### Decisões `ACCEPTED` após revisão documental e technical spikes

- ADR-001: monólito modular.
- ADR-002: Drizzle/`pg`, migrations oficiais pelo Supabase CLI e Supavisor transaction mode.
- ADR-003: `Business` como raiz e escopo seletivo, com controles técnicos validados pelo SPK-006.
- ADR-004: owner/occupancy, GiST exclusion e remarcação concorrente.
- ADR-005: Supabase Auth SSR, customer capability token, fragment exchange e envelope idempotente cifrado.
- ADR-006: Temporal/timezone IANA e política DST.
- ADR-007: pirâmide orientada a risco.
- uso de PostgreSQL como autoridade;
- ausência de acesso direto do browser ao domínio;
- ausência de microserviços, filas e slots materializados.

### Decisão que permanece `PROPOSED`

- ADR-008: deployment e observability; não bloqueia Sprint 0, mas deve ser fechado antes do piloto/produção.

### Decisões controversas que exigem aprovação consciente

1. `business_id` seletivo apesar de um único Business operacional.
2. Schema tecnicamente capaz de conter segundo Business apenas para evolução/teste, sem suporte de produto.
3. `ScheduleOccupancy` como tabela técnica central.
4. Bloqueio de mudança de timezone com reservas futuras.
5. Token no fragmento trocado por cookie-capability.
6. Envelope cifrado temporário para repetir resposta com token.
7. Sentry sem Session Replay como terceiro de observabilidade.
8. Primeira ocorrência cronológica para horário local ambíguo em DST.
9. Rejeitar, sem salvar, bloqueio/configuração que conflite com reserva enquanto não houver política de resolução aprovada.
10. Reutilização/identificação de Customer por WhatsApp, sem unicidade e sem merge automático, ainda sujeita à validação do piloto.

## 10. Questões externas aos ADRs

Continuam decisões de produto, não devem ser encerradas por código:

- preço após remarcação;
- limite de remarcações;
- admin fora da jornada;
- buffer;
- correção/momento de estados terminais;
- política inicial de cancelamento;
- cadência dos horários;
- hipótese de um WhatsApp representar um Customer.

## 11. Checkpoint da FASE 4

Em 23 de agosto de 2026, os technical spikes SPK-001 a SPK-006 foram concluídos com `PASS`.

- ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006 e ADR-007: `ACCEPTED`;
- ADR-008: `PROPOSED`; não bloqueia Sprint 0, mas exige fechamento das decisões de deployment/observability antes do piloto/produção.

**TECHNICAL_SPIKES_COMPLETE**

**ARCHITECTURE_READY_FOR_SPRINT_0**

Este checkpoint não inicia a Sprint 0, não cria aplicação, banco de produção, deploy ou implementação de features. As decisões de produto abertas permanecem inalteradas.
