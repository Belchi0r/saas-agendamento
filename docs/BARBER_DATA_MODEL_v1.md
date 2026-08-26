# BARBER_DATA_MODEL_v1

## Controle do documento

| Campo | Valor |
|---|---|
| Produto | Barber SaaS — núcleo genérico de agendamento |
| Fase | FASE 4 — Technical Spikes |
| Versão | 1.0 |
| Data | 23 de agosto de 2026 |
| Status | **BASELINE VALIDADO — TECHNICAL_SPIKES_COMPLETE** |
| Checkpoint | SPK-001 a SPK-006 concluídos com PASS; modelo pronto para orientar uma futura Sprint 0 sem iniciá-la |
| Fontes | Quatro fontes de verdade aprovadas e BARBER_ARCHITECTURE_v1 |

## 1. Objetivo e limites

Este documento define o modelo conceitual e lógico necessário para implementar o MVP. Não é uma migration, não contém DDL executável e não cria banco real.

O modelo atende exatamente:

- um `Business` operacional;
- um administrador;
- um profissional e uma unidade implícitos;
- capacidade simultânea igual a um;
- um serviço por agendamento;
- cliente sem conta;
- histórico e snapshots;
- disponibilidade recorrente e excepcional;
- bloqueios;
- concorrência e idempotência.

Não modela `Professional`, `Location`, `Tenant`, `Organization`, `Workspace`, `Membership`, `Plan` ou `Subscription`.

## 2. Princípios do modelo

1. PostgreSQL é a fonte de verdade.
2. IDs internos são UUID aleatórios e não concedem autorização.
3. Dinheiro é inteiro em unidade mínima, nunca ponto flutuante.
4. Instantes são `timestamptz`; regras recorrentes são data/hora local com timezone do `Business`.
5. Histórico financeiro e operacional usa snapshots.
6. Estados de domínio não são substituídos por soft delete genérico.
7. `business_id` existe somente onde propriedade direta, consulta, autorização ou constraint justificam.
8. Foreign keys compostas impedem cruzamento incoerente de negócio.
9. Dados técnicos de idempotência, token e ocupação permanecem separados do modelo público.
10. JSON não substitui colunas para invariantes e consultas centrais.

## 3. Visão de relacionamentos

| Origem | Cardinalidade | Destino | Observação |
|---|---:|---|---|
| Business | 1:N | Service | catálogo do negócio |
| Business | 1:N | Customer | contato dentro do negócio |
| Business | 1:1 | BusinessSchedulingPolicy | políticas do calendário |
| Business | 1:N | WeeklyWorkingWindow | faixas recorrentes |
| Business | 1:N | WeeklyBreak | intervalos recorrentes |
| Business | 1:N | DateAvailabilityException | substituição por data |
| DateAvailabilityException | 1:N | ExceptionWorkingWindow | faixas de data especial |
| Business | 1:N | BlockedPeriod | bloqueios operacionais |
| Business | 1:N | Appointment | agenda e autorização |
| Service | 1:N | Appointment | referência atual + snapshots |
| Customer | 1:N | Appointment | referência atual + snapshots |
| Appointment | 1:N | AppointmentEvent | trilha de mudanças |
| Appointment | 1:N | AppointmentAccessToken | emissão e rotação |
| Appointment | 1:1 | ScheduleOccupancy | capacidade enquanto não liberada |
| BlockedPeriod | 1:1 | ScheduleOccupancy | capacidade enquanto ativo |
| Business | 1:N | IdempotencyRequest | deduplicação de comandos |

## 4. Tipos e convenções transversais

### 4.1 IDs

- UUID v4 gerado por fonte criptograficamente segura.
- Nunca usar ID incremental em URL pública.
- `Appointment.id` não é credencial; acesso público exige token válido.

### 4.2 Timestamps

- `created_at`, `updated_at`, `occurred_at`, `revoked_at` e equivalentes são `timestamptz`.
- Banco e aplicação persistem instantes em UTC.
- `updated_at` não substitui `AppointmentEvent`.
- Relógio de domínio é injetável para testes.

### 4.3 Valores monetários

- `price_minor` é inteiro não negativo.
- `currency_code` usa código ISO 4217 e acompanha o snapshot.
- O MVP opera com uma moeda do negócio; não há conversão nem pagamento.
- Soma de preços concluídos nunca é rotulada como pagamento confirmado.

### 4.4 Versionamento otimista

Entidades mutáveis críticas possuem `version` inteiro iniciado em 1 e incrementado em toda mudança relevante. Mutações baseadas em uma tela antiga informam a versão esperada.

### 4.5 Intervalos

Intervalos temporais são meio-abertos: `[início, fim)`. Assim, 10:00–11:00 não conflita com 11:00–12:00 quando nenhum buffer ocupa a fronteira.

## 5. Business

### 5.1 Finalidade

Raiz conceitual da identidade, timezone, publicação, administrador e escopo de dados.

### 5.2 Atributos

| Campo | Regra |
|---|---|
| id | UUID, PK |
| public_name | obrigatório para publicação; não vazio após trim |
| public_description | opcional e limitado |
| public_contact | opcional; somente valor aprovado para exposição |
| public_location | opcional; texto público, não entidade `Location` |
| timezone | IANA válido; obrigatório para publicação |
| currency_code | moeda única do negócio; preservada em snapshots |
| admin_auth_user_id | UUID do Supabase Auth; obrigatório e único |
| public_booking_enabled | intenção administrativa de publicar |
| availability_version | inteiro incrementado em alteração que afeta disponibilidade |
| created_at / updated_at | auditoria básica |

### 5.3 Invariantes

- Uma sessão administrativa só opera quando seu usuário corresponde a `admin_auth_user_id`.
- Produção deve encontrar exatamente um `Business` ativo/configurado.
- Não há endpoint para criar outro `Business`.
- A publicação efetiva exige `public_booking_enabled` e checklist essencial válido.
- Timezone não muda com agendamento confirmado futuro.

## 6. BusinessSchedulingPolicy

### 6.1 Finalidade

Agrupa parâmetros simples de disponibilidade e cancelamento pertencentes a um `Business`.

### 6.2 Atributos conceituais

| Campo | Regra |
|---|---|
| business_id | PK e FK para Business |
| minimum_lead_minutes | inteiro não negativo; pendente até confirmação |
| booking_horizon_days | inteiro positivo; calendário local |
| slot_step_minutes | inteiro positivo; valor ainda requer decisão de produto |
| buffer_minutes | inteiro não negativo; semântica final ainda aberta |
| cancellation_enabled | booleano confirmado |
| cancellation_notice_minutes | obrigatório quando cancelamento online permitido |
| configuration_confirmed_at | instante de confirmação administrativa |
| version / updated_at | concorrência e auditoria básica |

### 6.3 Alertas

- `slot_step_minutes` não recebe default de produção silencioso.
- `buffer_minutes` não define sozinho se ocorre antes/depois; o cálculo depende da decisão QP-004.
- A política inicial de cancelamento continua questão de produto, embora a estrutura suporte permitir/proibir e antecedência mínima.
- `booking_horizon_days` é regra comercial do `Business`; o teto técnico pequeno por request de disponibilidade é uma validação separada do boundary, com paginação/chunks para horizontes maiores.

## 7. Service

### 7.1 Atributos

| Campo | Regra |
|---|---|
| id | UUID, PK |
| business_id | FK obrigatória; propriedade direta |
| name | obrigatório |
| description | opcional |
| price_minor | inteiro não negativo |
| currency_code | igual à moeda suportada pelo negócio no MVP |
| duration_minutes | inteiro positivo |
| active | define elegibilidade para novas reservas |
| version | controle de edição concorrente |
| created_at / updated_at | auditoria básica |

### 7.2 Constraints e índices

- Índice por `(business_id, active, name)` para catálogo.
- Unicidade de nome pode ser case-insensitive dentro do negócio, mas precisa de confirmação de produto; nomes duplicados não comprometem integridade.
- Não existe exclusão física pelo painel.
- Inativação não afeta agendamentos existentes.

## 8. Customer

### 8.1 Atributos

| Campo | Regra |
|---|---|
| id | UUID, PK |
| business_id | FK obrigatória; propriedade direta |
| display_name | nome operacional atual |
| whatsapp_e164 | telefone normalizado |
| anonymized_at | preenchido quando PII é removida |
| created_at / updated_at | auditoria básica |

### 8.2 Identidade no MVP

WhatsApp não é identidade única de pessoa no MVP. Múltiplos `Customer` podem possuir o mesmo `(business_id, whatsapp_e164)`, inclusive por compartilhamento familiar ou operacional. Não existe `UNIQUE` nessa combinação e o sistema não realiza merge automático de pessoas baseado exclusivamente no telefone.

Cada `Appointment` preserva nome e WhatsApp informados no momento, portanto edição posterior do `Customer` não reescreve histórico. A hipótese de reutilizar ou identificar cadastros por WhatsApp permanece sujeita ao piloto; qualquer reutilização deve ser explícita e não pode apagar a distinção entre pessoas.

### 8.3 Índices e privacidade

- Índice **não-único** por `(business_id, whatsapp_e164)` para busca operacional.
- Busca por nome usa estratégia simples; full-text search não é necessária no MVP.
- `anonymized_at` impede uso operacional da PII sem apagar os relacionamentos históricos.

## 9. Disponibilidade semanal

### 9.1 WeeklyWorkingWindow

| Campo | Regra |
|---|---|
| id | UUID, PK |
| business_id | FK obrigatória; propriedade direta |
| weekday | ISO 1–7 |
| start_local_time | hora local |
| end_local_time | hora local posterior ao início |
| created_at / updated_at | auditoria básica |

Regras:

- Múltiplas faixas por dia são permitidas.
- Faixas do mesmo dia não se sobrepõem.
- Faixa que atravessa meia-noite não é permitida no MVP; deve ser dividida entre dois dias. Isso simplifica fronteiras sem impedir representação.

### 9.2 WeeklyBreak

| Campo | Regra |
|---|---|
| id | UUID, PK |
| business_id | FK obrigatória; propriedade direta |
| weekday | ISO 1–7 |
| start_local_time | hora local |
| end_local_time | hora local posterior ao início |

Regras:

- Intervalos se aplicam somente quando não há exceção `REPLACE` naquela data.
- Intervalos do mesmo dia não se sobrepõem.
- O domínio valida se o intervalo intersecta alguma faixa útil; intervalos fora da jornada são rejeitados por clareza.

### 9.3 Integridade

Exclusions locais por negócio/dia podem impedir sobreposição entre faixas do mesmo tipo. Validação de relação faixa–intervalo permanece no domínio e terá teste de banco quando convertida em constraint customizada.

## 10. Exceções por data

### 10.1 DateAvailabilityException

| Campo | Regra |
|---|---|
| id | UUID, PK |
| business_id | FK obrigatória; propriedade direta |
| local_date | data no calendário do Business |
| mode | `CLOSED` ou `REPLACE` |
| private_note | opcional; nunca público |
| version / timestamps | concorrência e auditoria |

Constraint: uma exceção por `(business_id, local_date)`.

`CLOSED` representa folga ou fechamento total. `REPLACE` representa horário especial e ignora as faixas/intervalos semanais daquela data.

### 10.2 ExceptionWorkingWindow

| Campo | Regra |
|---|---|
| id | UUID, PK |
| date_exception_id | FK obrigatória; escopo derivado |
| start_local_time | hora local |
| end_local_time | hora local posterior ao início |

Regras:

- `CLOSED` não possui faixas filhas.
- `REPLACE` possui ao menos uma faixa válida.
- Faixas da mesma exceção não se sobrepõem.
- Múltiplas faixas representam também pausas especiais.

## 11. BlockedPeriod

### 11.1 Finalidade

Indisponibiliza um intervalo concreto sem alterar a regra semanal. Um bloqueio de dia inteiro é convertido, no timezone vigente, para intervalo UTC e preserva os dados locais usados na conversão.

### 11.2 Atributos

| Campo | Regra |
|---|---|
| id | UUID, PK |
| business_id | FK obrigatória; propriedade direta |
| start_at / end_at | instantes UTC; início menor que fim |
| local_date_from / local_date_to | snapshot quando criado como dia inteiro |
| timezone_snapshot | IANA usado na criação |
| private_reason | opcional; não público |
| active | falso quando removido/cancelado |
| version / timestamps | concorrência e auditoria |

Um `BlockedPeriod` ativo possui exatamente uma `ScheduleOccupancy`. Se houver sobreposição, a criação falha e não cancela nenhum agendamento.

## 12. Appointment

### 12.1 Atributos de identidade e escopo

| Campo | Regra |
|---|---|
| id | UUID, PK |
| business_id | FK obrigatória; propriedade direta |
| service_id | FK composta com business_id |
| customer_id | FK composta com business_id |
| status | enum canônico |
| origin | `PUBLIC` ou `ADMIN` |
| version | controle de remarcação/transição concorrente |

### 12.2 Snapshots do serviço

| Campo | Motivo |
|---|---|
| service_name_snapshot | edição posterior não altera histórico |
| service_duration_minutes_snapshot | preserva compromisso original |
| service_price_minor_snapshot | preserva valor efetivo |
| currency_code_snapshot | dá significado ao valor |
| service_description_snapshot | opcional; somente se necessário à interpretação operacional |

### 12.3 Snapshots do cliente

| Campo | Motivo |
|---|---|
| customer_name_snapshot | nome informado na reserva |
| customer_whatsapp_snapshot | contato usado naquele momento |

PII de snapshot participa da futura política de anonimização; snapshot histórico não significa retenção infinita.

### 12.4 Tempo

| Campo | Regra |
|---|---|
| scheduled_start_at | instante UTC |
| scheduled_end_at | início + duração efetiva do serviço |
| occupied_start_at / occupied_end_at | intervalo usado para capacidade; suporta buffer sem congelar semântica |
| timezone_snapshot | timezone IANA da confirmação |
| local_date_snapshot | data local mostrada na confirmação |
| local_time_snapshot | hora local mostrada na confirmação |
| utc_offset_minutes_snapshot | offset escolhido, inclusive em horário ambíguo |

O intervalo de ocupação precisa conter o intervalo do serviço. A `ScheduleOccupancy` correspondente usa exatamente `[occupied_start_at, occupied_end_at)`.

### 12.5 Estado e cancelamento

| Campo | Regra |
|---|---|
| status | `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW` |
| cancelled_at | obrigatório quando cancelado |
| cancellation_actor | `CUSTOMER` ou `ADMIN` quando cancelado |
| created_at / updated_at | auditoria básica |

Não há estado `RESCHEDULED`; a remarcação mantém `CONFIRMED`, atualiza período/version e adiciona evento.

### 12.6 Constraints e índices

- `scheduled_start_at < scheduled_end_at`.
- `occupied_start_at <= scheduled_start_at` e `occupied_end_at >= scheduled_end_at`.
- Foreign keys compostas garantem mesmo `Business` entre Appointment, Service e Customer.
- Índice de agenda `(business_id, scheduled_start_at)`.
- Índice de cliente `(business_id, customer_id, scheduled_start_at desc)`.
- Índice parcial de confirmados futuros será avaliado conforme plano do PostgreSQL.
- Não há exclusão física pelo painel.

## 13. ScheduleOccupancy

### 13.1 Finalidade

Tabela técnica única para todas as ocupações concretas da capacidade singleton. Evita uma constraint que proteja appointment contra appointment, mas esqueça appointment contra bloqueio.

### 13.2 Atributos

| Campo | Regra |
|---|---|
| id | UUID, PK |
| business_id | FK obrigatória; propriedade direta |
| appointment_id | FK opcional |
| blocked_period_id | FK opcional |
| occupied_period | range UTC meio-aberto |
| released_at | nulo enquanto a ocupação continua válida |
| created_at | auditoria |

### 13.3 Invariantes

- Exatamente um entre `appointment_id` e `blocked_period_id` é preenchido.
- Um Appointment ou BlockedPeriod possui no máximo uma ocupação.
- Exclusion constraint impede sobreposição de ocupações não liberadas no mesmo `Business`.
- Criação do proprietário e da ocupação ocorre na mesma transação.
- Um constraint trigger diferível ou mecanismo equivalente deve verificar, no commit, que todo Appointment recém-confirmado e todo BlockedPeriod ativo possui sua ocupação. O SPK-001 validou o trigger diferível owner/occupancy como a forma adequada.
- Cancelamento/revogação libera ocupação na mesma transação.
- Conclusão e no-show não precisam liberar uma faixa passada.
- A aplicação nunca usa `DELETE` para liberar capacidade; cancelamento, remarcação e revogação usam mudança de estado e/ou `released_at`.
- A role de runtime não possui privilégio `DELETE` em `ScheduleOccupancy`.
- O SPK-001 validou que o trigger diferível owner/occupancy deve cobrir deleção privilegiada; não é necessário um segundo `BEFORE DELETE` dedicado. Purge histórico não pertence ao MVP.

### 13.4 Índices

- GiST para `(business_id com igualdade, occupied_period com sobreposição)` nas linhas não liberadas.
- Unique parcial em `appointment_id` quando preenchido.
- Unique parcial em `blocked_period_id` quando preenchido.
- B-tree por `(business_id, released_at)` para manutenção.

## 14. AppointmentEvent

### 14.1 Finalidade

Trilha append-only específica do agendamento, não um event sourcing nem sistema universal de auditoria.

### 14.2 Atributos

| Campo | Regra |
|---|---|
| id | UUID, PK |
| appointment_id | FK; escopo derivado |
| appointment_version | versão resultante; única por Appointment |
| event_type | `CREATED`, `RESCHEDULED`, `CANCELLED`, `COMPLETED`, `NO_SHOW` |
| actor_type | `CUSTOMER_TOKEN`, `ADMIN`, `SYSTEM` |
| occurred_at | instante UTC |
| from_status / to_status | quando aplicável |
| from_start_at / to_start_at | quando aplicável |
| from_end_at / to_end_at | quando aplicável |
| details | JSON pequeno, versionado e sem token/WhatsApp/nome |

O evento de remarcação preserva antes/depois. Se preço mudar após decisão futura, valores anterior/novo entram no payload validado do evento.

## 15. AppointmentAccessToken

### 15.1 Atributos

| Campo | Regra |
|---|---|
| id | UUID, PK |
| appointment_id | FK; escopo derivado |
| token_hash | hash com pepper, único e indexado |
| issued_at | emissão |
| last_used_at | opcional e coarse-grained |
| revoked_at | nulo enquanto válido |
| expires_at | opcional; depende da política de retenção, não do estado operacional |
| rotation_reason | opcional e não sensível |

### 15.2 Invariantes

- Somente um token não revogado por Appointment.
- Token bruto nunca é persistido nesta tabela.
- Estado terminal remove mutações, não necessariamente leitura.
- Rotação revoga o anterior e cria novo registro atomicamente.
- Lookup inválido não revela existência de Appointment.

## 16. IdempotencyRequest

### 16.1 Atributos

| Campo | Regra |
|---|---|
| id | UUID, PK |
| business_id | FK obrigatória; propriedade direta |
| operation | tipo de comando |
| key_hash | hash da chave recebida |
| request_fingerprint | hash canônico dos campos relevantes |
| status | `SUCCEEDED`; estado transitório só existe dentro da transação |
| appointment_id | FK opcional para resultado |
| response_status | código lógico/HTTP estável |
| response_envelope | conteúdo cifrado mínimo quando token precisa ser repetido |
| created_at / expires_at | retenção curta |

### 16.2 Invariantes

- Unique `(business_id, operation, key_hash)`.
- `request_fingerprint` segue o pipeline: comando validado/normalizado → representação canônica versionada → serialização determinística → SHA-256; não é hash de JSON arbitrário.
- Mesma chave e fingerprint retorna o resultado anterior.
- Mesma chave com fingerprint diferente retorna conflito.
- Recibo e efeito de domínio confirmam ou revertem juntos.
- Envelope nunca contém senha ou segredo administrativo; token público somente cifrado e com retenção curta.

## 17. Matriz de `business_id`

| Entidade | `business_id` armazenado? | Justificativa |
|---|---:|---|
| Business | não | é a própria raiz |
| BusinessSchedulingPolicy | sim, como PK/FK | relação 1:1 e lock/configuração |
| Service | sim | catálogo e unicidade escopados |
| Customer | sim | cadastro pertence ao negócio; WhatsApp é pesquisável, mas não identifica pessoa de forma única |
| WeeklyWorkingWindow | sim | raiz simples consultada diretamente por dia |
| WeeklyBreak | sim | raiz simples consultada diretamente por dia |
| DateAvailabilityException | sim | unicidade por negócio/data |
| ExceptionWorkingWindow | não | derivado pela exceção |
| BlockedPeriod | sim | agenda, autorização e ocupação |
| Appointment | sim | agenda, autorização, FKs compostas e consultas críticas |
| ScheduleOccupancy | sim | exclusion constraint precisa do escopo |
| AppointmentEvent | não | derivado pelo Appointment |
| AppointmentAccessToken | não | derivado pelo Appointment; lookup pelo hash |
| IdempotencyRequest | sim | unicidade e operação escopadas |

Adicionar `business_id` a filhos derivados sem constraint composta foi rejeitado porque permitiria duplicação incoerente.

## 18. Unicidade e foreign keys compostas

Para permitir referência escopada, as raízes expõem unicidade em `(business_id, id)`. Appointment referencia:

- `(business_id, service_id)` → Service;
- `(business_id, customer_id)` → Customer.

ScheduleOccupancy referencia Appointment ou BlockedPeriod e exige o mesmo `business_id` por foreign key composta. Assim, copiar um ID válido de outro negócio não produz relação válida mesmo se uma query de aplicação errar.

## 19. Transações críticas

### 19.1 Criar agendamento

Na mesma transação:

1. registrar/obter idempotência;
2. bloquear versão de disponibilidade em modo compartilhado;
3. validar Service, Customer e regras;
4. criar Customer ou usar um Customer explicitamente selecionado, sem inferir merge por telefone;
5. criar Appointment com snapshots;
6. criar ScheduleOccupancy;
7. criar AppointmentEvent;
8. criar token hash;
9. finalizar recibo idempotente.

### 19.2 Cancelar

Na mesma transação:

1. lock do Appointment;
2. validar estado/política/versão;
3. atualizar status;
4. liberar ScheduleOccupancy preenchendo `released_at`, nunca por `DELETE`;
5. adicionar AppointmentEvent;
6. persistir idempotência.

Cancelamento repetido não adiciona outro evento.

### 19.3 Remarcar

Na mesma transação:

1. lock compartilhado da disponibilidade/configuração;
2. lock do Appointment;
3. validar novo intervalo;
4. mover ScheduleOccupancy;
5. atualizar Appointment e snapshots permitidos;
6. incrementar version;
7. adicionar evento antes/depois;
8. persistir idempotência.

Conflito na ocupação reverte tudo e mantém o período anterior.

Política global: quando uma transação precisar dos dois tipos de lock, adquire primeiro disponibilidade/configuração e depois `Appointment`. O SPK-001 validou essa ordem e demonstrou deadlocks deliberados quando ela é invertida.

### 19.4 Criar bloqueio

Na mesma transação:

1. lock de configuração quando necessário;
2. criar BlockedPeriod;
3. criar ScheduleOccupancy;
4. commit ou conflito integral.

## 20. Estados e ocupação

| Estado do Appointment | Pode sofrer ação do cliente? | Ocupação |
|---|---|---|
| CONFIRMED | cancelar/remarcar se política permitir | não liberada |
| CANCELLED | somente leitura | liberada |
| COMPLETED | somente leitura | preservada historicamente |
| NO_SHOW | somente leitura | preservada historicamente |

Reabertura de terminal não está modelada como operação do MVP. Se aprovada depois, deverá revalidar/recriar ocupação quando necessário e registrar evento.

## 21. Inativação, exclusão e anonimização

| Dado | Estratégia MVP |
|---|---|
| Service | `active=false`; sem exclusão pelo painel |
| Customer | anonimização de PII quando política permitir |
| Appointment | estado, nunca soft delete genérico |
| BlockedPeriod | inativação/liberação da ocupação |
| Date exception/faixas | remoção controlada somente quando não cria conflito; mudanças versionadas por timestamp |
| Access token | revogação |
| IdempotencyRequest | exclusão após TTL |
| AppointmentEvent | append-only durante retenção do Appointment |

Não existe coluna `deleted_at` automática em todas as tabelas.

## 22. Índices mínimos

1. Service por negócio/atividade.
2. Customer por índice **não-único** de negócio/WhatsApp e busca de nome.
3. Appointment por negócio/início e cliente/início.
4. DateAvailabilityException único por negócio/data.
5. Weekly windows/breaks por negócio/dia.
6. BlockedPeriod por negócio/início/fim.
7. ScheduleOccupancy GiST para exclusão e range.
8. AppointmentEvent único por agendamento/versão e ordenado por ocorrência.
9. Token hash único.
10. Idempotência única por negócio/operação/chave.

Índices adicionais só entram após `EXPLAIN` ou consulta real justificar.

## 23. Integridade além do banco

O banco garante forma e conflitos centrais, mas as seguintes regras ficam no domínio porque dependem de política:

- serviço ativo para nova reserva;
- antecedência e horizonte;
- precedência semanal/exceção;
- semântica do buffer;
- política de cancelamento/remarcação;
- momento permitido de concluir/no-show;
- preço após remarcação.

Essas regras são revalidadas no servidor imediatamente antes da escrita protegida por transação.

## 24. Evolução para segundo Business

Já preparado:

- propriedade seletiva;
- constraints e índices com `business_id`;
- busca de WhatsApp escopada por negócio, sem unicidade de pessoa;
- ocupação escopada;
- administrador ligado ao Business;
- testes de isolamento.

Ainda necessário quando houver demanda real:

- roteamento público por slug/identificador;
- onboarding e provisioning;
- membership/papéis;
- isolamento de sessão e suporte;
- RLS/políticas específicas ou credenciais por tenant;
- rate limit, observabilidade, exportação e retenção por negócio;
- billing e status comercial em domínio separado.

A segunda linha em `Business` não deve ser ativada em produção antes desses itens.

## 25. Decisões e validações pendentes

### Produto

- preço após remarcação;
- limite de remarcações;
- admin fora da jornada;
- semântica final de buffer;
- correção/momento de estados terminais;
- política inicial de cancelamento;
- cadência de início dos horários;
- hipótese de reutilização/identificação de Customer por WhatsApp, sujeita ao piloto e sem merge automático.

### Spikes

- forma final da owner constraint em ScheduleOccupancy;
- proteção contra deleção de ScheduleOccupancy, ordem global de locks e deadlocks deliberados;
- Supabase CLI como única autoridade de migrations, Drizzle limitado ao schema da aplicação e preservação de `auth`/`storage`;
- aplicação do schema do zero, rollback após exclusion violation e transaction pooling sem prepared statements;
- custo/plano de execução do GiST com volume significativo e impacto das ocupações históricas no índice;
- envelope cifrado idempotente;
- Temporal/DST no runtime fixado;
- role mínima e schema privado no Supabase.

Todos os itens de spike acima foram exercitados com resultado `PASS`; os detalhes e limitações permanecem nos relatórios finais SPK-001 a SPK-006 e nas notas de evidência dos ADRs correspondentes.

## 26. Auto-revisão do modelo

| Invariante | Mecanismo |
|---|---|
| Sem dois intervalos ativos sobrepostos | ScheduleOccupancy + GiST exclusion |
| Appointment não cruza Business | composite foreign keys |
| Serviço editado não muda histórico | snapshots |
| Dinheiro sem perda | inteiro + currency snapshot |
| Remarcação tudo-ou-nada | uma transação + mesma ocupação + evento |
| Retry não duplica | IdempotencyRequest na transação |
| Token não enumerável | CSPRNG + hash único |
| Terminal não permite mutação de cliente | estado + caso de uso |
| Timezone histórico interpretável | UTC + timezone/local/offset snapshots |
| Config não cancela reserva | detecção de conflito + fail closed |

## 27. Checkpoint da FASE 4

Em 23 de agosto de 2026, o modelo permaneceu aprovado como baseline conceitual e lógico, agora com os mecanismos críticos validados pelos SPK-001 a SPK-006. Nenhuma decisão de produto foi alterada e nenhuma estrutura pós-MVP foi adicionada; `Business` continua primeira classe, enquanto `Professional`, `Location` e entidades de plataforma continuam ausentes.

**TECHNICAL_SPIKES_COMPLETE**

**ARCHITECTURE_READY_FOR_SPRINT_0**

Este checkpoint não converte o modelo em schema/migration de produção e não inicia Sprint 0, aplicação, Next.js, banco de produção ou implementação de features.
