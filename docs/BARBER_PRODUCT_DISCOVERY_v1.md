# BARBER_PRODUCT_DISCOVERY_v1

## Controle do documento

| Campo | Valor |
|---|---|
| Produto | Barber SaaS |
| Cliente inicial | Edmar, barbeiro autônomo |
| Fase | FASE 0 — Product Discovery |
| Versão | 1.0 |
| Data | 21 de agosto de 2026 |
| Status | **APROVADO — checkpoint de encerramento da FASE 0** |

## 1. Resumo executivo

O Barber SaaS será uma aplicação web mobile-first para reduzir o trabalho manual envolvido na agenda de um negócio prestador de serviços baseados em horário. O cliente poderá consultar horários realmente disponíveis e reservar sem criar conta. O administrador/profissional do negócio terá uma área autenticada para configurar o funcionamento e administrar a agenda. Edmar e sua barbearia permanecem como piloto inicial.

O primeiro produto será deliberadamente limitado a um negócio, um administrador, um profissional operacional, uma unidade e um atendimento simultâneo. A estratégia é entregar um núcleo pequeno e utilizável, colocá-lo em uso com Edmar e priorizar evoluções a partir de evidências reais.

Não será realizada uma entrevista extensa antes do MVP. Informações operacionais variáveis serão configurações administráveis, e as hipóteses de comportamento e adoção serão validadas durante o uso real.

## 2. Problema

Hoje os agendamentos são conduzidos manualmente pelo WhatsApp, após divulgação do trabalho no Instagram. Esse processo gera:

- perguntas repetidas sobre horários disponíveis;
- esforço constante para consultar, oferecer e confirmar horários;
- baixa visibilidade quando um cancelamento libera uma vaga;
- risco de conflito, esquecimento ou registro inconsistente;
- dificuldade para enxergar a agenda de forma centralizada;
- dependência do barbeiro para operações simples do cliente;
- dificuldade para manter um histórico operacional confiável.

O problema central não é a ausência de uma agenda sofisticada, mas a falta de um ciclo confiável de configuração de disponibilidade, reserva e acompanhamento do atendimento.

## 3. Usuários

### 3.1 Cliente

Pessoa que deseja reservar um serviço pelo celular com o mínimo de fricção, sem criar conta e sem precisar perguntar ao barbeiro quais horários estão livres.

Necessidades principais:

- conhecer serviços, preços e durações relevantes;
- visualizar apenas datas e horários reserváveis;
- concluir a reserva rapidamente;
- receber uma confirmação clara;
- consultar, cancelar ou remarcar por um acesso seguro.

### 3.2 Administrador/profissional do negócio

No piloto inicial, Edmar é o barbeiro responsável por atender clientes e administrar o negócio.

Necessidades principais:

- controlar serviços e disponibilidade sem ajuda do desenvolvedor;
- visualizar a agenda diária e semanal;
- registrar reservas recebidas fora do sistema;
- evitar conflitos de horário;
- acompanhar o estado de cada atendimento;
- preservar informações históricas relevantes.

## 4. Necessidades consolidadas

### 4.1 Necessidades do cliente

- Descobrir horários disponíveis sem iniciar uma conversa manual.
- Reservar informando apenas os dados necessários.
- Ter confiança de que a reserva foi concluída.
- Consultar a reserva posteriormente.
- Cancelar ou remarcar de acordo com a política vigente.

### 4.2 Necessidades do barbeiro

- Manter disponibilidade, serviços e regras operacionais configuráveis.
- Impedir sobreposição de atendimentos.
- Bloquear períodos, folgas e exceções.
- Inserir manualmente agendamentos vindos do WhatsApp.
- Registrar conclusão, cancelamento e no-show.
- Consultar histórico sem que alterações futuras apaguem o contexto original.

### 4.3 Necessidades do produto

- Ser confiável em condições de concorrência.
- Não depender do timezone do dispositivo para interpretar horários.
- Aplicar autenticação e autorização no servidor para funções administrativas.
- Proteger dados pessoais e links de gerenciamento.
- Não exigir mudanças no código para alterações normais do negócio.

## 5. Hipóteses a validar com uso real

As hipóteses desta seção **não estão confirmadas**. O MVP deverá produzir evidências para aceitá-las, revisá-las ou rejeitá-las.

| Hipótese | Como validar |
|---|---|
| Clientes aceitarão usar um link em vez de perguntar horários pelo WhatsApp | Observar proporção de reservas autônomas e relatos de dificuldade |
| O fluxo sem conta será simples e suficientemente seguro | Observar abandono, suporte solicitado, abuso e perda de links |
| Nome e WhatsApp são suficientes para identificar o cliente no MVP | Verificar duplicidades, erros de contato e necessidades operacionais |
| Edmar manterá agenda e bloqueios atualizados | Acompanhar divergências entre sistema e operação real |
| Edmar registrará no sistema reservas recebidas pelo WhatsApp | Comparar agenda real e agenda digital durante o piloto |
| Serviços possuem duração previsível | Comparar duração configurada com atrasos e encaixes reais |
| Um tempo configurável entre atendimentos cobre a preparação necessária | Coletar feedback sobre atrasos e necessidade de buffers distintos |
| Cancelamento e remarcação autônomos reduzem trabalho sem gerar abuso | Observar volume, antecedência e impacto das alterações |
| Uma aplicação web mobile-first atende clientes e administrador | Avaliar uso por dispositivo, desempenho e dificuldades de navegação |
| Um profissional e uma unidade cobrem o horizonte inicial do negócio | Confirmar durante o piloto e em planos reais de expansão |
| O valor do atendimento concluído é suficiente para indicadores operacionais básicos | Validar se descontos, pagamentos parciais e formas de pagamento se tornam necessários |
| O núcleo de agendamento pode atender outros prestadores de serviços baseados em horário | Validar com um segundo negócio real antes de ampliar funcionalidades ou posicionamento comercial |

## 6. Decisões aprovadas

- Um único negócio, um administrador e um profissional operacional no MVP.
- Uma única unidade/localização.
- Somente um atendimento simultâneo.
- Aplicação web mobile-first.
- Cliente sem conta.
- Somente o barbeiro possui autenticação.
- Reserva com nome e WhatsApp.
- Um serviço por agendamento.
- Combinações, como corte e barba, podem ser cadastradas como um serviço próprio.
- Pagamentos acontecem fora do sistema.
- O barbeiro pode criar manualmente agendamentos recebidos pelo WhatsApp.
- O cliente pode consultar, cancelar e remarcar por link/token seguro.
- O barbeiro pode marcar atendimento como concluído, cancelado ou no-show.
- Dados históricos relevantes devem ser preservados, incluindo preço efetivo e contexto do serviço no momento da reserva.
- Regras operacionais variáveis pertencem ao painel administrativo.
- O domínio do produto não será estruturalmente acoplado à barbearia; segmentos como barbearia ou tatuagem são contexto/configuração e não alteram o comportamento do MVP.
- Requisitos novos surgidos no piloto serão avaliados e priorizados; não entram automaticamente no escopo.

## 7. Configurações administrativas aprovadas

O administrador do negócio deverá conseguir configurar, sem alteração de código:

- nome público do negócio, obrigatório;
- descrição pública curta, contato e localização, opcionais;
- serviços, preço, duração e situação ativo/inativo;
- dias da semana trabalhados;
- faixas de horário de cada dia;
- intervalos recorrentes;
- tempo entre atendimentos, quando aplicável;
- folgas;
- bloqueios temporários;
- exceções de datas;
- antecedência mínima e máxima;
- regras de cancelamento;
- parâmetros simples adicionais necessários ao cálculo de disponibilidade.

Configurações essenciais não poderão ser presumidas silenciosamente em produção. Antes de liberar reservas públicas, o produto deverá exigir a confirmação de nome público do negócio, serviço, duração, preço, timezone e disponibilidade básica. Defaults de desenvolvimento ou de parâmetros não críticos deverão ser explícitos e editáveis.

## 8. Decisões conscientemente adiadas

As decisões abaixo não bloqueiam a FASE 1, mas deverão permanecer visíveis:

- política exata de cancelamento inicial;
- limite ou política para remarcações sucessivas;
- possibilidade de o administrador criar horário fora da jornada configurada;
- comportamento diante de atraso do cliente;
- necessidade de registrar forma de pagamento, desconto ou valor realmente recebido;
- necessidade de expiração adicional do link de gerenciamento além do encerramento operacional;
- prazo de retenção e mecanismo de exclusão/anonimização de dados pessoais;
- forma de divulgação e incentivo para adoção do link pelos clientes;
- métricas quantitativas de sucesso, que dependem da linha de base real.
- múltiplos negócios, onboarding público, billing, planos e marketplace;
- regras e fluxos específicos por segmento ainda não validado.

Enquanto essas decisões estiverem abertas, o PRD deverá adotar comportamento conservador, visível e reversível, sem inventar regras específicas do negócio.

## 9. Riscos

### 9.1 Produto e adoção

- Clientes continuarem preferindo o WhatsApp.
- Edmar manter agendas paralelas inconsistentes.
- O painel gerar mais trabalho do que valor.
- O escopo crescer antes de o núcleo ser validado.
- Regras configuráveis demais tornarem a configuração difícil.

### 9.2 Operação

- Bloqueios e reservas externas não serem registrados.
- Dados incorretos de duração causarem atrasos em sequência.
- Clientes perderem ou compartilharem o link de gerenciamento.
- Agendamentos falsos ou com WhatsApp inválido.
- Cancelamentos tardios e remarcações repetidas afetarem a agenda.

### 9.3 Integridade, segurança e privacidade

- Duas requisições reservarem o mesmo período.
- Alterações em serviços modificarem registros históricos.
- Cálculo incorreto por timezone, mudanças de horário ou limites de data.
- Usuário não autorizado acessar funções administrativas.
- Token previsível, reutilizado indevidamente ou exposto.
- Exposição excessiva de nome, WhatsApp e histórico.
- Métricas financeiras confundirem valor do serviço com pagamento efetivamente recebido.

### 9.4 Mitigação de escopo

- Manter o MVP restrito ao ciclo central.
- Exigir testes específicos para disponibilidade, concorrência, autorização, tokens e histórico.
- Tornar configurações críticas explícitas.
- Pilotar com Edmar antes de ampliar o produto.
- Registrar feedback como insumo de priorização, não como compromisso automático.

## 10. Ciclo mínimo de valor

> O barbeiro configura serviços e disponibilidade → o cliente encontra um horário válido e reserva → o sistema impede que o mesmo período seja reservado novamente → o barbeiro visualiza o agendamento e registra o resultado do atendimento → o histórico permanece confiável.

O MVP somente terá valor real se esse ciclo funcionar de ponta a ponta e for utilizado na operação cotidiana.

## 11. Critérios e sinais de sucesso

### 11.1 Critérios mínimos de funcionamento

- Um cliente consegue reservar pelo celular sem ajuda.
- Apenas horários compatíveis com as regras vigentes são exibidos.
- Reservas sobrepostas são impedidas inclusive sob concorrência.
- Edmar consegue configurar e bloquear a própria agenda.
- Reservas recebidas pelo WhatsApp podem ser registradas manualmente.
- Cancelamento e remarcação mantêm disponibilidade e histórico consistentes.
- Mudanças posteriores em serviços não alteram dados históricos.
- A agenda exibida corresponde aos registros do sistema.

### 11.2 Sinais de sucesso no piloto

- redução de perguntas repetidas sobre disponibilidade;
- presença de reservas concluídas sem conversa prévia;
- uso recorrente do painel por Edmar;
- ausência de double booking;
- baixa necessidade de suporte para tarefas rotineiras;
- continuidade voluntária do uso após o período inicial;
- feedback de que o sistema economiza tempo ou reduz erros.

Metas numéricas serão definidas após medir a linha de base do negócio.

## 12. Escopo candidato do MVP

### 12.1 Experiência pública

- visualizar serviços ativos;
- selecionar serviço e data;
- visualizar horários disponíveis;
- informar nome e WhatsApp;
- confirmar a reserva;
- visualizar confirmação e acesso seguro ao agendamento;
- consultar, cancelar e remarcar conforme regras vigentes.

### 12.2 Área administrativa

- autenticação do barbeiro;
- configuração inicial obrigatória;
- gestão de serviços;
- gestão da jornada semanal, intervalos, buffers, folgas, bloqueios e exceções;
- configuração de antecedência e cancelamento;
- agenda diária e semanal;
- criação manual de agendamento;
- consulta e gestão de agendamentos;
- registro de concluído, cancelado e no-show;
- consulta básica de clientes e histórico;
- visão operacional simples do dia.

### 12.3 Capacidades transversais

- validação de entradas;
- tratamento claro de erros e estados vazios;
- prevenção de sobreposição;
- preservação de snapshots históricos relevantes;
- proteção de rotas e operações administrativas;
- experiência responsiva e acessível em nível razoável;
- observabilidade mínima dos fluxos críticos.

## 13. Fora do MVP

- integração oficial e mensagens automáticas pelo WhatsApp;
- lembretes automáticos;
- lista de espera e aviso automático de vaga;
- pagamento, sinal ou PIX;
- fidelidade;
- múltiplos barbeiros;
- múltiplas unidades;
- múltiplos negócios e gestão de tenants;
- onboarding público de negócios, planos, billing e marketplace;
- analytics avançado;
- marketing automatizado;
- promoções avançadas;
- aplicativo nativo;
- microserviços, filas, caches ou infraestrutura distribuída sem necessidade demonstrada.

Promoções simples poderão ser avaliadas somente depois que o núcleo estiver funcionando e não são requisito do primeiro lançamento.

## 14. Checkpoint da FASE 0

A FASE 0 está formalmente aprovada com as seguintes ressalvas conscientes:

1. a validação será feita predominantemente por uso real, não por entrevista extensa;
2. valores operacionais variáveis serão configuráveis;
3. configurações essenciais deverão ser confirmadas antes da publicação da agenda;
4. hipóteses da Seção 5 permanecem abertas;
5. decisões adiadas da Seção 8 não devem ser incorporadas silenciosamente;
6. qualquer expansão deverá passar por priorização explícita.

**Resultado:** autorizado o início da FASE 1 — Product Requirements.
