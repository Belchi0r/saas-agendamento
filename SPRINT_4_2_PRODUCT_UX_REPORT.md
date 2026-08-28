# SPRINT 4.2 — Product/UX Hardening

## Resultado

**PASS**

Os cinco critérios do checkpoint foram satisfeitos localmente:

1. entradas brasileiras usuais de WhatsApp são aceitas sem exigir conhecimento de E.164 e são normalizadas no servidor;
2. serviços ativos e inativos possuem distinção acessível por texto, ícone, forma, contraste e organização;
3. uma semana comum pode ser aplicada a vários dias em uma única operação, com confirmação antes de substituir dados existentes;
4. o resumo semanal permite compreender trabalho, pausas e dias fechados no topo da tela;
5. o fluxo público Serviço → Data → Horário → Dados → Revisão → Confirmação e o acesso de gerenciamento continuam completos.

Sprint 5 não foi iniciada. Nenhuma migration foi criada, renumerada ou alterada e nenhum comando remoto foi executado.

## Ambiente validado

- Windows, execução local e descartável.
- Node.js 24.19.0.
- Next.js 16.3.2, React 19.2.8, TypeScript 6.0.3.
- Vitest 4.1.11, Playwright 1.62.1.
- PostgreSQL real local por embedded-postgres 18.4.0-beta.17.
- Drizzle ORM 0.45.2, pg 8.23.0, Supabase CLI 2.115.0.
- Viewport da inspeção visual: 390 × 844; largura de conteúdo e viewport iguais nas cinco telas inspecionadas, sem overflow horizontal.

## Problemas corrigidos

### WhatsApp brasileiro

- O campo aceita 61994402561, 61 99440-2561, (61) 99440-2561, +55 61 99440-2561 e +5561994402561.
- Todos os formatos equivalentes produzem +5561994402561 no servidor e no snapshot do Appointment.
- A UI fornece máscara amigável, placeholder brasileiro, texto “Digite seu WhatsApp com DDD.”, teclado móvel apropriado, autocomplete e suporte a colagem.
- A validação de domínio rejeita país diferente, DDD inexistente, comprimento inválido, número sem o nono dígito móvel e assinante evidentemente impossível.
- O servidor continua sendo a autoridade. A validação do browser serve apenas para feedback imediato.
- WhatsApp permanece não único e não é tratado como identidade.

### Serviços

- Nome, preço, duração, status e ações ganharam hierarquia explícita.
- Ativo/Inativo não dependem apenas de cor: usam texto, símbolo, borda, forma e agrupamento separados.
- A navegação administrativa foi unificada nas quatro páginas existentes, com aba atual marcada por aria-current, alvo de toque mínimo e layout móvel sem corte.
- Nenhuma aba “Agendamentos” foi criada.

### Horários e resumo semanal

- Foi adicionada configuração rápida sobre os modelos existentes WeeklyWorkingWindow e WeeklyBreak; nenhum novo modelo de domínio foi introduzido.
- O admin seleciona vários dias, informa uma faixa de trabalho e uma pausa opcional, ou reutiliza a configuração simples de segunda-feira.
- A substituição de dias já configurados requer confirmação explícita tanto na UI quanto no domínio.
- A persistência substitui apenas os dias selecionados em uma única transação PostgreSQL, com escopo de Business e um único incremento de versão.
- A edição detalhada por dia foi preservada.
- O resumo no topo mostra os sete dias recorrentes, faixas, pausas e “Não trabalha”.

### Fluxo público, confirmação e gerenciamento

- O fluxo aprovado de descoberta de datas foi preservado, sem calendário por tentativa e erro e sem botão intermediário.
- A confirmação mostra status, data, hora, serviço, duração, preço, cliente, telefone e a ação “Gerenciar agendamento”.
- A troca de etapa reposiciona a página no topo, evitando confirmação parcialmente fora da viewport.
- A tela de gerenciamento mostra os dados persistidos e comunica explicitamente que é somente para consulta.
- Cancelamento e remarcação não foram implementados.

## Segurança e arquitetura preservadas

- A entrada de telefone é normalizada antes do fingerprint canônico e da persistência; o núcleo transacional, a exclusão de ScheduleOccupancy, token, envelope e idempotência não foram redesenhados.
- O endpoint de configuração semanal reutiliza autenticação, autorização, BusinessScope, validação de método/Origin/Host e respostas privadas do baseline.
- Nenhum business_id do browser concede autoridade.
- A aplicação em lote usa SQL parametrizado e transação única; o browser não acessa tabelas do domínio.
- git diff --name-only -- supabase/migrations permaneceu vazio. Os hashes SHA-256 das migrations 0–4 continuam:
  - Sprint 0: CECA0BB222D10A162151FC37E80BB1D0D52C1E2BCA0ACA984F094C936A7144A3
  - Sprint 1: 40C86878721F8AC2B6F257B696B3122B4419FDBBB2E15D0CAD752E15E7C298AF
  - Sprint 2: 5CE807C60C2F0E62864BA0172E2ADE918DC9488C6C5B585C2489CD22F2A0D596
  - Sprint 3: 15572B0BCDD230CC9A7AF8A25A98F7F136AEC8EB0D1AD09AFF042D673D066918
  - Sprint 4: BD7F7336B56E8F16218E8D90EF6D4804BC2AE860C7754DEF2C8A53E81E823B11

## Testes e gates

| Gate | Resultado observado |
| --- | --- |
| npm run typecheck | PASS |
| npm run lint | PASS, zero warnings |
| npm test | PASS — 24 arquivos, 92 testes |
| Integração PostgreSQL local | PASS — 5 arquivos, 26 testes; migrations 0–4 reaplicadas em banco descartável |
| npm run test:e2e pelo harness local | PASS — 8/8 cenários, um worker |
| npm run build | PASS — build de produção Next.js 16.3.2 |
| Validação visual mobile | PASS — cinco telas em 390 × 844, sem overflow horizontal |
| git diff --check | PASS |

A primeira tentativa paralela dos unitários sofreu timeout ao iniciar um worker depois de 88 testes verdes; a repetição isolada encerrou 92/92. A primeira tentativa E2E sofreu timeout ao iniciar o Chromium; a repetição isolada encerrou 8/8. Não houve falha de asserção funcional nessas tentativas.

Cobertura nova ou adaptada inclui:

- formatos brasileiros equivalentes, formatos impossíveis e normalização E.164;
- snapshot PostgreSQL com WhatsApp normalizado;
- aplicação semanal em vários dias e substituição controlada;
- resumo semanal e status acessível de serviço;
- persistência após reload;
- fluxo público completo e gerenciamento via capability;
- regressões de autenticação, autorização, exceções, bloqueios, booking, token e idempotência.

## Evidência visual

As capturas estão documentadas em evidence/sprint-4-2/README.md:

- admin-services-mobile.png;
- weekly-summary-mobile.png;
- public-customer-mobile.png;
- public-confirmation-mobile.png;
- manage-read-only-mobile.png.

A inspeção visual revelou e permitiu corrigir antes do fechamento: item de navegação cortado, contraste de texto em botões/aba ativa e confirmação aberta mantendo a rolagem da etapa anterior.

## Arquivos alterados

### Aplicação

- src/app/admin/bloqueios/page.tsx
- src/app/admin/datas-especiais/page.tsx
- src/app/admin/horarios/page.tsx
- src/app/admin/servicos/page.tsx
- src/app/api/admin/availability/weekly-template/route.ts
- src/app/globals.css
- src/app/manage/page.tsx
- src/application/availability/weekly-availability-use-cases.ts
- src/application/booking/public-booking-use-cases.ts
- src/components/admin/admin-navigation.tsx
- src/components/admin/service-manager.tsx
- src/components/admin/weekly-availability-manager.tsx
- src/components/public/brazilian-whatsapp.ts
- src/components/public/service-catalog.tsx
- src/delivery/availability/weekly-availability-input.ts
- src/domain/availability/weekly-availability.ts
- src/domain/booking/public-booking.ts
- src/persistence/availability/postgres-weekly-availability-repository.ts
- src/persistence/booking/postgres-public-booking-repository.ts

### Testes

- tests/e2e/sprint-1-services.spec.ts
- tests/e2e/sprint-2-weekly-availability.spec.ts
- tests/e2e/sprint-4-public-booking.spec.ts
- tests/integration/public-booking-vertical-slice.test.ts
- tests/integration/weekly-availability-vertical-slice.test.ts
- tests/unit/app/admin-product-ux.test.tsx
- tests/unit/application/weekly-availability-use-cases.test.ts
- tests/unit/booking/public-booking.test.ts
- tests/unit/delivery/weekly-availability-input.test.ts
- tests/unit/domain/weekly-availability.test.ts

### Relatório e evidências

- SPRINT_4_2_PRODUCT_UX_REPORT.md
- evidence/sprint-4-2/README.md
- os cinco PNGs citados na seção de evidência visual.

## Riscos e itens adiados

- A validação comprova formato plausível de celular brasileiro; não comprova posse do número nem existência de conta WhatsApp.
- A lista de DDDs válidos deverá ser revista se a numeração oficial brasileira mudar.
- A configuração rápida representa uma faixa de trabalho e uma pausa opcional por aplicação. Dias com múltiplas faixas continuam disponíveis na edição detalhada, evitando inventar um novo modelo.
- Cancelamento, remarcação e uma eventual área operacional de agendamentos permanecem adiados para a Sprint 5 e para as decisões de produto correspondentes.
- Nenhuma validação remota foi necessária: todas as garantias deste checkpoint foram exercitadas localmente com PostgreSQL real e browser real.

## Próxima ação

Encerrar o checkpoint Sprint 4.2 com **PASS**. A Sprint 5 somente deve começar por solicitação explícita posterior.
