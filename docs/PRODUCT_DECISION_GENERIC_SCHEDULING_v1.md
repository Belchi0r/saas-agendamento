# PRODUCT_DECISION_GENERIC_SCHEDULING_v1

## Controle do documento

| Campo | Valor |
|---|---|
| Produto | Barber SaaS — nome de trabalho |
| Tipo | Product Decision / análise de impacto |
| Versão | 1.0 |
| Data | 22 de agosto de 2026 |
| Status | **APROVADO** |
| Aprovação | 22 de agosto de 2026 |
| Evidência | Solicitação direta de Edmar sobre uso futuro por tatuadores e outros prestadores de serviços |
| Fontes analisadas | BARBER_PRODUCT_DISCOVERY_v1, BARBER_PRD_v1 e BARBER_UX_SPEC_v1 |

## 1. Resumo executivo

A nova evidência justifica tornar o **núcleo conceitual do produto neutro em relação ao segmento**, mas não justifica transformar o MVP em plataforma multiempresa.

O piloto continua exatamente limitado a:

- um negócio;
- um administrador;
- um profissional operacional;
- uma unidade;
- um atendimento simultâneo;
- Edmar como único cliente inicial.

A mudança recomendada é separar:

1. **contexto do piloto:** Edmar e seu negócio de barbearia;
2. **domínio do produto:** negócio, serviço, cliente, agendamento, disponibilidade e bloqueio;
3. **expansão comercial futura:** vários negócios, planos, cobrança, onboarding público e isolamento multi-tenant completo.

Somente o segundo item deve influenciar o MVP agora. O terceiro permanece pós-MVP.

### Veredito de impacto

| Dimensão | Impacto |
|---|---|
| Problema e ciclo de valor | Nenhuma mudança relevante |
| Escopo funcional do MVP | Mudança pequena: identidade básica configurável do negócio |
| Fluxos e telas | Mudança pequena e localizada; nenhum fluxo principal novo |
| Terminologia | Mudança moderada nos documentos e futura nomenclatura interna |
| Arquitetura futura | Mudança relevante de direção: avaliar `Business` como raiz de escopo |
| Multi-tenancy, billing e marketplace | Continuam fora do MVP |
| Risco de overengineering | Alto se “genérico” for interpretado como plataforma completa |

## 2. Nova evidência

Edmar perguntou se o sistema poderia atender também tatuadores e outros prestadores de serviços baseados em horário, pois acredita que poderá indicar o produto para outras pessoas.

Essa evidência confirma:

- interesse real do cliente inicial em indicar o produto;
- valor potencial do núcleo de agendamento fora da barbearia;
- risco de acoplamento desnecessário a nomes e estruturas específicas de barbearia.

Ela **não confirma**:

- demanda pagante de outros segmentos;
- adequação das regras atuais a tatuadores;
- necessidade atual de vários negócios na mesma instalação;
- necessidade de planos, cobrança, marketplace ou autoatendimento de novos negócios;
- que preço fixo, duração fixa e um serviço por reserva atendem todos os segmentos.

Portanto, trata-se de um sinal comercial promissor, não de validação de product-market fit genérico.

## 3. Decisão estratégica proposta

### 3.1 Decidir agora

1. Edmar permanece o único piloto e a principal fonte de validação do MVP.
2. O produto continua operando com exatamente um negócio, um administrador, um profissional e uma unidade.
3. O domínio conceitual não deve possuir entidades estruturais como `Barbershop`, `Barber`, `TattooStudio` ou `TattooArtist` quando os conceitos reais são genéricos.
4. Preferir os conceitos `Business`, `Service`, `Customer`, `Appointment`, `Availability` e `BlockedPeriod` na arquitetura e no código futuros.
5. “Barbearia”, “tatuagem” e outros segmentos são contexto, conteúdo e configuração; não criam regras diferentes no MVP.
6. O MVP passa a incluir uma identidade mínima configurável do negócio, sem personalização visual avançada.
7. Os arquivos existentes mantêm seus nomes para preservar rastreabilidade; renomear o produto ou os documentos não é necessário agora.

### 3.2 Não decidir nem construir agora

- auto cadastro de negócios;
- múltiplos negócios ativos;
- seletor de negócio;
- convites, membros ou papéis;
- múltiplos profissionais;
- múltiplas unidades;
- planos, assinatura e billing;
- marketplace ou catálogo público de negócios;
- domínio personalizado por cliente;
- temas, construtor de página ou white-label;
- regras específicas para tatuagem;
- formulário dinâmico por segmento;
- depósito/sinal, orçamento ou preço “a partir de”;
- recursos físicos, salas ou equipamentos;
- migração automática de dados entre negócios.

## 4. O que permanece totalmente válido

Os seguintes elementos dos três documentos permanecem válidos sem mudança de comportamento:

### Produto

- agendamento público sem conta;
- seleção de um serviço por reserva;
- serviço com preço, duração e situação ativo/inativo;
- combinações cadastradas como serviços próprios;
- um atendimento simultâneo;
- pagamento fora do sistema;
- criação manual de agendamento;
- cancelamento e remarcação por link seguro;
- estados confirmado, concluído, cancelado e no-show;
- preservação de preço, duração e nome históricos;
- disponibilidade calculada dinamicamente;
- prevenção de double booking, inclusive sob concorrência;
- timezone operacional explícito;
- autenticação e autorização administrativas no servidor;
- proteção de dados pessoais e tokens;
- piloto e validação iterativa com Edmar.

### UX

- jornada Serviço → Data → Horário → Dados → Revisão → Confirmação;
- onboarding com agenda publicada/não publicada;
- agenda diária e semanal mobile;
- gestão de serviços, jornada, intervalos, buffer, folgas, bloqueios e exceções;
- fluxos de cancelamento, remarcação e agendamento manual;
- tratamento de loading, vazio, erro, conflito e offline;
- acessibilidade, microcopy e proteção contra ações acidentais;
- inventário de 42 frames e sua priorização P0/P1.

### Restrições do MVP

- um administrador;
- um profissional operacional;
- uma unidade;
- capacidade simultânea igual a um;
- sem equipe, billing, marketplace ou analytics avançado.

Essas restrições passam a ser entendidas como limites do primeiro negócio piloto, não como definições permanentes do domínio.

## 5. Ajustes apenas terminológicos

### Termos recomendados para especificação e implementação futura

| Termo específico | Termo neutro recomendado | Observação |
|---|---|---|
| Barbeiro | Profissional ou administrador, conforme o papel | Edmar continua sendo citado quando o texto fala do piloto |
| Barbearia | Negócio | A interface pública mostra o nome configurado do negócio |
| Cliente da barbearia | Cliente | Sem mudança de comportamento |
| Agenda do barbeiro | Agenda do negócio/profissional | O MVP continua com uma agenda operacional |
| Barber/Barbershop em entidades | Business ou contexto de autenticação apropriado | Evitar nome estrutural por vertical |

### Termos que não precisam mudar

- Serviço;
- Cliente;
- Agendamento;
- Disponibilidade;
- Intervalo;
- Bloqueio;
- Folga;
- Cancelamento;
- Remarcação;
- No-show.

### Referências que devem permanecer específicas

Textos sobre piloto, critérios de validação e feedback podem continuar citando Edmar. Generalizar essas referências reduziria a clareza sobre quem está validando o produto.

## 6. Decisões de produto que realmente mudam

### 6.1 Identidade básica do negócio entra no MVP

O administrador deverá configurar:

- **nome público do negócio — obrigatório**;
- descrição pública curta — opcional;
- informação de contato pública — opcional;
- endereço ou orientação de localização — opcional no produto, mas poderá ser necessário para o piloto presencial;
- timezone — já aprovado e obrigatório.

O fluxo público usa essas informações no cabeçalho e na confirmação. Isso não inclui logo, cores, domínio próprio, galeria, redes sociais, tema ou construtor de página.

### 6.2 O segmento não controla comportamento

O MVP não terá um campo ou enumeração de segmento que habilite regras diferentes. Se existir uma descrição/categoria futuramente, ela será informativa até surgir demanda comprovada.

### 6.3 A promessa comercial deve ser limitada

O produto pode ser descrito como um **núcleo de agendamento aplicável a prestadores de serviço com horário**, mas ainda não como solução completa para tatuadores.

Tatuadores podem precisar de orçamento variável, sinal, sessões longas, aprovação de arte, formulários de saúde e múltiplas sessões. Nada disso foi validado ou incluído no MVP.

## 7. Ideias que permanecem explicitamente pós-MVP

### Plataforma multiempresa

- criação pública de contas/negócios;
- onboarding autônomo de novos negócios;
- vários negócios na mesma instalação;
- troca de negócio por usuário;
- membros, convites e permissões;
- billing, planos, trial e inadimplência;
- limites por plano;
- painel de operador da plataforma;
- suporte e auditoria entre tenants;
- exportação e portabilidade por negócio.

### Expansão operacional

- múltiplos profissionais;
- múltiplas unidades;
- escolha de profissional;
- agendas e disponibilidades por profissional;
- salas, cadeiras, equipamentos ou outros recursos;
- serviços com vários participantes ou capacidade maior que um.

### Recursos por segmento

- orçamento em vez de preço fixo;
- preço “a partir de”;
- sinal/PIX;
- formulários personalizados;
- termos e consentimentos específicos;
- upload de referências/imagens;
- sessões vinculadas;
- duração variável aprovada manualmente;
- categorias e automações específicas por vertical.

Esses itens deverão nascer de descoberta com usuários reais de cada contexto, não de uma tentativa de prever todos os negócios possíveis.

## 8. Entidade conceitual `Business` no MVP

### Opção A — Sem `Business`; configuração singleton solta

O sistema assume um único negócio e armazena configurações globais sem entidade explícita.

**Vantagens:**

- modelo inicial menor;
- menos campos e relações;
- menor carga cognitiva imediata.

**Desvantagens:**

- identidade, políticas e timezone ficam sem um proprietário conceitual claro;
- migração futura para vários negócios tende a tocar quase todas as entidades;
- regras globais podem se espalhar pelo sistema;
- reforça acoplamento acidental ao piloto.

### Opção B — Uma entidade `Business`, com uma única instância

O MVP possui exatamente um `Business`, proprietário conceitual da identidade e das configurações do negócio. Não existe interface para criar ou trocar de negócio.

**Vantagens:**

- representa corretamente o mundo real já existente;
- organiza nome público, timezone, políticas e escopo dos dados;
- reduz custo de uma futura expansão;
- não exige funcionalidades de multi-tenancy;
- evita espalhar configurações globais desconectadas.

**Desvantagens:**

- adiciona uma entidade e relacionamentos antes de existir um segundo negócio;
- pode incentivar abstrações prematuras se a equipe tentar “completar” uma plataforma.

### Recomendação de produto

**Adotar conceitualmente a Opção B:** `Business` deve existir no modelo de domínio do MVP, com exatamente uma instância operacional.

Isso não é generalização especulativa: mesmo no piloto já existe um negócio com nome, timezone, serviços, políticas e agenda. A entidade apenas dá proprietário correto a conceitos que já existem.

Não criar agora `Tenant`, `Organization`, `Subscription`, `Plan`, `Workspace`, `Membership` ou seletor de negócio.

## 9. `business_id`: precaução barata ou overengineering?

Adicionar uma coluna não cria isolamento por si só. O custo real inclui propagação de contexto, consultas, índices, unicidade, regras de acesso, testes e prevenção de vazamento.

### Alternativa 1 — Nenhum `business_id` no MVP

**Benefícios:** simplicidade máxima para o piloto.

**Custos futuros:** migração ampla; necessidade de atribuir registros existentes; revisão de todas as restrições e consultas; risco maior ao adicionar o segundo negócio sob pressão comercial.

**Adequada se:** houver convicção de que o produto permanecerá customizado para um único cliente por longo período.

### Alternativa 2 — `business_id` em todas as tabelas de forma indiscriminada

**Benefícios:** aparência de preparação multi-tenant.

**Riscos:** duplicação desnecessária; consultas mais complexas; inconsistências entre pai e filho; falsa sensação de segurança; tentação de construir tenant management antes da hora.

**Veredito:** overengineering e potencialmente perigoso se não houver enforcement consistente.

### Alternativa 3 — Escopo por `Business` nos agregados pertencentes ao negócio

Serviços, clientes, agendamentos, regras de disponibilidade e bloqueios pertencem conceitualmente a um `Business`. Entidades filhas podem obter esse escopo por seu agregado quando duplicar `business_id` não trouxer garantia ou consulta necessária.

**Benefícios:**

- custo menor agora que antes de existir produção relevante;
- propriedade dos dados explícita;
- unicidade e conflitos podem ser pensados no escopo correto;
- caminho mais seguro para futura expansão.

**Custos:**

- toda leitura e escrita precisa respeitar o escopo;
- testes devem provar que o escopo não é omitido;
- constraints e políticas precisam incluir o negócio quando necessário;
- ainda não resolve billing, membros ou onboarding multiempresa.

### Recomendação para a FASE 3

**Levar a Alternativa 3 como recomendação para um ADR, sem congelá-la silenciosamente nesta Product Decision.**

O sinal comercial direto torna a preparação seletiva razoável e provavelmente barata neste momento. Porém, sua aceitação depende de a arquitetura demonstrar:

1. quais entidades são diretamente pertencentes ao `Business`;
2. onde `business_id` é armazenado e onde é derivado pela relação pai;
3. como consultas públicas e administrativas recebem o escopo;
4. como unicidade, autorização e prevenção de double booking são limitadas ao negócio;
5. como testes impedem acesso cruzado;
6. como evitar duplicação incoerente de `business_id` em entidades filhas.

Sem esse conjunto, colocar a coluna em todo lugar seria apenas complexidade e falsa proteção.

## 10. Impacto de múltiplos negócios no futuro

Mesmo sem implementar multi-tenancy, a FASE 3 deverá reconhecer os impactos futuros:

### Identidade e roteamento

- cada negócio precisará de identificador público não enumerável ou slug;
- a página pública deverá resolver qual negócio está sendo acessado;
- nomes e slugs precisarão de regras de unicidade e mudança.

### Autenticação e autorização

- um usuário poderá pertencer a um ou mais negócios;
- papéis e convites surgirão somente quando houver demanda;
- toda operação deverá ser autorizada dentro do negócio correto.

### Dados

- serviços, clientes, agendas, políticas e histórico deverão ser isolados;
- o mesmo WhatsApp poderá existir em negócios diferentes;
- unicidade global de cliente por telefone seria uma decisão perigosa;
- exclusão, exportação e retenção poderão ocorrer por negócio.

### Concorrência e disponibilidade

- conflitos de agenda deverão ser avaliados dentro do negócio e do recurso operacional correto;
- ao surgir múltiplos profissionais, o recurso que presta o serviço precisará ser explícito;
- não é necessário criar `Professional` ou `Resource` no MVP apenas para antecipar isso.

### Operação da plataforma

- observabilidade, suporte, limites, rate limiting e auditoria precisarão do contexto do negócio;
- backups, incidentes e migrações deverão evitar mistura de dados;
- billing e status de assinatura serão domínios separados, não campos oportunistas em `Business`.

## 11. Riscos de overengineering

| Risco | Sinal de alerta | Mitigação |
|---|---|---|
| Construir multi-tenancy sem segundo cliente | telas de criar/trocar negócio | manter uma única instância no MVP |
| Criar modelo universal de prestadores | dezenas de campos opcionais por segmento | modelar apenas necessidades do piloto |
| Criar regras por categoria | `if tattoo`, `if barber`, `if clinic` | segmento não altera comportamento no MVP |
| Criar `Professional` e `Location` vazios | entidades com uma linha e nenhuma regra própria | manter profissional/unidade como restrições do Business até demanda |
| Espalhar `business_id` | coluna duplicada sem constraint ou política | ADR define propriedade e enforcement |
| Branding excessivo | tema, logo, domínio, galeria | identidade mínima: nome e informações públicas necessárias |
| Prometer suporte a tatuagem cedo | marketing antes de validar preço/duração/processo | posicionar como potencial e testar depois |
| Abstrações prematuras | interfaces genéricas sem segunda implementação | abstrair apenas onde o domínio já exige |
| Segurança ilusória | filtro de frontend por negócio | isolamento deve ser garantido em camadas confiáveis |

## 12. Alterações necessárias antes da arquitetura

Antes da FASE 3, recomenda-se aprovar:

1. `Business` como conceito de domínio com uma instância no MVP.
2. Identidade mínima configurável do negócio dentro do MVP.
3. Vocabulário neutro para entidades e regras futuras.
4. Manutenção explícita do escopo single-business/single-admin/single-professional/single-unit.
5. Lista de funcionalidades de plataforma que continuam pós-MVP.
6. Criação, na FASE 3, de ADR específico sobre escopo de dados e `business_id`.
7. Proibição de assumir que `business_id` sozinho constitui multi-tenancy seguro.

Não é necessário redesenhar os 42 frames ou reabrir todos os requisitos.

## 13. CHANGESET controlado

Nenhum documento aprovado deve ser reescrito integralmente. As alterações abaixo são pontuais e somente deverão ser aplicadas após aprovação desta Product Decision.

### 13.1 BARBER_PRODUCT_DISCOVERY_v1

| Seção | Conteúdo atual | Alteração proposta | Motivo |
|---|---|---|---|
| 1. Resumo executivo | “agenda de um barbeiro autônomo” e “O barbeiro terá…” | Descrever o núcleo como agendamento para negócio prestador de serviços, mantendo Edmar/barbearia como piloto inicial | Separar domínio do produto do contexto de validação |
| 1. Resumo executivo | “limitado a um barbeiro, uma unidade…” | “limitado a um negócio, um administrador, um profissional operacional, uma unidade e um atendimento simultâneo” | Explicitar os limites sem vertical específica |
| 3.2 Barbeiro administrador | Papel definido como barbeiro | Renomear para “Administrador/profissional do negócio” e manter “Edmar, barbeiro do piloto inicial” na descrição | Ajuste terminológico sem apagar o piloto |
| 5. Hipóteses | Não registra potencial de indicação para outros segmentos | Adicionar hipótese: “o núcleo pode atender outros prestadores baseados em horário”; validar com segundo negócio real antes de ampliar escopo | Registrar evidência sem tratá-la como demanda comprovada |
| 6. Decisões aprovadas | “Um único barbeiro no MVP” | Substituir por “Um negócio, um administrador e um profissional operacional no MVP” | Nova fronteira conceitual |
| 6. Decisões aprovadas | Não há decisão sobre neutralidade vertical | Adicionar: “o domínio não será estruturalmente acoplado à barbearia; segmentos são contexto/configuração” | Orientar FASE 3 |
| 7. Configurações | Não contém perfil do negócio | Adicionar nome público obrigatório e descrição, contato e localização opcionais | Identidade mínima necessária à página pública |
| 8. Decisões adiadas | Expansão é mencionada genericamente | Adicionar multi-business, onboarding público, billing, planos, marketplace e regras por segmento | Evitar entrada silenciosa no MVP |
| 13. Fora do MVP | “múltiplos barbeiros” e “múltiplas unidades” | Manter e acrescentar múltiplos negócios e gestão de tenants | Tornar limite comercial explícito |

### 13.2 BARBER_PRD_v1

| Seção | Conteúdo atual | Alteração proposta | Motivo |
|---|---|---|---|
| 1. Visão do produto | “oferece ao barbeiro uma área administrativa” | “oferece ao administrador/profissional do negócio uma área administrativa”; manter Edmar como piloto | Neutralidade terminológica |
| 1. Visão do produto | “um único profissional e uma única unidade” | Incluir “um único negócio e administrador” | Evitar interpretação de multi-business no MVP |
| 4. Não objetivos | “antecipar necessidades de uma rede de barbearias” | “antecipar necessidades de uma plataforma multiempresa ou de segmentos ainda não validados” | Limite de generalização mais preciso |
| 5.2 Barbeiro autenticado | Papel específico | Renomear para “Administrador/profissional autenticado” | Papel genérico; comportamento permanece |
| 7.2 Administrativo | Não inclui perfil do negócio | Adicionar “gestão da identidade pública básica do negócio” | Nova capacidade mínima aprovada |
| 8. Requisitos funcionais | RF-001 a RF-040 não cobrem identidade do negócio | Adicionar RF-041: configurar nome público obrigatório e descrição, contato e localização opcionais; exibir dados aprovados no fluxo público | Tornar mudança testável sem renumerar requisitos |
| 9. Requisitos não funcionais | Não explicita neutralidade do domínio | Adicionar RNF-015: nomes e regras estruturais não devem depender de segmento sem requisito validado | Restringir acoplamento vertical |
| 10. RN-001 | “um barbeiro, uma unidade…” | “um Business, um administrador, um profissional operacional, uma unidade e capacidade igual a um” | Definir cardinalidade do MVP no domínio neutro |
| 14. Capacidades administrativas | Não inclui identidade pública | Adicionar edição do perfil básico do negócio | Alinhar painel ao RF-041 |
| 18. Critérios de aceitação | Configuração essencial não inclui nome do negócio | Exigir nome público e timezone confirmados antes da publicação | Evitar página pública sem identidade |
| 20. Pós-MVP | Inclui múltiplos profissionais/unidades | Acrescentar múltiplos negócios, onboarding público, planos, billing, marketplace e variações por segmento | Impedir expansão implícita |
| 21. Questões abertas | Não contém decisão técnica de escopo por negócio | Adicionar questão para FASE 3: armazenamento/enforcement seletivo de `business_id` | Tornar trade-off explícito |

### 13.3 BARBER_UX_SPEC_v1

| Seção/frame | Conteúdo atual | Alteração proposta | Motivo |
|---|---|---|---|
| 1. Princípio 9 | “Edmar vê apenas…” | “O administrador vê apenas…”; manter exemplos do piloto com Edmar onde úteis | Ajuste terminológico |
| 2.3 Configurações | Quatro grupos sem identidade do negócio | Incorporar “Perfil do negócio” ao grupo de configuração inicial, sem criar menu complexo | Tornar identidade editável |
| 3.2 ADM-003 | “Configurar timezone” | Renomear para “Perfil do negócio e timezone” | Evitar criar um novo frame |
| 5.2 Configuração | Checklist aponta ADM-003 apenas como timezone | Renomear item para “Negócio: nome público e timezone” | Alinhar onboarding |
| 6. Checklist essencial | Timezone é item isolado | Substituir por “Negócio: nome público e timezone confirmados”; dados opcionais não bloqueiam publicação | Escopo mínimo claro |
| 7. Entrada pública | Identidade é citada, mas sem fonte configurável explícita | Determinar que cabeçalho e confirmação usam o perfil do Business | Conectar configuração à experiência pública |
| ADM-003 | Conteúdo possui apenas timezone | Acrescentar nome público obrigatório, descrição/contato/localização opcionais e prévia simples; preservar a configuração de timezone | Mudança localizada, sem aumentar frames |
| ADM-001 | Usuário descrito como “barbeiro administrador” | Alterar para “administrador do negócio” | Neutralidade terminológica |
| PUB-001/PUB-006/PUB-007 | “identidade do negócio” é conceitual | Especificar exibição do nome público e apenas informações públicas configuradas | Evitar conteúdo hardcoded |
| 29. Critérios de aceitação | Configuração essencial genérica | Acrescentar que nome do negócio e timezone são obrigatórios antes da publicação | Tornar mudança verificável |
| 30. Auto-revisão | Não registra neutralidade vertical | Acrescentar confirmação de que nenhum frame exige conceitos de barbearia, tatuagem ou outro segmento | QA de escopo |

## 14. Decisão recomendada para aprovação

Recomenda-se aprovar o seguinte texto:

> O produto continuará sendo validado exclusivamente com Edmar no MVP e manterá um único negócio, administrador, profissional operacional, unidade e atendimento simultâneo. O domínio será neutro em relação ao segmento e terá `Business` como conceito de primeira classe com uma única instância. A identidade pública básica do negócio será configurável. Multi-tenancy, billing, onboarding de negócios, múltiplos profissionais/unidades e funcionalidades específicas por segmento permanecem pós-MVP. A estratégia de `business_id` será decidida por ADR na FASE 3, com recomendação de escopo seletivo e consistente nos dados pertencentes ao negócio, sem assumir que uma coluna isolada produz segurança multi-tenant.

## 15. Critério de aprovação

Após aprovação desta Product Decision:

1. aplicar somente o CHANGESET da Seção 13;
2. atualizar o status desta decisão para aprovado;
3. manter BARBER_UX_SPEC_v1 em revisão até incorporar o changeset;
4. não iniciar a FASE 3 sem nova autorização explícita;
5. levar `Business` e `business_id` para ADR próprio, não para implementação automática.

**Checkpoint final:** Product Decision aprovada e consolidada em 22 de agosto de 2026; changeset controlado aplicado a Product Discovery, PRD e UX Spec; estratégia de `business_id` permanece pendente para decisão arquitetural; FASE 3 ainda não iniciada.
