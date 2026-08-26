# BARBER_UX_SPEC_v1

## Controle do documento

| Campo | Valor |
|---|---|
| Produto | Barber SaaS |
| Cliente inicial | Edmar, barbeiro autônomo |
| Fase | FASE 2 — UX |
| Versão | 1.0 |
| Data | 21 de agosto de 2026 |
| Status | **APROVADO — changeset de produto consolidado** |
| Aprovação | 22 de agosto de 2026 — preparação para a FASE 3 autorizada |
| Fontes | BARBER_PRODUCT_DISCOVERY_v1 e BARBER_PRD_v1 — aprovados |

## 0. Escopo desta especificação

Este documento transforma os requisitos aprovados em experiência de usuário: arquitetura de informação, fluxos, telas, estados, comportamento mobile, microcopy e wireframes low-fidelity.

Não define banco de dados, APIs, bibliotecas, componentes React, infraestrutura, algoritmo de disponibilidade ou mecanismo de autenticação/token. Necessidades técnicas descobertas são encaminhadas à FASE 3 sem serem decididas aqui.

### Convenções

- **P0:** necessário para o ciclo mínimo funcionar e ser demonstrável.
- **P1:** necessário para completar o MVP aprovado.
- **P2:** útil após o piloto; não bloqueia o MVP.
- **Ação destrutiva:** cancela, encerra ou altera de forma relevante um registro; nunca ocorre por toque único acidental.
- **Agenda publicada:** configuração essencial confirmada e fluxo público liberado.
- **Agenda não publicada:** fluxo público de reserva bloqueado, com orientação administrativa clara.

## 1. Princípios de UX

1. **Uma decisão por etapa no fluxo público.** Serviço, data, horário, dados e revisão são apresentados em sequência curta.
2. **Mobile-first real.** Ações essenciais cabem em telas pequenas, têm área de toque adequada e não exigem precisão excessiva.
3. **Estado sempre explícito.** O usuário deve saber o que está selecionado, o que está carregando, o que deu certo e o que precisa corrigir.
4. **Confiabilidade antes de velocidade aparente.** A interface nunca confirma uma reserva antes da validação final.
5. **Preservação de esforço.** Erros e conflitos mantêm serviço, data e dados já preenchidos sempre que ainda forem válidos.
6. **Linguagem do negócio.** Usar “horário”, “agendamento”, “folga” e “bloqueio”; evitar termos como slot, snapshot, token, constraint ou transação.
7. **Sem dependência exclusiva de cor.** Status combinam texto, ícone, ordem visual e, como reforço, cor.
8. **Ações perigosas exigem intenção.** Cancelar, concluir e marcar no-show exigem confirmação com contexto.
9. **Configuração progressiva.** O administrador vê apenas o necessário para publicar a agenda; ajustes avançados do próprio MVP ficam organizados depois.
10. **Sem defaults comerciais silenciosos.** Campos essenciais mostram pendência até serem confirmados.
11. **Privacidade por omissão.** A experiência pública revela apenas o necessário e nunca explica por que um horário está indisponível.
12. **Poucos caminhos, saídas claras.** Navegação deve favorecer concluir a tarefa atual e sempre permitir voltar sem perder dados válidos.
13. **Exceções humanas.** Conflitos de configuração são explicados em frases e com indicação de como corrigir.
14. **Piloto antes de expansão.** Nenhuma tela de equipe, unidade, marketing, pagamento, fidelidade ou analytics avançado.

## 2. Arquitetura de informação

### 2.1 Área pública

| Entrada pública | Estrutura |
|---|---|
| Agendar | Serviço → Data → Horário → Seus dados → Revisão → Confirmação |
| Gerenciar agendamento | Detalhes → Cancelar ou Remarcar |
| Remarcar | Nova data → Novo horário → Revisão → Confirmação |

Não haverá menu público complexo. O topo mostra identidade do negócio e, durante a reserva, um progresso curto. O rodapé contém apenas informações essenciais e aviso de privacidade resumido.

### 2.2 Área administrativa

Navegação principal mobile recomendada:

| Destino | Função |
|---|---|
| Hoje | Visão operacional e próximos atendimentos |
| Agenda | Dia/semana e acesso a bloqueios/agendamento manual |
| Clientes | Busca e histórico básico |
| Menu | Serviços, disponibilidade, políticas, status da agenda e sair |

“Novo agendamento” aparece como ação destacada em Hoje e Agenda, sem ocupar um quinto item permanente de navegação.

No desktop, a mesma estrutura pode migrar para navegação lateral, sem criar novos destinos.

### 2.3 Organização das configurações

Para evitar um painel excessivo, configurações ficam em cinco grupos simples, sem criar um novo nível de navegação:

1. **Perfil do negócio:** nome público, descrição, contato, localização e timezone.
2. **Serviços:** nome, descrição, preço, duração e atividade.
3. **Horários padrão:** jornada semanal, faixas e intervalos.
4. **Ajustes de disponibilidade:** buffer, antecedência e cancelamento.
5. **Datas especiais:** folgas, bloqueios e horários excepcionais.

## 3. Mapa completo de telas

### 3.1 Público

| ID | Tela | Prioridade |
|---|---|---:|
| PUB-001 | Escolher serviço / página pública | P0 |
| PUB-002 | Escolher data | P0 |
| PUB-003 | Escolher horário | P0 |
| PUB-004 | Informar nome e WhatsApp | P0 |
| PUB-005 | Revisar reserva | P0 |
| PUB-006 | Reserva confirmada | P0 |
| PUB-007 | Indisponibilidade ou agenda não publicada | P0 |
| PUB-008 | Gerenciar agendamento | P1 |
| PUB-009 | Confirmar cancelamento | P1 |
| PUB-010 | Agendamento cancelado | P1 |
| PUB-011 | Escolher nova data e horário | P1 |
| PUB-012 | Revisar remarcação | P1 |
| PUB-013 | Remarcação confirmada | P1 |
| PUB-014 | Link inválido ou indisponível | P1 |

### 3.2 Administrativo

| ID | Tela | Prioridade |
|---|---|---:|
| ADM-001 | Login | P0 |
| ADM-002 | Checklist de configuração inicial | P0 |
| ADM-003 | Perfil do negócio e timezone | P0 |
| ADM-004 | Dashboard / Hoje | P0 |
| ADM-005 | Agenda diária | P0 |
| ADM-006 | Agenda semanal mobile | P1 |
| ADM-007 | Lista de serviços | P0 |
| ADM-008 | Criar serviço | P0 |
| ADM-009 | Editar serviço | P1 |
| ADM-010 | Horários semanais | P0 |
| ADM-011 | Editar faixas e intervalos do dia | P0 |
| ADM-012 | Buffer entre atendimentos | P1 |
| ADM-013 | Datas especiais | P0 |
| ADM-014 | Criar folga | P1 |
| ADM-015 | Criar bloqueio | P0 |
| ADM-016 | Criar exceção de data | P1 |
| ADM-017 | Política de antecedência | P0 |
| ADM-018 | Política de cancelamento | P0 |
| ADM-019 | Agendamento manual — serviço | P0 |
| ADM-020 | Agendamento manual — data e horário | P0 |
| ADM-021 | Agendamento manual — cliente e revisão | P0 |
| ADM-022 | Detalhes do agendamento | P0 |
| ADM-023 | Cancelar agendamento | P1 |
| ADM-024 | Alterar estado do atendimento | P0 |
| ADM-025 | Clientes | P1 |
| ADM-026 | Histórico do cliente | P1 |
| ADM-027 | Conflito de configuração | P1 |
| ADM-028 | Recuperação de acesso | P1 |

### 3.3 P2

Nenhum frame P2 é necessário para representar o escopo aprovado. Filtros avançados, gráficos, exportações, marketing, pagamentos e gestão multiusuário ficam fora deste inventário. Essa ausência é deliberada para evitar crescimento artificial do MVP.

## 4. Fluxo público principal

1. PUB-001 — Serviço.
2. PUB-002 — Data.
3. PUB-003 — Horário.
4. PUB-004 — Dados.
5. PUB-005 — Revisão e processamento.
6. PUB-006 — Confirmação.

### Regras de comportamento

- O progresso mostra “Serviço”, “Data”, “Horário”, “Dados” e “Revisão”, destacando a etapa atual sem parecer um formulário longo.
- Voltar preserva escolhas válidas.
- Trocar o serviço invalida data/horário somente se necessário; a interface avisa antes de limpar.
- Trocar a data limpa apenas o horário.
- O preço e a duração aparecem no serviço e na revisão.
- O botão primário fica próximo ao polegar e descreve a ação: “Escolher data”, “Continuar” ou “Confirmar agendamento”.
- Durante a confirmação, o botão fica indisponível e mostra “Confirmando…”. Repetições não criam nova confirmação visual.
- Sucesso só aparece após confirmação real.

### Exceções

- **Horário ocupado durante o fluxo:** retornar a PUB-003 com “Esse horário acabou de ser reservado. Escolha outro horário.” Preservar serviço, data, nome e WhatsApp.
- **Serviço inativado durante o fluxo:** retornar a PUB-001 com “Este serviço não está disponível no momento. Escolha outro serviço.” Preservar nome e WhatsApp localmente durante a sessão, se apropriado.
- **Data sem horários:** manter a data visível e oferecer “Escolher outra data”.
- **Agenda incompleta/não publicada:** mostrar PUB-007 sem catálogo parcial enganoso.
- **Erro de rede:** informar que a reserva não foi confirmada e oferecer tentativa segura. Nunca exibir sucesso incerto.

## 5. Fluxos administrativos

### 5.1 Entrada e operação diária

1. ADM-001 — Login.
2. ADM-002 — Checklist, se incompleto; ou ADM-004 — Hoje, se publicado.
3. ADM-005/006 — Agenda.
4. ADM-022 — Detalhes.
5. ADM-024 — Atualizar estado; ou ADM-023 — Cancelar.

### 5.2 Configuração

| Item do checklist | Destino |
|---|---|
| Negócio: nome público e timezone | ADM-003 |
| Serviços | ADM-007/008 |
| Horários | ADM-010/011 |
| Antecedência | ADM-017 |
| Cancelamento | ADM-018 |

O checklist aceita conclusão em etapas. Ao retornar, Edmar vê o que falta e o efeito: “A agenda ainda não recebe reservas”.

### 5.3 Disponibilidade excepcional

- ADM-014 — Folga.
- ADM-015 — Bloqueio.
- ADM-016 — Horário especial.

### 5.4 Agendamento manual

1. Hoje ou Agenda.
2. ADM-019 — Serviço.
3. ADM-020 — Data e horário.
4. ADM-021 — Cliente e revisão.
5. ADM-022 — Detalhes.

## 6. Onboarding e publicação da agenda

### Checklist essencial

| Item | Condição visual de conclusão |
|---|---|
| Negócio | nome público e timezone confirmados explicitamente |
| Serviço | ao menos um serviço ativo com nome, preço e duração válidos |
| Horário semanal | ao menos uma faixa válida |
| Antecedência | mínimo e máximo válidos e confirmados |
| Cancelamento | política inicial confirmada |

### Estados do banner

- **AGENDA NÃO PUBLICADA:** destaque persistente no topo do painel; texto “Conclua os itens obrigatórios para começar a receber reservas.”; ação “Continuar configuração”.
- **AGENDA PRONTA PARA RESERVAS:** confirmação positiva; ação “Ver página pública” e possibilidade de copiar o link.
- **PUBLICAÇÃO INTERROMPIDA:** se configuração essencial deixar de ser válida, o painel explica o item e bloqueia novas reservas públicas sem afetar agendamentos existentes.

### Comportamento recomendado

- Não usar “passo 1 de 12”. Mostrar cinco itens essenciais e progresso real.
- Cada item abre diretamente sua tela.
- Salvar um item retorna ao checklist com feedback breve.
- Não publicar automaticamente sem tela de revisão do checklist; a publicação é consequência visível da conclusão/validação, não uma regra escondida.

## 7. Fluxo de reserva

### Entrada

O link público abre diretamente em serviços. O cabeçalho e a confirmação usam o nome público e somente as informações opcionais configuradas no perfil do `Business`. Não exigir cadastro, login ou escolha de profissional/unidade.

### Seleção

- Cartões de serviço apresentam nome, duração e preço.
- Descrição é secundária e pode expandir quando longa.
- Datas aparecem em formato local, com dia da semana.
- Horários aparecem como botões com área de toque ampla.
- Horários indisponíveis não precisam aparecer. Se forem mostrados para contexto, ficam desabilitados com rótulo “Indisponível”, sem motivo.

### Dados

- Nome completo ou nome pelo qual será chamado.
- WhatsApp com código de país/DDD guiado, sem exigir conhecimentos técnicos.
- Texto mínimo: “Usaremos seu nome e WhatsApp para identificar e gerenciar este agendamento.”
- Erros aparecem junto ao campo e também em resumo quando necessário.

### Revisão

Exibir em ordem: serviço, data, horário, duração, preço, nome e WhatsApp. Cada grupo possui “Alterar”. Mostrar regra de cancelamento resumida antes da confirmação.

### Resultado

- Ícone e título “Agendamento confirmado”.
- Data e horário em maior destaque.
- Serviço e valor abaixo.
- Ação “Gerenciar agendamento”.
- Orientação: “Guarde este link. Ele permite visualizar, cancelar ou remarcar seu horário.”
- Não incentivar compartilhamento do link.

## 8. Fluxo de cancelamento

1. PUB-008 — Gerenciar.
2. Ação “Cancelar”.
3. PUB-009 — Confirmar cancelamento e processar.
4. PUB-010 — Cancelado.

### Quando permitido

- Mostrar “Você pode cancelar até [data e hora]”.
- A confirmação repete serviço, data e horário.
- Botão destrutivo: “Sim, cancelar agendamento”.
- Ação segura: “Manter agendamento”.

### Quando proibido

- Não esconder o motivo útil: “O prazo para cancelamento online terminou.”
- Não inventar canal de suporte; se um contato do negócio estiver configurado e aprovado, poderá ser oferecido em evolução.
- Estados concluído, cancelado ou no-show mostram status e não exibem ação de cancelamento.

### Falha

- Manter o agendamento como confirmado na interface até existir sucesso.
- Mensagem: “Não foi possível cancelar agora. Seu agendamento continua confirmado.”

## 9. Fluxo de remarcação

1. PUB-008 — Gerenciar.
2. Ação “Remarcar”.
3. PUB-011 — Nova data e horário.
4. PUB-012 — Revisão e processamento.
5. PUB-013 — Remarcação confirmada.

### Proteção do horário atual

Em PUB-011 e PUB-012, exibir uma nota persistente: “Seu horário atual continua reservado até a nova confirmação.”

### Conflito ou erro

- Se o novo horário for ocupado, voltar à seleção com: “Esse horário acabou de ser reservado. Seu agendamento atual continua confirmado.”
- Se houver erro de rede: “Não foi possível remarcar. Seu horário atual não foi alterado.”
- Nunca mostrar o horário antigo como cancelado antes do sucesso.

### Ponto de decisão do preço

PUB-012 precisa comparar o agendamento atual e o novo. O PRD não decidiu se remarcação preserva o preço original ou aplica o preço vigente. Até essa decisão, o wireframe marca o valor como **área dependente de decisão de produto** e não promete nenhum comportamento.

## 10. Fluxo de criação manual

- Mesma lógica progressiva da reserva pública, com linguagem administrativa.
- Origem “Adicionado manualmente” aparece no detalhe.
- Edmar escolhe um serviço ativo, data e horário, depois informa cliente.
- O sistema reaproveita um cliente encontrado pelo WhatsApp sem expor deduplicação complexa.
- A revisão deixa explícito que o pagamento não foi registrado.
- Em caso de conflito: “Este período não está mais disponível. Nenhum agendamento foi criado.”
- A UX não oferece override de jornada até decisão de produto. Horários fora da disponibilidade podem aparecer como questão aberta, nunca como ação silenciosa.

## 11. Fluxo de gestão de serviços

### Lista

- Serviços ativos primeiro; inativos em seção recolhida ou filtro simples.
- Cada item mostra nome, duração, preço e estado textual.
- Ação principal “Novo serviço”.

### Criação/edição

- Campos: nome, descrição opcional, preço, duração e ativo/inativo.
- Validação próxima ao campo.
- Ao editar, nota fixa: “As alterações valem para novas reservas. Agendamentos existentes mantêm os dados originais.”
- Inativar exige confirmação contextual: “O serviço deixará de aparecer para novas reservas. O histórico será mantido.”
- Se inativar o último serviço ativo, avisar que a agenda pública deixará de aceitar reservas.

## 12. Fluxo de disponibilidade

### Horário semanal

- Lista vertical de segunda a domingo.
- Cada dia mostra “Não trabalha” ou as faixas configuradas.
- Editar um dia abre tela focada, com “Adicionar faixa” e “Adicionar intervalo”.
- Copiar horários para outros dias pode ser P1 dentro da mesma tela, pois reduz trabalho sem criar nova regra.

### Buffer

- Campo simples em minutos com opção explícita “Sem intervalo entre atendimentos”.
- Texto humano: “Esse tempo ficará indisponível entre um atendimento e o próximo.”
- Se a diferença entre buffer antes/depois for necessária, registrar para produto; não expor dois campos ainda.

### Datas especiais

- Uma lista única organiza folga, bloqueio e horário especial por data.
- A criação começa perguntando “O que você quer fazer?” com três escolhas claras.
- Resumo antes de salvar mostra data, período e efeito esperado.
- Se houver conflito com reserva existente, abrir ADM-027; nunca cancelar automaticamente.

### Conflitos

Exemplo de mensagem: “Já existe um agendamento às 15:00 nesse período. Salvar esta alteração não pode remover esse atendimento automaticamente.” A ação dependerá de uma regra aprovada; a UX não inventa precedência ou resolução técnica.

## 13. Fluxo da agenda

### Hoje e agenda diária

A lista é cronológica e intercala compromissos, bloqueios e, quando útil, horários livres:

| Hora | Item | Status |
|---:|---|---|
| 09:00 | João — Corte | Reservado |
| 10:00 | Horário livre | Disponível |
| 11:00 | Pedro — Corte + Barba | Concluído |
| 12:00 | Bloqueio | Bloqueado |
| 13:00 | Lucas — Barba | No-show |

Cada linha combina:

- hora;
- nome ou tipo de indisponibilidade;
- serviço, quando houver;
- rótulo textual de status;
- ícone distinto;
- tratamento visual por cor apenas como reforço.

### Ações rápidas seguras

- Toque no item abre detalhes; não altera estado.
- No detalhe, ação “Atualizar atendimento” abre ADM-024.
- “Concluir” e “Marcar no-show” exigem confirmação com nome, serviço e horário.
- “Cancelar” fica visualmente separado e abre ADM-023.
- Horário livre pode oferecer “Novo agendamento neste horário”.

### Agenda semanal mobile

Evitar grade minúscula de sete colunas. Usar faixa horizontal de datas da semana com contagens e, abaixo, lista do dia selecionado. Um resumo textual informa dias sem atendimento ou com agenda cheia.

## 14. Fluxo de clientes

- Busca por nome ou WhatsApp.
- Lista mostra nome, telefone parcialmente protegido quando apropriado e data do último atendimento.
- Tela de cliente mostra apenas dados básicos e histórico cronológico.
- Não incluir segmentação, notas livres extensas, marketing ou score de no-show no MVP.
- Estado vazio orienta: “Os clientes aparecerão aqui após o primeiro agendamento.”

## 15. Modelo de estados de tela

### 15.1 Estados globais

| Estado | Comportamento |
|---|---|
| Default | conteúdo atual e ação principal clara |
| Loading inicial | skeleton proporcional à tela, sem trocar toda a estrutura |
| Ação em processamento | botão com verbo no gerúndio, demais ações conflitantes indisponíveis |
| Sucesso | confirmação próxima à ação e estado atualizado |
| Vazio | explica por que está vazio e oferece próximo passo quando houver |
| Erro de validação | junto ao campo, com foco no primeiro erro ao enviar |
| Erro de carregamento | mensagem contextual e “Tentar novamente” |
| Conflito | explica o que mudou e preserva dados ainda válidos |
| Indisponível | explica o limite sem revelar dados privados |
| Ação proibida | ação desabilitada ou ausente, com motivo visível quando útil |
| Offline/rede | não assume sucesso; mantém dados locais seguros para nova tentativa |

### 15.2 Preservação de dados

- Seleções e campos válidos permanecem após erro transitório.
- Dados sensíveis não são copiados para URLs, logs ou mensagens.
- Ao sair de formulário administrativo com alterações não salvas, mostrar confirmação “Descartar alterações?”.
- Recarregar após sucesso abre o estado persistido, não reenviará a ação automaticamente.

## 16. Estados vazios

| Contexto | Microcopy | Ação |
|---|---|---|
| Nenhum serviço | “Cadastre seu primeiro serviço para começar.” | Novo serviço |
| Nenhuma faixa semanal | “Defina pelo menos um horário de trabalho.” | Configurar horários |
| Dia sem atendimentos | “Nenhum atendimento neste dia.” | Novo agendamento |
| Nenhum horário público | “Não há horários disponíveis nesta data.” | Escolher outra data |
| Nenhuma data no horizonte | “Não encontramos datas disponíveis no período.” | Voltar aos serviços |
| Nenhuma data especial | “Nenhuma folga, bloqueio ou exceção cadastrada.” | Adicionar data especial |
| Nenhum cliente | “Os clientes aparecerão aqui após o primeiro agendamento.” | Ir para agenda |
| Histórico vazio | “Este cliente ainda não possui atendimentos registrados.” | Novo agendamento |

## 17. Loading states

- Serviços: skeleton de cartões, sem mostrar “nenhum serviço” antes da resposta.
- Datas: calendário/linha de datas em skeleton e texto “Buscando datas disponíveis…”.
- Horários: botões skeleton e “Atualizando horários…”.
- Confirmação: botão “Confirmando…” e mensagem para não fechar a página.
- Remarcação: “Confirmando novo horário… Seu horário atual continua reservado.”
- Agenda: skeleton de linhas cronológicas.
- Salvamento administrativo: “Salvando…” no botão; não fechar a tela até resultado.

Evitar spinners soltos sem contexto. Se a espera se prolongar, manter a mensagem e permitir recuperação segura quando tecnicamente possível.

## 18. Error states

### Categorias

1. **Correção pelo usuário:** campo inválido; explicar como corrigir.
2. **Conflito de negócio:** horário ocupado ou configuração incompatível; explicar o que mudou.
3. **Permissão/credencial:** link inválido ou sessão encerrada; não revelar detalhes sensíveis.
4. **Rede/serviço:** confirmar que a ação não foi considerada concluída quando não houver certeza.
5. **Configuração:** agenda incompleta; orientar o administrador ao item exato.

### Mensagens principais

- “Esse horário acabou de ser reservado. Escolha outro horário.”
- “Não foi possível confirmar. Seu agendamento ainda não foi criado.”
- “Não foi possível remarcar. Seu horário atual continua confirmado.”
- “Não foi possível cancelar. Seu agendamento continua confirmado.”
- “Sua sessão terminou. Entre novamente para continuar.”
- “Existe um agendamento nesse período. Revise a alteração antes de salvar.”

## 19. Conflict states

| Conflito | Resposta de UX |
|---|---|
| Horário público ocupado | voltar a horários, preservar demais dados e atualizar lista |
| Horário de remarcação ocupado | preservar horário atual, atualizar opções e permitir nova tentativa |
| Agendamento manual ocupado | não criar; manter dados do cliente e retornar à escolha de horário |
| Serviço inativado durante fluxo | retornar a serviços e manter dados não dependentes |
| Configuração afeta reserva existente | mostrar reservas afetadas em ADM-027; não cancelar |
| Antecedência mínima maior que máxima | erro próximo aos campos; impedir salvamento |
| Faixas sobrepostas ou inválidas | marcar faixas conflitantes e explicar correção |
| Sessão administrativa expirada durante edição | preservar formulário quando seguro e solicitar novo login |

## 20. Confirmações de ações destrutivas

### Padrão

- título com verbo e objeto: “Cancelar agendamento?”;
- contexto: cliente, serviço, data e horário;
- consequência em uma frase;
- ação segura primeiro na ordem de foco;
- botão destrutivo com texto específico;
- bloqueio de toques repetidos durante processamento.

### Ações que exigem confirmação

- cancelar agendamento;
- marcar como concluído;
- marcar como no-show;
- inativar serviço;
- descartar alterações não salvas;
- salvar configuração que conflita com reservas existentes, somente após definição de produto/arquitetura.

Remover serviço ou apagar histórico não fazem parte do MVP.

## 21. UX mobile

- Conteúdo principal em coluna única.
- Área de toque mínima recomendada de 44 × 44 px.
- Botão primário pode ficar fixo no rodapé quando não cobrir conteúdo nem teclado.
- Formulários usam teclado adequado ao tipo de entrada.
- Datas e horários não dependem de hover.
- A agenda usa lista cronológica; não exige zoom ou arraste de uma grade.
- Ações secundárias ficam em menu ou folha inferior, com rótulos completos.
- Modais grandes se tornam telas ou folhas inferiores em celular.
- O retorno do teclado não deve esconder erro ou botão principal.
- Cabeçalhos mostram título curto, voltar e status quando relevante.

## 22. Acessibilidade

- Ordem de foco acompanha a hierarquia visual.
- Mudança de etapa move foco para o título da nova tela.
- Erros são anunciados e ligados aos campos correspondentes.
- Loading e sucesso são comunicados a tecnologias assistivas sem roubar foco repetidamente.
- Botões de horário possuem nome acessível com data e hora completas.
- Status usam texto e ícone; cor é apenas reforço.
- Elementos desabilitados que precisam de explicação têm texto próximo, não tooltip exclusivo.
- Contraste de texto, controles e foco deve ser adequado.
- Tamanho de fonte suporta zoom sem cortar conteúdo.
- Datas não usam apenas números ambíguos: “sexta-feira, 21 de agosto”.
- A confirmação destrutiva não posiciona o foco inicialmente no botão destrutivo.

## 23. Microcopy importante

| Situação | Texto recomendado |
|---|---|
| Agenda não publicada | “Sua agenda ainda não recebe reservas.” |
| Agenda pronta | “Sua agenda está pronta para receber reservas.” |
| Privacidade no formulário | “Usaremos seu nome e WhatsApp para identificar e gerenciar este agendamento.” |
| Confirmando | “Confirmando seu horário…” |
| Reserva concluída | “Agendamento confirmado.” |
| Conflito de horário | “Esse horário acabou de ser reservado. Escolha outro horário.” |
| Data vazia | “Não há horários disponíveis nesta data.” |
| Remarcação em andamento | “Seu horário atual continua reservado até a nova confirmação.” |
| Remarcação falhou | “Não foi possível remarcar. Seu horário atual continua confirmado.” |
| Cancelamento permitido | “Você pode cancelar até [data e hora].” |
| Cancelamento bloqueado | “O prazo para cancelamento online terminou.” |
| Token inválido | “Não foi possível acessar este agendamento.” |
| Serviço histórico | “As alterações valem para novas reservas. Agendamentos existentes mantêm os dados originais.” |
| Configuração conflitante | “Existe um agendamento nesse período. Nada será cancelado automaticamente.” |
| Erro de rede | “Não foi possível concluir agora. Verifique sua conexão e tente novamente.” |

## 24. Casos extremos de UX

| Caso | Tratamento esperado |
|---|---|
| Duas pessoas confirmam o mesmo horário | uma confirma; a outra recebe conflito específico e volta à escolha atualizada |
| Cliente toca duas vezes em confirmar | mostrar um único processamento; nunca duas confirmações |
| Resposta demora e cliente recarrega | recuperar estado real quando possível; não reenviar silenciosamente |
| Serviço muda enquanto cliente agenda | validar na revisão; se indisponível, retornar ao serviço com explicação |
| Data fica sem horários após seleção | manter data e oferecer outra; preservar serviço e dados |
| Duração ultrapassa a jornada | horário não é oferecido; público não vê motivo interno |
| Buffer elimina último horário | horário não é oferecido; administrador vê efeito na configuração |
| Folga/bloqueio afeta reserva existente | mostrar conflito ao administrador; não cancelar automaticamente |
| Timezone muda com reservas existentes | mostrar impacto antes de salvar; decisão final vai para FASE 3 |
| Link inválido/adulterado | mensagem neutra, sem confirmar existência do agendamento |
| Link de estado terminal | mostrar dados permitidos e status, sem ações incompatíveis |
| Cancelamento repetido | manter estado cancelado; não exibir falha enganosa |
| Remarcação repetida/reload | mostrar estado real; não ocupar múltiplos horários |
| Remarcação falha após seleção | horário antigo continua visivelmente confirmado |
| Sessão expira em formulário admin | solicitar login e preservar alterações quando seguro |
| Dia totalmente bloqueado | agenda administrativa mostra “Dia bloqueado”; público não oferece horários |
| Duas faixas no mesmo dia | exibir separadas e impedir sobreposição inválida |
| Intervalo coincide com limite da faixa | mostrar resumo do tempo efetivamente atendido |
| Serviço inativado com reservas futuras | manter reservas e exibir aviso administrativo |
| Último serviço ativo é inativado | avisar que novas reservas ficarão indisponíveis |
| Agenda sem configuração essencial | público mostra indisponibilidade neutra; admin mostra checklist acionável |
| WhatsApp inválido | erro específico antes da revisão, sem apagar nome |
| Usuário fica offline na confirmação | não prometer sucesso; permitir verificar/tentar novamente com segurança |
| Administrador tenta estado terminal cedo | interface segue regra aprovada; restrição temporal fica pendente se necessária |

## 25. Questões abertas para produto

| ID | Questão | Alternativas | Recomendação de UX | Momento limite |
|---|---|---|---|---|
| QP-001 | Qual preço vale após remarcação? | original; vigente; escolha do admin | preservar o original no piloto reduz surpresa, mas requer aprovação | antes de validar PUB-012 |
| QP-002 | Existe limite de remarcações? | sem limite; limite configurável; apenas uma | iniciar configurável somente se houver regra real; senão, sem promessa na interface | antes do piloto |
| QP-003 | Admin pode agendar fora da jornada? | nunca; com alerta; sempre | permitir apenas com confirmação explícita pode refletir encaixes, mas não aprovar sem Edmar | antes de validar ADM-020 |
| QP-004 | Buffer é depois ou antes/depois? | somente depois; ambos | começar com um único “tempo entre atendimentos”, conceitualmente entre compromissos | antes da FASE 3 |
| QP-005 | Estado terminal pode ser corrigido? | não; janela curta; trilha administrativa | permitir correção auditável evita erro operacional, mas amplia regra | após observar piloto |
| QP-006 | Concluir/no-show exige que o horário tenha passado? | sim; não; com alerta | exigir contexto temporal ou alerta reduz erro | antes do piloto |
| QP-007 | Qual política inicial de cancelamento? | definida por Edmar | não escolher regra silenciosa | antes de publicar |
| QP-008 | O valor concluído aparece no dashboard? | não; “valor de serviços”; faturamento | omitir no P0; avaliar no piloto | após núcleo funcionar |
| QP-009 | WhatsApp precisa ser verificado? | sem verificação; confirmação manual; OTP | começar sem verificação, monitorando erros e abuso | antes do lançamento amplo |
| QP-010 | Qual contato mostrar após prazo de cancelamento? | nenhum; WhatsApp do negócio | só mostrar se configurado e aprovado | antes do piloto |

## 26. Questões para a FASE 3 — Architecture

Estas questões são requisitos técnicos decorrentes da UX, não decisões tomadas nesta fase:

1. Como garantir exclusão mútua/consistência quando duas confirmações disputam o mesmo período?
2. Como tornar confirmação, cancelamento e remarcação seguras contra repetição e retries?
3. Como realizar remarcação tudo-ou-nada preservando o horário anterior em falhas?
4. Como representar e preservar snapshots históricos de serviço, preço e duração?
5. Como modelar timezone operacional, datas locais e instantes inequívocos?
6. Qual precedência determinística entre jornada semanal, intervalo, bloqueio, folga e exceção de data?
7. Como detectar conflitos entre alterações de configuração e reservas existentes?
8. Como proteger, rotacionar, revogar e limitar tokens de gerenciamento?
9. Como evitar que tokens e dados pessoais apareçam em logs, analytics, cache ou referrers?
10. Como aplicar autenticação/autorização administrativa no servidor e recuperar sessão expirada?
11. Como preservar rascunhos com segurança após erro de rede ou sessão expirada?
12. Como obter o estado real após resposta incerta sem criar duplicidade?
13. Como aplicar limites contra abuso sem impedir clientes legítimos?
14. Como armazenar e consultar trilha mínima de mudanças sem criar um sistema de auditoria excessivo?
15. Como lidar com mudança de timezone quando já existem reservas futuras?
16. Como observar erros críticos respeitando privacidade?

## 27. Especificação de wireframes low-fidelity

Os frames descrevem estrutura e comportamento, não identidade visual final. “Topo”, “cartão”, “lista”, “folha inferior” e “botão” são componentes conceituais, não escolha de biblioteca.

### 27.1 Frames públicos

#### PUB-001 — Escolher serviço · P0

- **Objetivo:** iniciar a reserva e permitir a escolha de um serviço ativo.
- **Usuário:** cliente público.
- **Conteúdo principal:** nome público e informações públicas configuradas do negócio; título “Escolha um serviço”; cartões com nome, preço e duração; descrição opcional.
- **Hierarquia:** identidade → título/instrução → serviços → informação de privacidade/rodapé.
- **Componentes conceituais:** cabeçalho, lista de cartões selecionáveis, skeleton, aviso contextual.
- **Ação primária:** selecionar serviço e “Escolher data”.
- **Ações secundárias:** expandir descrição quando longa.
- **Estados:** loading; lista; nenhum serviço/agenda indisponível; serviço inativado durante seleção; erro de carregamento.
- **Entrada:** link público.
- **Saída:** PUB-002; PUB-007 em indisponibilidade.
- **Mobile:** cartões em coluna, área inteira selecionável, botão primário fixo somente após seleção.
- **Observações:** não mostrar escolha de profissional ou unidade; seleção única; não usar identidade hardcoded.

#### PUB-002 — Escolher data · P0

- **Objetivo:** selecionar uma data elegível para o serviço.
- **Usuário:** cliente público.
- **Conteúdo principal:** resumo compacto do serviço; título; sequência/calendário de datas dentro do horizonte; indicação de dias disponíveis.
- **Hierarquia:** voltar/progresso → serviço escolhido → datas → continuar.
- **Componentes conceituais:** progresso, resumo editável, seletor de datas, mensagem vazia.
- **Ação primária:** escolher data e avançar.
- **Ações secundárias:** alterar serviço; navegar pelo horizonte permitido.
- **Estados:** carregando; datas disponíveis; data sem disponibilidade; nenhuma data no horizonte; erro/retry.
- **Entrada:** PUB-001 ou retorno de PUB-003/005.
- **Saída:** PUB-003; PUB-001 ao alterar serviço; PUB-007 se agenda deixar de estar publicada.
- **Mobile:** datas com dia da semana e toque amplo; evitar calendário denso quando uma lista horizontal for mais clara.
- **Observações:** datas fora das regras não devem parecer selecionáveis.

#### PUB-003 — Escolher horário · P0

- **Objetivo:** escolher um início que comporte todo o atendimento.
- **Usuário:** cliente público.
- **Conteúdo principal:** serviço e data; grade/lista de horários disponíveis; aviso de atualização após conflito.
- **Hierarquia:** progresso → data → horários → continuar.
- **Componentes conceituais:** chips/botões de horário, skeleton, mensagem vazia, banner de conflito.
- **Ação primária:** selecionar horário e continuar.
- **Ações secundárias:** trocar data ou serviço.
- **Estados:** carregando; opções; sem horários; conflito atualizado; erro de rede; serviço indisponível.
- **Entrada:** PUB-002; retorno após conflito em PUB-005.
- **Saída:** PUB-004; PUB-002; PUB-001 se serviço invalidado.
- **Mobile:** botões em grade de duas ou três colunas sem reduzir área de toque; seleção textual e visual.
- **Observações:** não revelar se indisponibilidade é reserva, bloqueio, intervalo ou folga.

#### PUB-004 — Informar nome e WhatsApp · P0

- **Objetivo:** coletar somente os dados necessários para identificar e operar a reserva.
- **Usuário:** cliente público.
- **Conteúdo principal:** nome; WhatsApp; finalidade da coleta; resumo compacto do horário.
- **Hierarquia:** progresso → resumo → campos → privacidade → continuar.
- **Componentes conceituais:** campos rotulados, ajuda de formato, validação inline, botão.
- **Ação primária:** continuar para revisão.
- **Ações secundárias:** voltar ao horário.
- **Estados:** vazio; preenchido; validação; enviando validação; erro de rede não destrutivo.
- **Entrada:** PUB-003.
- **Saída:** PUB-005; PUB-003.
- **Mobile:** teclado apropriado para telefone; botão não coberto pelo teclado; preenchimento vertical.
- **Observações:** não pedir e-mail, senha, aniversário ou consentimentos não necessários.

#### PUB-005 — Revisar reserva · P0

- **Objetivo:** permitir conferência consciente antes da ação final.
- **Usuário:** cliente público.
- **Conteúdo principal:** serviço, preço, duração, data, horário, nome, WhatsApp e regra resumida de cancelamento.
- **Hierarquia:** título → data/horário em destaque → demais detalhes → política → confirmação.
- **Componentes conceituais:** grupos de resumo, links “Alterar”, botão primário e estado de processamento.
- **Ação primária:** “Confirmar agendamento”.
- **Ações secundárias:** alterar serviço, data/horário ou dados.
- **Estados:** default; confirmando; conflito de horário; serviço inativo; erro de rede; tentativa repetida.
- **Entrada:** PUB-004.
- **Saída:** PUB-006; PUB-003 em conflito; telas anteriores ao alterar.
- **Mobile:** resumo em cartões curtos; botão final destacado e específico.
- **Observações:** não usar linguagem de pagamento; preço é o valor do serviço.

#### PUB-006 — Reserva confirmada · P0

- **Objetivo:** provar sucesso e entregar o acesso seguro de gerenciamento.
- **Usuário:** cliente público.
- **Conteúdo principal:** nome público do negócio; status de sucesso; data/horário; serviço; preço; orientação sobre o link.
- **Hierarquia:** sucesso → compromisso → ação de gerenciamento → orientação.
- **Componentes conceituais:** ícone de sucesso, resumo, botão/link seguro.
- **Ação primária:** “Gerenciar agendamento”.
- **Ações secundárias:** copiar/guardar acesso somente se a forma for segura; voltar à página pública.
- **Estados:** sucesso; carregamento de recuperação do estado; falha ao abrir gerenciamento sem negar a reserva.
- **Entrada:** sucesso em PUB-005.
- **Saída:** PUB-008.
- **Mobile:** data e hora acima da dobra; ação acessível sem seleção manual de URL.
- **Observações:** não incentivar encaminhar o link; não prometer mensagem automática; mostrar apenas informações públicas configuradas.

#### PUB-007 — Indisponibilidade / agenda não publicada · P0

- **Objetivo:** evitar fluxo quebrado quando não há agenda pública utilizável.
- **Usuário:** cliente público.
- **Conteúdo principal:** nome público do negócio, quando disponível; mensagem neutra; possibilidade de tentar novamente.
- **Hierarquia:** identidade → título → explicação breve → ação segura.
- **Componentes conceituais:** estado vazio/indisponível, botão retry.
- **Ação primária:** “Tentar novamente”.
- **Ações secundárias:** nenhuma obrigatória.
- **Estados:** configuração incompleta; nenhum serviço ativo; nenhum horizonte disponível; erro temporário.
- **Entrada:** link público ou invalidação durante fluxo.
- **Saída:** PUB-001 se disponibilidade retornar.
- **Mobile:** tela curta, sem becos de navegação.
- **Observações:** não expor configurações internas do negócio nem usar identidade específica hardcoded.

#### PUB-008 — Gerenciar agendamento · P1

- **Objetivo:** consultar o compromisso e oferecer somente ações válidas.
- **Usuário:** portador do link seguro.
- **Conteúdo principal:** status; serviço; data/horário; preço histórico; nome; política; histórico resumido de remarcação quando relevante.
- **Hierarquia:** status → data/horário → detalhes → ações.
- **Componentes conceituais:** badge textual, cartão de detalhes, botões remarcar/cancelar, aviso de prazo.
- **Ação primária:** “Remarcar”, quando permitido.
- **Ações secundárias:** “Cancelar”, quando permitido.
- **Estados:** confirmado; cancelado; concluído; no-show; ação proibida; carregando; erro.
- **Entrada:** link seguro ou PUB-006.
- **Saída:** PUB-009 ou PUB-011.
- **Mobile:** status e horário visíveis imediatamente; ações terminalmente inválidas ausentes com explicação.
- **Observações:** nunca mostrar outros agendamentos do mesmo WhatsApp.

#### PUB-009 — Confirmar cancelamento · P1

- **Objetivo:** impedir cancelamento acidental e explicar consequência.
- **Usuário:** cliente autorizado pelo link.
- **Conteúdo principal:** pergunta; resumo do compromisso; prazo/política; consequência.
- **Hierarquia:** título destrutivo → contexto → consequência → ações.
- **Componentes conceituais:** tela/folha de confirmação, botão seguro, botão destrutivo.
- **Ação primária:** “Sim, cancelar agendamento”.
- **Ações secundárias:** “Manter agendamento”.
- **Estados:** default; cancelando; prazo expirado; já cancelado; erro preservando confirmado.
- **Entrada:** PUB-008.
- **Saída:** PUB-010 ou PUB-008.
- **Mobile:** ação segura recebe foco inicial; botões separados.
- **Observações:** não utilizar apenas “Sim/Não”.

#### PUB-010 — Agendamento cancelado · P1

- **Objetivo:** confirmar o cancelamento sem ambiguidade.
- **Usuário:** cliente autorizado.
- **Conteúdo principal:** status cancelado; serviço e horário anteriores; momento/resultado da ação.
- **Hierarquia:** status → referência do compromisso → encerramento.
- **Componentes conceituais:** confirmação, resumo somente leitura.
- **Ação primária:** nenhuma obrigatória.
- **Ações secundárias:** “Fazer novo agendamento”, retornando ao fluxo público.
- **Estados:** cancelado; carregando estado real após repetição.
- **Entrada:** sucesso em PUB-009 ou link de agendamento cancelado.
- **Saída:** PUB-001 se iniciar nova reserva.
- **Mobile:** status textual destacado.
- **Observações:** nova reserva é nova jornada, não “desfazer cancelamento”.

#### PUB-011 — Escolher nova data e horário · P1

- **Objetivo:** procurar novo horário sem perder o atual.
- **Usuário:** cliente autorizado.
- **Conteúdo principal:** compromisso atual; nota de proteção; datas; horários para o mesmo serviço.
- **Hierarquia:** horário atual → garantia de preservação → nova data → novo horário.
- **Componentes conceituais:** resumo atual, seletor de data, botões de horário, banners.
- **Ação primária:** continuar com novo horário.
- **Ações secundárias:** desistir e manter atual.
- **Estados:** carregando; opções; sem opções; conflito atualizado; política impede ação; erro de rede.
- **Entrada:** PUB-008.
- **Saída:** PUB-012 ou PUB-008.
- **Mobile:** nota de preservação permanece visível sem ocupar espaço excessivo.
- **Observações:** não permitir troca de serviço no MVP.

#### PUB-012 — Revisar remarcação · P1

- **Objetivo:** comparar atual e novo antes da confirmação.
- **Usuário:** cliente autorizado.
- **Conteúdo principal:** “De” e “Para”; serviço; política; área de preço pendente de QP-001.
- **Hierarquia:** atual → novo → consequência → confirmar.
- **Componentes conceituais:** cartões comparativos, aviso de preservação, botão.
- **Ação primária:** “Confirmar novo horário”.
- **Ações secundárias:** alterar novo horário; desistir.
- **Estados:** default; confirmando; conflito; erro preservando atual; preço/regra não resolvidos.
- **Entrada:** PUB-011.
- **Saída:** PUB-013; PUB-011 em conflito; PUB-008 ao desistir.
- **Mobile:** cartões empilhados, nunca comparação em colunas apertadas.
- **Observações:** não exibir regra de preço até decisão explícita.

#### PUB-013 — Remarcação confirmada · P1

- **Objetivo:** confirmar que somente o novo horário vale.
- **Usuário:** cliente autorizado.
- **Conteúdo principal:** sucesso; novo dia/horário; serviço; indicação de que o anterior foi substituído.
- **Hierarquia:** sucesso → novo compromisso → gerenciamento.
- **Componentes conceituais:** ícone de sucesso, resumo, botão.
- **Ação primária:** “Ver agendamento”.
- **Ações secundárias:** nenhuma obrigatória.
- **Estados:** sucesso; recuperação do estado após reload.
- **Entrada:** sucesso em PUB-012.
- **Saída:** PUB-008.
- **Mobile:** novo horário é o elemento mais destacado.
- **Observações:** não exibir sucesso se a operação estiver incerta.

#### PUB-014 — Link inválido ou indisponível · P1

- **Objetivo:** responder com segurança a acesso inválido, expirado ou não autorizado.
- **Usuário:** visitante com link inválido.
- **Conteúdo principal:** mensagem neutra e opção de iniciar nova reserva.
- **Hierarquia:** título → explicação mínima → ação.
- **Componentes conceituais:** estado de erro seguro.
- **Ação primária:** “Fazer novo agendamento”.
- **Ações secundárias:** tentar novamente em erro temporário distinguível sem vazamento.
- **Estados:** inválido; indisponível temporário; carregando.
- **Entrada:** URL de gerenciamento não válida.
- **Saída:** PUB-001.
- **Mobile:** conteúdo curto e legível.
- **Observações:** não confirmar se um agendamento específico existe.

### 27.2 Frames administrativos

#### ADM-001 — Login · P0

- **Objetivo:** permitir entrada segura e simples de Edmar.
- **Usuário:** administrador do negócio.
- **Conteúdo principal:** identificação do painel; credenciais; acesso à recuperação.
- **Hierarquia:** marca/título → campos → entrar → recuperar acesso.
- **Componentes conceituais:** campos rotulados, mostrar/ocultar senha quando aplicável, botão, alerta.
- **Ação primária:** “Entrar”.
- **Ações secundárias:** “Esqueci meu acesso”.
- **Estados:** vazio; validação; autenticando; credenciais inválidas; erro de rede; sessão já ativa.
- **Entrada:** rota administrativa ou sessão expirada.
- **Saída:** ADM-002 se configuração incompleta; ADM-004 se pronta; ADM-028.
- **Mobile:** formulário curto, teclado correto, botão acima do teclado.
- **Observações:** não revelar se uma conta específica existe.

#### ADM-002 — Checklist de configuração inicial · P0

- **Objetivo:** conduzir Edmar aos mínimos necessários para publicar a agenda.
- **Usuário:** administrador autenticado.
- **Conteúdo principal:** status “AGENDA NÃO PUBLICADA”; progresso; timezone, serviço, horários, antecedência e cancelamento.
- **Hierarquia:** status → explicação → itens pendentes/concluídos → próxima ação.
- **Componentes conceituais:** banner, lista checklist, ícones com texto, progresso, botão contextual.
- **Ação primária:** abrir o primeiro item pendente.
- **Ações secundárias:** abrir qualquer item; visualizar página pública indisponível.
- **Estados:** nenhum item; progresso parcial; pronto; item inválido após edição; erro de carregamento.
- **Entrada:** primeiro login, dashboard incompleto ou Menu.
- **Saída:** ADM-003/007/010/017/018; ADM-004 quando pronto.
- **Mobile:** lista vertical; uma ação por item; status fixo no topo.
- **Observações:** conclusão não usa defaults comerciais silenciosos.

#### ADM-003 — Perfil do negócio e timezone · P0

- **Objetivo:** configurar a identidade pública básica e confirmar a referência de data/hora do negócio.
- **Usuário:** administrador.
- **Conteúdo principal:** nome público obrigatório; descrição, contato e localização opcionais; timezone; horário local de exemplo; prévia simples das informações públicas; aviso de impacto.
- **Hierarquia:** título → nome público → informações opcionais → timezone → prévia/exemplo → salvar.
- **Componentes conceituais:** formulário, seletor de timezone pesquisável, prévia simples, texto de exemplo, alerta de reservas existentes.
- **Ação primária:** “Salvar perfil do negócio”.
- **Ações secundárias:** voltar sem salvar.
- **Estados:** não configurado; nome ausente; timezone ausente; válido; salvando; conflito com reservas existentes; erro.
- **Entrada:** ADM-002 ou Menu.
- **Saída:** ADM-002 ou ADM-027 se houver impacto.
- **Mobile:** busca e resultados em tela inteira; exemplo legível.
- **Observações:** nome público e timezone bloqueiam publicação quando ausentes; descrição, contato e localização não bloqueiam; não depender do timezone do aparelho; alteração posterior requer cuidado da FASE 3.

#### ADM-004 — Dashboard / Hoje · P0

- **Objetivo:** mostrar imediatamente o que Edmar precisa operar hoje.
- **Usuário:** administrador.
- **Conteúdo principal:** status da agenda; data; próximo atendimento; lista cronológica do dia; pendências; “Novo agendamento”.
- **Hierarquia:** status/publicação → próxima ação → agenda do dia → pendências.
- **Componentes conceituais:** banner, cartão próximo atendimento, timeline/lista, navegação inferior.
- **Ação primária:** abrir próximo atendimento ou criar agendamento, conforme contexto.
- **Ações secundárias:** ver agenda completa; continuar configuração.
- **Estados:** agenda não publicada; dia com itens; dia vazio; carregando; erro; offline.
- **Entrada:** login ou navegação “Hoje”.
- **Saída:** ADM-022, ADM-019, ADM-005, ADM-002.
- **Mobile:** sem gráficos; compromissos importantes acima da dobra; status textual.
- **Observações:** totais monetários ficam fora do P0.

#### ADM-005 — Agenda diária · P0

- **Objetivo:** visualizar e operar um dia completo com clareza.
- **Usuário:** administrador.
- **Conteúdo principal:** data; navegação entre dias; lista cronológica de reservado, concluído, cancelado, no-show, bloqueado e livre.
- **Hierarquia:** data → filtros mínimos/status → timeline → ação de novo agendamento.
- **Componentes conceituais:** seletor de data, linhas de agenda, rótulos, ícones, botão de criação.
- **Ação primária:** abrir item ou criar em horário livre.
- **Ações secundárias:** mudar dia; ir para semana.
- **Estados:** com agenda; vazio; dia bloqueado; carregando; erro; atualização após conflito.
- **Entrada:** Hoje, Agenda ou data da semana.
- **Saída:** ADM-022, ADM-019/020, ADM-006.
- **Mobile:** lista vertical; sem arraste para alterar horário; toque abre detalhe.
- **Observações:** cancelados podem aparecer recolhidos ou com menor ênfase, mas acessíveis.

#### ADM-006 — Agenda semanal mobile · P1

- **Objetivo:** dar visão semanal sem uma grade ilegível.
- **Usuário:** administrador.
- **Conteúdo principal:** semana; faixa horizontal de sete dias com contagens; lista do dia selecionado; resumos de dias.
- **Hierarquia:** semana → dias → detalhe do dia → ações.
- **Componentes conceituais:** navegação de semana, date strip, badges textuais, lista cronológica.
- **Ação primária:** selecionar um dia/abrir atendimento.
- **Ações secundárias:** semana anterior/próxima; novo agendamento.
- **Estados:** semana com agenda; vazia; carregando; erro; dia selecionado bloqueado.
- **Entrada:** ADM-005 ou navegação Agenda.
- **Saída:** ADM-005, ADM-022, ADM-019.
- **Mobile:** rolagem horizontal controlada apenas na faixa de datas; conteúdo do dia em coluna.
- **Observações:** desktop pode usar grade, mas a semântica permanece.

#### ADM-007 — Lista de serviços · P0

- **Objetivo:** consultar e administrar os serviços do negócio.
- **Usuário:** administrador.
- **Conteúdo principal:** ativos primeiro; inativos; nome, duração, preço e estado; status de configuração.
- **Hierarquia:** título/novo → ativos → inativos → aviso se nenhum ativo.
- **Componentes conceituais:** cartões/linhas, badge textual, filtro simples, empty state.
- **Ação primária:** “Novo serviço”.
- **Ações secundárias:** abrir/editar serviço; mostrar inativos.
- **Estados:** lista; vazio; sem ativo; carregando; erro.
- **Entrada:** ADM-002 ou Menu.
- **Saída:** ADM-008, ADM-009, ADM-002.
- **Mobile:** cartões compactos com toque na linha; preço e duração visíveis.
- **Observações:** não oferecer exclusão de histórico.

#### ADM-008 — Criar serviço · P0

- **Objetivo:** cadastrar um serviço válido para novas reservas.
- **Usuário:** administrador.
- **Conteúdo principal:** nome, descrição opcional, preço, duração e ativo.
- **Hierarquia:** título → campos essenciais → descrição → estado → salvar.
- **Componentes conceituais:** formulário, seletores numéricos adequados, validação, botão.
- **Ação primária:** “Criar serviço”.
- **Ações secundárias:** cancelar/voltar.
- **Estados:** vazio; preenchido; validação; salvando; sucesso; erro; alterações não salvas.
- **Entrada:** ADM-007 ou checklist.
- **Saída:** ADM-007 ou ADM-002.
- **Mobile:** campos em coluna; unidades visíveis (“min”, “R$”); botão protegido do teclado.
- **Observações:** combinações são cadastradas como serviço normal.

#### ADM-009 — Editar serviço · P1

- **Objetivo:** atualizar serviço sem criar expectativa de mudança histórica.
- **Usuário:** administrador.
- **Conteúdo principal:** dados atuais; aviso histórico; controle ativo/inativo.
- **Hierarquia:** aviso → campos → estado → salvar.
- **Componentes conceituais:** formulário preenchido, banner informativo, confirmação de inativação.
- **Ação primária:** “Salvar alterações”.
- **Ações secundárias:** inativar/ativar; descartar.
- **Estados:** default; alterado; validando; salvando; sucesso; erro; confirmação; último ativo.
- **Entrada:** ADM-007.
- **Saída:** ADM-007; ADM-027 se alteração gerar conflito futuro relevante.
- **Mobile:** aviso histórico visível antes do botão; ações destrutivas separadas.
- **Observações:** “Excluir” não existe no MVP.

#### ADM-010 — Horários semanais · P0

- **Objetivo:** mostrar e editar o padrão semanal de trabalho.
- **Usuário:** administrador.
- **Conteúdo principal:** segunda a domingo; trabalha/não trabalha; faixas resumidas; avisos de validade.
- **Hierarquia:** título/explicação → dias → salvar/status.
- **Componentes conceituais:** lista de dias, switch ou ação textual, resumos, alerta.
- **Ação primária:** abrir dia para editar.
- **Ações secundárias:** copiar configuração para outros dias; voltar.
- **Estados:** vazio; parcial; válido; faixas inválidas; salvando; erro.
- **Entrada:** ADM-002 ou Menu.
- **Saída:** ADM-011, ADM-002, ADM-027.
- **Mobile:** cada dia é uma linha/cartão; nada de grade semanal editável.
- **Observações:** ao menos uma faixa é essencial para publicação.

#### ADM-011 — Editar faixas e intervalos do dia · P0

- **Objetivo:** configurar uma ou mais faixas e pausas de um dia.
- **Usuário:** administrador.
- **Conteúdo principal:** estado trabalha/não trabalha; faixas início/fim; intervalos; resumo do dia.
- **Hierarquia:** dia → estado → faixas → intervalos → resumo → salvar.
- **Componentes conceituais:** pares de horário, adicionar/remover faixa, adicionar intervalo, validação.
- **Ação primária:** “Salvar horários”.
- **Ações secundárias:** adicionar faixa; adicionar intervalo; copiar para dias.
- **Estados:** não trabalha; uma/múltiplas faixas; sobreposição; início após fim; salvando; conflito.
- **Entrada:** ADM-010.
- **Saída:** ADM-010 ou ADM-027.
- **Mobile:** cada faixa em cartão; seleção de horário com rótulo claro; resumo textual.
- **Observações:** explicar conflito em linguagem humana; precedência técnica não é decidida aqui.

#### ADM-012 — Buffer entre atendimentos · P1

- **Objetivo:** definir o tempo indisponível entre compromissos.
- **Usuário:** administrador.
- **Conteúdo principal:** opção “Sem intervalo”; minutos; exemplo de efeito.
- **Hierarquia:** explicação → valor → exemplo → salvar.
- **Componentes conceituais:** escolha simples, campo/stepper, texto de exemplo.
- **Ação primária:** “Salvar intervalo”.
- **Ações secundárias:** restaurar “Sem intervalo”.
- **Estados:** sem buffer; configurado; inválido; salvando; conflito com agenda existente; erro.
- **Entrada:** Menu/Ajustes de disponibilidade.
- **Saída:** Menu ou ADM-027.
- **Mobile:** controle simples, sem gráficos de timeline.
- **Observações:** UX assume um único tempo “entre”; antes/depois é QP-004.

#### ADM-013 — Datas especiais · P0

- **Objetivo:** centralizar folgas, bloqueios e exceções por data.
- **Usuário:** administrador.
- **Conteúdo principal:** eventos futuros ordenados; tipo, data, período e descrição opcional; criação.
- **Hierarquia:** título/novo → próximos → passados recolhidos.
- **Componentes conceituais:** lista, filtros simples por tipo, empty state, botão.
- **Ação primária:** “Adicionar data especial”.
- **Ações secundárias:** abrir evento; filtrar.
- **Estados:** vazio; lista; carregando; erro; item em conflito.
- **Entrada:** Agenda ou Menu.
- **Saída:** ADM-014/015/016; ADM-027.
- **Mobile:** cartões por data; tipo sempre textual e com ícone.
- **Observações:** um único centro evita três menus separados.

#### ADM-014 — Criar folga · P1

- **Objetivo:** indisponibilizar um dia ou período de ausência planejada.
- **Usuário:** administrador.
- **Conteúdo principal:** data ou intervalo de datas; dia inteiro/período; motivo opcional; resumo.
- **Hierarquia:** tipo → datas/período → resumo → salvar.
- **Componentes conceituais:** seletor de data, escolha de duração, confirmação, alerta de conflito.
- **Ação primária:** “Salvar folga”.
- **Ações secundárias:** cancelar.
- **Estados:** vazio; válido; inválido; salvando; conflito com agendamentos; erro.
- **Entrada:** ADM-013.
- **Saída:** ADM-013 ou ADM-027.
- **Mobile:** seletores em tela/folha; resumo completo antes de salvar.
- **Observações:** não cancelar reservas automaticamente.

#### ADM-015 — Criar bloqueio · P0

- **Objetivo:** bloquear rapidamente um período ou dia inteiro.
- **Usuário:** administrador.
- **Conteúdo principal:** data; dia inteiro ou início/fim; motivo opcional; efeito.
- **Hierarquia:** data → período → motivo → resumo → salvar.
- **Componentes conceituais:** seletor, horários, toggle dia inteiro, alerta.
- **Ação primária:** “Bloquear período”.
- **Ações secundárias:** cancelar.
- **Estados:** default; válido; intervalo inválido; conflito; salvando; sucesso; erro.
- **Entrada:** ADM-013, ADM-005 ou horário livre.
- **Saída:** ADM-013/005 ou ADM-027.
- **Mobile:** ação rápida a partir da agenda; confirmação evita bloqueio acidental.
- **Observações:** bloqueio não revela motivo ao público.

#### ADM-016 — Criar exceção de data · P1

- **Objetivo:** substituir o horário padrão em uma data específica.
- **Usuário:** administrador.
- **Conteúdo principal:** data; indicação do padrão atual; novas faixas especiais; resumo da alteração.
- **Hierarquia:** data → padrão de referência → exceção → impacto → salvar.
- **Componentes conceituais:** seletor de data, faixas, comparação textual, alerta.
- **Ação primária:** “Salvar horário especial”.
- **Ações secundárias:** usar horário padrão; cancelar.
- **Estados:** vazio; válido; inválido; conflito com reserva; salvando; erro.
- **Entrada:** ADM-013.
- **Saída:** ADM-013 ou ADM-027.
- **Mobile:** padrão e exceção empilhados, não lado a lado.
- **Observações:** a precedência técnica da exceção deve ser formalizada na FASE 3.

#### ADM-017 — Política de antecedência · P0

- **Objetivo:** definir quão cedo e quão longe o cliente pode reservar.
- **Usuário:** administrador.
- **Conteúdo principal:** antecedência mínima; antecedência máxima; exemplos em linguagem natural.
- **Hierarquia:** explicação → mínimo → máximo → exemplo → salvar.
- **Componentes conceituais:** campos com unidades, ajuda contextual, validação cruzada.
- **Ação primária:** “Salvar antecedência”.
- **Ações secundárias:** voltar.
- **Estados:** não configurado; válido; mínimo maior que máximo; salvando; erro.
- **Entrada:** ADM-002 ou Menu.
- **Saída:** ADM-002/Menu.
- **Mobile:** unidades selecionáveis claras; exemplo atualizado após entrada.
- **Observações:** limites exatos não são inventados pela UX.

#### ADM-018 — Política de cancelamento · P0

- **Objetivo:** confirmar a regra de cancelamento exibida ao cliente.
- **Usuário:** administrador.
- **Conteúdo principal:** permitir ou não cancelamento online; prazo antes do atendimento; resumo da mensagem pública.
- **Hierarquia:** escolha → prazo → prévia da regra → salvar.
- **Componentes conceituais:** opção binária, campo de prazo/unidade, preview de microcopy.
- **Ação primária:** “Salvar política”.
- **Ações secundárias:** voltar.
- **Estados:** não configurado; permitido; não permitido; inválido; salvando; erro.
- **Entrada:** ADM-002 ou Menu.
- **Saída:** ADM-002/Menu.
- **Mobile:** uma regra por bloco; evitar linguagem jurídica.
- **Observações:** limite de remarcação não deve ser misturado até QP-002 ser decidido.

#### ADM-019 — Agendamento manual: serviço · P0

- **Objetivo:** iniciar rapidamente uma reserva recebida pelo WhatsApp.
- **Usuário:** administrador.
- **Conteúdo principal:** título; serviços ativos; preço e duração; origem manual implícita.
- **Hierarquia:** progresso → serviços → continuar.
- **Componentes conceituais:** cartões selecionáveis, busca se necessário, estado vazio.
- **Ação primária:** escolher serviço.
- **Ações secundárias:** cancelar fluxo.
- **Estados:** lista; nenhum serviço; carregando; serviço inativado; erro.
- **Entrada:** Hoje, Agenda ou horário livre.
- **Saída:** ADM-020; ADM-008 se nenhum serviço.
- **Mobile:** lista compacta; serviço pré-selecionado apenas se entrada contextual justificar e ficar visível.
- **Observações:** uma reserva, um serviço.

#### ADM-020 — Agendamento manual: data e horário · P0

- **Objetivo:** escolher período válido e impedir conflito.
- **Usuário:** administrador.
- **Conteúdo principal:** serviço; data; horários; indicação de ocupações relevantes sem expor detalhes desnecessários fora do contexto admin.
- **Hierarquia:** progresso → data → horário → continuar.
- **Componentes conceituais:** seletor de data, horários, conflito, link para agenda do dia.
- **Ação primária:** selecionar horário.
- **Ações secundárias:** trocar serviço; abrir agenda do dia.
- **Estados:** opções; sem horário; conflito; carregando; erro; fora da jornada não resolvido.
- **Entrada:** ADM-019 ou horário livre da agenda.
- **Saída:** ADM-021; ADM-019; ADM-005.
- **Mobile:** mesma linguagem de horários do público, com contexto administrativo adicional.
- **Observações:** não oferecer override silencioso; depende de QP-003.

#### ADM-021 — Agendamento manual: cliente e revisão · P0

- **Objetivo:** identificar cliente, revisar e confirmar sem duplicidade.
- **Usuário:** administrador.
- **Conteúdo principal:** nome; WhatsApp; possível cliente existente; serviço, data, horário, duração e preço.
- **Hierarquia:** progresso → dados → correspondência simples → resumo → confirmar.
- **Componentes conceituais:** campos, sugestão de cliente, cartão de revisão, botão processando.
- **Ação primária:** “Criar agendamento”.
- **Ações secundárias:** alterar horário/serviço; cancelar.
- **Estados:** vazio; cliente encontrado; validação; confirmando; conflito; erro; sucesso.
- **Entrada:** ADM-020.
- **Saída:** ADM-022; ADM-020 em conflito.
- **Mobile:** formulário e resumo empilhados; preservar dados em conflito.
- **Observações:** não registrar pagamento; origem manual aparece no detalhe.

#### ADM-022 — Detalhes do agendamento · P0

- **Objetivo:** servir como fonte operacional de um compromisso.
- **Usuário:** administrador.
- **Conteúdo principal:** status; data/horário; cliente; WhatsApp; serviço snapshot; duração; preço; origem; histórico resumido.
- **Hierarquia:** status/data → cliente → serviço → histórico → ações.
- **Componentes conceituais:** badges textuais, grupos de informação, botões, timeline de alterações.
- **Ação primária:** “Atualizar atendimento”, quando confirmado.
- **Ações secundárias:** cancelar; voltar à agenda.
- **Estados:** confirmado; concluído; cancelado; no-show; carregando; erro; registro histórico.
- **Entrada:** Hoje, agenda, cliente ou criação manual concluída.
- **Saída:** ADM-024, ADM-023, ADM-005/026.
- **Mobile:** telefone pode ser acionável sem expor o link público; ações terminais abaixo dos dados.
- **Observações:** mostrar preço como valor do serviço, não pagamento confirmado.

#### ADM-023 — Cancelar agendamento · P1

- **Objetivo:** registrar cancelamento administrativo com intenção clara.
- **Usuário:** administrador.
- **Conteúdo principal:** cliente, serviço, data/horário, consequência; motivo opcional apenas se aprovado como útil.
- **Hierarquia:** pergunta → contexto → consequência → ações.
- **Componentes conceituais:** tela/folha de confirmação, botão seguro e destrutivo.
- **Ação primária:** “Cancelar agendamento”.
- **Ações secundárias:** “Manter agendamento”.
- **Estados:** default; cancelando; já terminal; erro preservando estado; sucesso.
- **Entrada:** ADM-022.
- **Saída:** ADM-022/005.
- **Mobile:** foco inicial na ação segura; distância entre botões.
- **Observações:** origem do cancelamento será “administrador”.

#### ADM-024 — Alterar estado do atendimento · P0

- **Objetivo:** marcar resultado sem toque acidental.
- **Usuário:** administrador.
- **Conteúdo principal:** compromisso; escolhas “Concluído” e “No-show”; explicação de que são estados finais.
- **Hierarquia:** contexto → opções → confirmação da opção.
- **Componentes conceituais:** folha inferior/tela, cartões de ação, diálogo de confirmação.
- **Ação primária:** confirmar o estado escolhido.
- **Ações secundárias:** voltar sem alterar.
- **Estados:** seleção; confirmando; sucesso; estado já alterado; erro; ação temporalmente bloqueada se aprovada.
- **Entrada:** ADM-022 ou ação contextual segura na agenda.
- **Saída:** ADM-022/005.
- **Mobile:** nenhuma ação por swipe; rótulo e ícone em cada escolha.
- **Observações:** correção posterior e restrição temporal são QP-005/QP-006.

#### ADM-025 — Clientes · P1

- **Objetivo:** localizar cliente e acessar histórico básico.
- **Usuário:** administrador.
- **Conteúdo principal:** busca; lista por nome/WhatsApp; último atendimento; quantidade simples quando útil.
- **Hierarquia:** busca → resultados → empty state.
- **Componentes conceituais:** campo de busca, lista, skeleton, vazio.
- **Ação primária:** abrir cliente.
- **Ações secundárias:** iniciar agendamento a partir de um resultado, se não complicar o fluxo.
- **Estados:** vazio global; busca vazia; resultados; carregando; erro.
- **Entrada:** navegação Clientes.
- **Saída:** ADM-026, opcionalmente ADM-019.
- **Mobile:** busca fixa no topo ao rolar; telefone mostrado apenas no contexto autenticado.
- **Observações:** não criar CRM, tags, campanhas ou score.

#### ADM-026 — Histórico do cliente · P1

- **Objetivo:** consultar dados básicos e atendimentos anteriores/futuros.
- **Usuário:** administrador.
- **Conteúdo principal:** nome, WhatsApp, próximos agendamentos e histórico cronológico com status.
- **Hierarquia:** cliente → próximos → anteriores → ação de novo agendamento.
- **Componentes conceituais:** cabeçalho, listas, status textuais, empty state.
- **Ação primária:** abrir um agendamento.
- **Ações secundárias:** novo agendamento para cliente.
- **Estados:** com histórico; sem histórico; carregando; erro.
- **Entrada:** ADM-025 ou ADM-022.
- **Saída:** ADM-022, ADM-019.
- **Mobile:** cartões cronológicos; dados pessoais sem excesso.
- **Observações:** não permitir editar/apagar histórico sem regra aprovada.

#### ADM-027 — Conflito de configuração · P1

- **Objetivo:** explicar por que uma mudança afeta reservas e impedir perda silenciosa.
- **Usuário:** administrador.
- **Conteúdo principal:** mudança proposta; lista/resumo de compromissos afetados; explicação de que nada será cancelado automaticamente.
- **Hierarquia:** título → impacto → compromissos → alternativas.
- **Componentes conceituais:** alerta, cartões de conflito, ações voltar/revisar.
- **Ação primária:** “Revisar configuração”.
- **Ações secundárias:** abrir compromisso afetado; abandonar alteração.
- **Estados:** um/múltiplos conflitos; carregando; conflito mudou; erro.
- **Entrada:** ADM-003/009/011/012/014/015/016 ao detectar impacto.
- **Saída:** tela de origem ou ADM-022.
- **Mobile:** conflitos em lista; sem tabela larga.
- **Observações:** ação de “salvar mesmo assim” depende de decisão de produto e arquitetura, portanto não está especificada.

#### ADM-028 — Recuperação de acesso · P1

- **Objetivo:** permitir recuperação sem revelar existência de conta ou detalhes internos.
- **Usuário:** administrador.
- **Conteúdo principal:** instrução; identificador de recuperação conforme solução futura; confirmação neutra.
- **Hierarquia:** título → campo/instrução → enviar → voltar.
- **Componentes conceituais:** formulário curto, estado enviado, erro genérico seguro.
- **Ação primária:** “Continuar recuperação”.
- **Ações secundárias:** voltar ao login.
- **Estados:** vazio; enviando; resposta neutra; erro de rede; link/ação inválida.
- **Entrada:** ADM-001.
- **Saída:** ADM-001 ou etapa segura definida posteriormente.
- **Mobile:** fluxo curto e sem menus administrativos.
- **Observações:** mecanismo específico pertence à arquitetura; UX exige resposta que não enumere conta.

## 28. Inventário final e priorização

### 28.1 Totais

| Área | P0 | P1 | P2 | Total |
|---|---:|---:|---:|---:|
| Público | 7 | 7 | 0 | 14 |
| Administrativo | 18 | 10 | 0 | 28 |
| **Total** | **25** | **17** | **0** | **42** |

### 28.2 Frames P0 — ciclo mínimo

**Público:** PUB-001, PUB-002, PUB-003, PUB-004, PUB-005, PUB-006 e PUB-007.

**Administrativo:** ADM-001, ADM-002, ADM-003, ADM-004, ADM-005, ADM-007, ADM-008, ADM-010, ADM-011, ADM-013, ADM-015, ADM-017, ADM-018, ADM-019, ADM-020, ADM-021, ADM-022 e ADM-024.

### 28.3 Sequência recomendada de wireframing P0

1. ADM-002 — Checklist/configuração.
2. ADM-007/008 — Serviços.
3. ADM-010/011 — Horários.
4. ADM-004/005 — Hoje e agenda diária.
5. PUB-001 a PUB-006 — Reserva pública completa.
6. ADM-019 a ADM-022 — Reserva manual e detalhe.
7. ADM-024 — Resultado do atendimento.
8. PUB-007 — indisponibilidades e agenda não publicada.
9. ADM-003, ADM-013, ADM-015 e ADM-017 — demais configurações P0.

Essa sequência valida primeiro o ciclo configurar → reservar → operar, sem criar todas as telas antes de aprender com o fluxo central.

## 29. Critérios de aceitação da UX

A FASE 2 poderá ser aprovada quando:

1. A jornada pública completa tiver entrada, retorno, sucesso, erro e conflito especificados.
2. Cliente não precisar criar conta nem escolher profissional/unidade.
3. A confirmação final não gerar sucesso prematuro.
4. Conflito de horário preservar dados válidos e orientar nova escolha.
5. Cancelamento mostrar prazo, consequência, confirmação e estado final.
6. Remarcação comunicar que o horário atual permanece válido até o sucesso.
7. Falha na remarcação nunca sugerir que o horário antigo foi perdido.
8. Link inválido e estados terminais tiverem respostas seguras.
9. Onboarding diferenciar claramente agenda não publicada e pronta.
10. Todas as configurações essenciais estiverem representadas sem defaults silenciosos, incluindo nome público do negócio e timezone obrigatórios antes da publicação.
11. Edmar conseguir criar serviço, jornada e agendamento manual pelo celular.
12. Agenda diária distinguir todos os estados por texto/ícone, não somente cor.
13. Ações terminais exigirem confirmação e não dependerem de gestos acidentais.
14. Serviços editados preservarem expectativa de histórico.
15. Folga, bloqueio e exceção possuírem fluxos simples e conflitos explícitos.
16. O inventário cobrir requisitos aprovados sem telas de pós-MVP.
17. Estados loading, vazio, erro, conflito, indisponível e offline estiverem cobertos onde relevantes.
18. Microcopy evitar termos técnicos e explicar consequências.
19. Questões de produto e arquitetura estiverem separadas e não resolvidas silenciosamente.
20. Frames P0 formarem uma demonstração completa do ciclo mínimo de valor.

## 30. Auto-revisão de cobertura e consistência

### Cobertura confirmada

- Reserva pública: completa, incluindo corrida pelo horário e tentativa repetida.
- Gerenciamento por token: consulta, cancelamento, remarcação, estados terminais e link inválido.
- Onboarding: todas as configurações essenciais e publicação explícita.
- Serviços: criação, edição, inativação e preservação histórica comunicada.
- Disponibilidade: semana, múltiplas faixas, intervalos, buffer, folga, bloqueio e exceção.
- Agenda: hoje, dia, semana, todos os estados e ações rápidas seguras.
- Agendamento manual: serviço, data/horário, cliente, revisão e conflito.
- Operação: detalhe, cancelamento, concluído e no-show.
- Clientes: lista e histórico básico, sem virar CRM.
- Estados sistêmicos: loading, vazio, validação, rede, conflito, indisponibilidade e ação proibida.
- Mobile e acessibilidade: padrões transversais especificados.
- Neutralidade vertical: nenhum frame exige conceitos estruturais de barbearia, tatuagem ou outro segmento; Edmar permanece apenas como contexto do piloto.

### Ambiguidades preservadas, não inventadas

- preço após remarcação;
- limite de remarcações;
- override administrativo fora da jornada;
- semântica exata do buffer;
- correção e momento permitido de estados terminais;
- política comercial inicial de cancelamento;
- precedência técnica de disponibilidade;
- resolução técnica de conflitos com reservas existentes;
- mecanismo de recuperação de acesso e token.

### Ajustes encontrados na própria revisão

1. A contagem do inventário foi conferida: 42 frames, sendo 25 P0 e 17 P1.
2. “Agenda semanal” não usa grade desktop comprimida no celular; usa faixa de datas mais lista diária.
3. “Clientes” permanece P1 porque está aprovado no PRD, mas não bloqueia o ciclo mínimo.
4. “Dashboard” foi reduzido a visão operacional, sem gráficos ou faturamento presumido.
5. Recuperação de acesso foi incluída como P1 porque o PRD exige operação adequada ao lançamento, mas seu mecanismo ficou para arquitetura.
6. Nenhuma tela P2 foi criada; isso evita disfarçar ideias pós-MVP como compromisso de UX.

## 31. Checkpoint da FASE 2

O documento está completo para revisão de produto e wireframing low-fidelity. Sua aprovação encerra a FASE 2 e autoriza, somente em uma solicitação posterior explícita, o início da FASE 3 — Architecture.

**Status atual:** FASE 2 consolidada; preparação para a FASE 3 autorizada. A arquitetura ainda não foi produzida.
