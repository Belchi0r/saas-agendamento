# BARBER_PRD_v1

## Controle do documento

| Campo | Valor |
|---|---|
| Produto | Barber SaaS |
| Cliente inicial | Edmar, barbeiro autônomo |
| Fase | FASE 1 — Product Requirements |
| Versão | 1.0 |
| Data | 21 de agosto de 2026 |
| Status | **APROVADO — checkpoint de encerramento da FASE 1** |
| Aprovação | 21 de agosto de 2026 — autorização explícita para iniciar a FASE 2 |
| Fonte anterior | BARBER_PRODUCT_DISCOVERY_v1 |

## 1. Visão do produto

O Barber SaaS é uma aplicação web mobile-first que permite a clientes reservar serviços em horários realmente disponíveis, sem criar conta, e oferece ao administrador/profissional do negócio uma área administrativa para configurar e operar a agenda sem depender do desenvolvedor. Edmar e sua barbearia permanecem como piloto inicial.

O produto inicial será voltado a um único negócio, um administrador, um profissional operacional e uma unidade. Seu diferencial central será a confiabilidade do ciclo de disponibilidade e reserva, não a quantidade de funcionalidades.

## 2. Problema

O agendamento manual pelo WhatsApp exige conversas repetidas, dificulta a divulgação imediata de horários liberados, aumenta o risco de conflito e concentra no barbeiro tarefas operacionais que poderiam ser autônomas. Também não oferece uma fonte central e confiável para agenda e histórico.

## 3. Objetivos

### 3.1 Objetivos do MVP

- Permitir que um cliente reserve um serviço sem criar conta.
- Exibir somente horários válidos para o serviço escolhido.
- Evitar sobreposição mesmo quando houver tentativas simultâneas.
- Permitir que o barbeiro configure sua operação sem mudança de código.
- Centralizar agendamentos públicos e manuais.
- Permitir consulta, cancelamento e remarcação por acesso seguro.
- Preservar informações históricas relevantes.
- Fornecer uma experiência confiável em dispositivos móveis.
- Produzir evidências para orientar a evolução do produto.

### 3.2 Resultado esperado

Edmar deve conseguir operar uma agenda real pelo sistema, e pelo menos parte dos clientes deve conseguir reservar de forma autônoma com menos troca de mensagens.

## 4. Não objetivos

O MVP não pretende:

- processar ou comprovar pagamentos;
- substituir o WhatsApp como canal de relacionamento;
- atender múltiplos profissionais ou unidades;
- oferecer marketing automatizado;
- oferecer fidelidade, lista de espera ou promoções avançadas;
- funcionar como sistema contábil ou financeiro;
- fornecer analytics avançado;
- eliminar todos os agendamentos manuais;
- definir regras comerciais específicas do Edmar no código;
- antecipar necessidades de uma plataforma multiempresa ou de segmentos ainda não validados.

## 5. Usuários e permissões conceituais

### 5.1 Cliente não autenticado

Pode:

- consultar serviços ativos e horários públicos;
- criar um agendamento;
- usar o link seguro de um agendamento específico para consultá-lo, cancelá-lo ou remarcá-lo quando permitido.

Não pode:

- listar clientes ou agendamentos;
- consultar agendamentos sem a credencial de acesso correspondente;
- acessar configurações ou funções administrativas.

### 5.2 Administrador/profissional autenticado

Pode:

- configurar serviços, disponibilidade e políticas;
- consultar e administrar toda a agenda;
- criar agendamentos manualmente;
- alterar o estado operacional de atendimentos;
- consultar clientes e histórico dentro do escopo do MVP.

O produto deverá possuir apenas um administrador operacional no MVP, sem gestão de equipe ou papéis.

## 6. Jornadas principais

### J1 — Configuração inicial

1. Edmar entra na área administrativa.
2. Confirma timezone e dados operacionais essenciais.
3. Cadastra ao menos um serviço ativo com preço e duração.
4. Configura ao menos uma faixa de trabalho.
5. Revisa antecedência, cancelamento e parâmetros de disponibilidade.
6. O sistema informa se a agenda está pronta para receber reservas.

### J2 — Reserva pelo cliente

1. Cliente abre o link público.
2. Seleciona um serviço ativo.
3. Seleciona uma data elegível.
4. Escolhe um horário ainda disponível.
5. Informa nome e WhatsApp.
6. Revisa serviço, data, horário, duração e preço.
7. Confirma.
8. Recebe confirmação e link seguro de gerenciamento.

### J3 — Agendamento manual

1. Edmar acessa a agenda.
2. Escolhe serviço, data e horário.
3. Informa os dados do cliente.
4. O sistema verifica conflitos.
5. Edmar confirma e o período deixa de estar disponível.

### J4 — Cancelamento pelo cliente

1. Cliente abre o link seguro.
2. Visualiza o agendamento e a política aplicável.
3. Solicita cancelamento.
4. Confirma a ação.
5. O sistema registra o cancelamento e libera o período quando aplicável.

### J5 — Remarcação pelo cliente

1. Cliente abre o link seguro.
2. Solicita remarcação.
3. Escolhe uma nova data e um horário válido para o mesmo serviço.
4. Revisa e confirma.
5. A mudança somente é concluída se o novo horário puder ser reservado.
6. O sistema preserva o histórico da alteração e mantém um único horário ativo.

### J6 — Operação do atendimento

1. Edmar consulta a agenda diária ou semanal.
2. Abre um agendamento.
3. Após o horário, registra como concluído, cancelado ou no-show.
4. O sistema preserva o resultado no histórico.

## 7. Escopo do MVP

### 7.1 Público

- catálogo de serviços ativos;
- seleção de data e horário disponível;
- coleta de nome e WhatsApp;
- revisão e confirmação;
- página de confirmação;
- acesso seguro ao agendamento;
- cancelamento e remarcação conforme política.

### 7.2 Administrativo

- login e sessão do administrador;
- gestão da identidade pública básica do negócio;
- configuração inicial e indicação de pendências;
- gestão de serviços;
- gestão da disponibilidade recorrente e excepcional;
- agenda diária e semanal;
- criação manual de agendamento;
- detalhes e histórico de agendamento;
- estados concluído, cancelado e no-show;
- listagem e consulta básica de clientes;
- visão operacional simples do dia.

### 7.3 Explicitamente não incluído

- cobrança, confirmação de pagamento ou conciliação;
- envio automático de mensagens;
- relatórios e analytics avançados;
- campanhas e promoções;
- múltiplos profissionais ou endereços.

## 8. Requisitos funcionais

### Serviços

- **RF-001** — O administrador deve poder cadastrar um serviço com nome, descrição opcional, preço, duração e situação ativo/inativo.
- **RF-002** — O administrador deve poder editar e inativar serviços.
- **RF-003** — Somente serviços ativos devem aparecer no fluxo de nova reserva pública.
- **RF-004** — Inativar ou editar um serviço não deve apagar nem alterar os dados históricos de agendamentos existentes.

### Configuração e disponibilidade

- **RF-005** — O administrador deve poder configurar o timezone operacional da unidade.
- **RF-006** — O administrador deve poder configurar uma ou mais faixas de trabalho para cada dia da semana.
- **RF-007** — O administrador deve poder configurar intervalos recorrentes.
- **RF-008** — O administrador deve poder configurar um tempo entre atendimentos.
- **RF-009** — O administrador deve poder cadastrar folgas, bloqueios temporários e exceções de datas.
- **RF-010** — O administrador deve poder configurar antecedência mínima e máxima para novas reservas.
- **RF-011** — O administrador deve poder configurar regras simples de cancelamento.
- **RF-012** — O sistema deve indicar claramente configurações obrigatórias ausentes.
- **RF-013** — O sistema não deve aceitar reservas públicas enquanto a configuração essencial estiver incompleta.

### Fluxo público

- **RF-014** — O cliente deve poder visualizar os serviços ativos disponíveis para reserva.
- **RF-015** — O cliente deve poder escolher um serviço por agendamento.
- **RF-016** — O cliente deve poder visualizar datas elegíveis dentro do horizonte configurado.
- **RF-017** — O cliente deve visualizar apenas horários compatíveis com duração, buffer, disponibilidade e ocupações existentes.
- **RF-018** — O cliente deve informar nome e WhatsApp antes de confirmar.
- **RF-019** — O sistema deve exibir um resumo antes da confirmação.
- **RF-020** — Ao confirmar, o sistema deve revalidar a disponibilidade e criar no máximo uma reserva válida para o período.
- **RF-021** — Após sucesso, o sistema deve mostrar confirmação inequívoca e fornecer acesso seguro ao agendamento.
- **RF-022** — Se o horário deixar de estar disponível durante o fluxo, o sistema deve informar o conflito e permitir escolher outro horário sem alegar sucesso.

### Autogerenciamento pelo cliente

- **RF-023** — O portador de um link/token válido deve poder visualizar somente o agendamento correspondente.
- **RF-024** — O cliente deve poder cancelar quando a política vigente permitir.
- **RF-025** — O cliente deve poder remarcar quando o agendamento e a política vigente permitirem.
- **RF-026** — Uma remarcação deve revalidar todas as regras aplicáveis ao novo horário.
- **RF-027** — Uma falha na remarcação não deve cancelar nem alterar o horário válido anterior.
- **RF-028** — O sistema deve apresentar confirmação clara após cancelamento ou remarcação.

### Administração de agendamentos

- **RF-029** — O administrador deve visualizar a agenda por dia e semana.
- **RF-030** — O administrador deve consultar detalhes do agendamento e dados necessários do cliente.
- **RF-031** — O administrador deve criar manualmente um agendamento recebido por outro canal.
- **RF-032** — A criação manual também deve impedir sobreposição.
- **RF-033** — O administrador deve poder cancelar um agendamento.
- **RF-034** — O administrador deve poder marcar um agendamento confirmado como concluído ou no-show.
- **RF-035** — O administrador deve visualizar o histórico relevante de criação e mudanças do agendamento.
- **RF-036** — Cancelamentos devem registrar, no mínimo, momento e origem da ação: cliente ou administrador.

### Clientes e visão operacional

- **RF-037** — O administrador deve poder localizar clientes pelos dados disponíveis no MVP.
- **RF-038** — O administrador deve poder consultar o histórico de agendamentos associado ao cliente, respeitando as regras de privacidade.
- **RF-039** — A tela inicial administrativa deve exibir a agenda do dia e pendências operacionais relevantes.
- **RF-040** — Qualquer total monetário eventualmente exibido no MVP deve ser identificado como valor de serviços concluídos, não como pagamento confirmado.
- **RF-041** — O administrador deve poder configurar o nome público obrigatório do negócio e, opcionalmente, descrição pública curta, contato e localização; somente informações configuradas e aprovadas devem ser exibidas no fluxo público.

## 9. Requisitos não funcionais

- **RNF-001 — Mobile-first:** os fluxos público e administrativo essenciais devem ser utilizáveis em telas de celular.
- **RNF-002 — Desempenho percebido:** as ações críticas devem oferecer resposta visual imediata e não deixar o usuário em dúvida sobre processamento ou resultado.
- **RNF-003 — Confiabilidade:** falhas parciais não devem produzir confirmação falsa nem estado ambíguo.
- **RNF-004 — Acessibilidade:** navegação por teclado, foco visível, rótulos, contraste e mensagens de erro compreensíveis devem receber tratamento razoável.
- **RNF-005 — Compatibilidade:** suportar versões atuais dos principais navegadores móveis e desktop definidos antes do lançamento.
- **RNF-006 — Validação:** toda entrada externa deve ser validada também em ambiente confiável do servidor.
- **RNF-007 — Segurança:** autorização administrativa não pode depender apenas da interface.
- **RNF-008 — Privacidade:** coletar e exibir apenas dados pessoais necessários.
- **RNF-009 — Observabilidade:** falhas dos fluxos críticos devem gerar informações suficientes para diagnóstico sem registrar segredos ou dados pessoais desnecessários.
- **RNF-010 — Testabilidade:** regras de disponibilidade, transição de estado, cancelamento, remarcação e snapshots devem ser testáveis isoladamente das telas.
- **RNF-011 — Manutenibilidade:** regras comerciais configuráveis não devem ficar espalhadas ou duplicadas entre fluxos.
- **RNF-012 — Consistência temporal:** decisões de data e hora devem usar o timezone operacional explícito e não depender silenciosamente do dispositivo.
- **RNF-013 — Recuperação de erro:** o usuário deve poder repetir com segurança ações que falharam, sem gerar duplicidades indevidas.
- **RNF-014 — Segurança de dependências e operação:** segredos não devem ser enviados ao cliente nem armazenados no código-fonte.
- **RNF-015 — Neutralidade do domínio:** nomes e regras estruturais não devem depender de um segmento específico sem requisito validado.

Metas numéricas de disponibilidade, latência e recuperação serão definidas na arquitetura e no plano de deploy conforme escala e custo reais; não são inventadas neste PRD.

## 10. Regras de negócio

- **RN-001** — O MVP opera com exatamente um `Business`, um administrador, um profissional operacional, uma unidade e capacidade simultânea igual a um.
- **RN-002** — Cada agendamento possui exatamente um serviço.
- **RN-003** — Combinações comerciais são serviços independentes cadastráveis.
- **RN-004** — Um serviço inativo não aceita novas reservas, mas permanece nos históricos.
- **RN-005** — O agendamento deve guardar snapshots do nome do serviço, duração, preço efetivo e demais dados necessários para interpretar o compromisso original.
- **RN-006** — Mudanças posteriores no serviço não alteram snapshots de agendamentos existentes.
- **RN-007** — Pagamento ocorre fora do sistema; valor do serviço não equivale a pagamento confirmado.
- **RN-008** — Reservas públicas só podem ocorrer dentro das regras configuradas.
- **RN-009** — Nenhuma origem de reserva, inclusive administrativa, pode criar sobreposição com outro compromisso ativo.
- **RN-010** — Cancelamentos liberam o período apenas quando não houver outro bloqueio aplicável.
- **RN-011** — Uma remarcação bem-sucedida deixa somente o novo período ocupado e preserva o histórico do anterior.
- **RN-012** — Uma remarcação malsucedida não modifica o agendamento vigente.
- **RN-013** — O acesso por token concede apenas capacidades limitadas ao agendamento correspondente.
- **RN-014** — Estados terminais não podem ser alterados pelo cliente.
- **RN-015** — O administrador pode registrar o resultado do atendimento, sujeito às transições permitidas.
- **RN-016** — Defaults não críticos devem ser visíveis e editáveis; configurações essenciais exigem confirmação antes da publicação.

## 11. Estados do agendamento

### 11.1 Estados canônicos

| Estado | Significado | Ocupa agenda? | Estado terminal? |
|---|---|---:|---:|
| Confirmado | Reserva válida aguardando atendimento | Sim | Não |
| Concluído | Atendimento realizado | Não para disponibilidade futura; permanece no histórico | Sim |
| Cancelado | Reserva encerrada por cliente ou administrador | Não | Sim |
| No-show | Cliente não compareceu | Não para disponibilidade futura; permanece no histórico | Sim |

### 11.2 Transições permitidas no MVP

| Origem | Destino | Responsável |
|---|---|---|
| Confirmado | Concluído | Administrador |
| Confirmado | Cancelado | Cliente, se permitido; ou administrador |
| Confirmado | No-show | Administrador |

A remarcação não será tratada como um estado final do atendimento: após sucesso, o agendamento continua confirmado no novo período e a alteração fica registrada no histórico. A forma técnica de preservar esse histórico será decidida na arquitetura.

Reabertura ou correção de estados terminais não está aprovada para o MVP e permanece questão aberta. Se necessária, deverá ter regra explícita e trilha de auditoria.

## 12. Regras de disponibilidade

Um horário somente pode ser oferecido quando todas as condições forem verdadeiras:

1. o serviço está ativo;
2. a configuração essencial está completa;
3. a data está dentro das antecedências mínima e máxima;
4. o período está dentro de uma faixa de trabalho aplicável;
5. o período completo comporta a duração preservada para a nova reserva;
6. o buffer configurado cabe conforme sua regra;
7. não há intervalo recorrente incompatível;
8. não há folga, bloqueio ou exceção que o invalide;
9. não há sobreposição com outro agendamento ativo;
10. a data e o horário são válidos no timezone operacional;
11. a disponibilidade ainda é verdadeira no momento da confirmação.

Regras adicionais:

- A grade visual de horários não garante a reserva até a confirmação final.
- O cálculo deve considerar o intervalo completo ocupado, não apenas o horário inicial.
- Agendamentos consecutivos são permitidos somente quando duração e buffer não se sobrepõem.
- Uma exceção específica de data deve poder substituir a regra semanal de maneira clara.
- Precedência entre regra semanal, exceção e bloqueio deve ser determinística e documentada na FASE 3.
- Horários no passado não podem ser reservados.
- Mudança de configuração afeta disponibilidade futura, mas não reescreve silenciosamente agendamentos existentes.
- Conflitos entre uma nova configuração e reservas existentes devem ser apresentados ao administrador; reservas não devem ser canceladas automaticamente.

## 13. Cancelamento e remarcação

### 13.1 Cancelamento

- O sistema deve aplicar a política configurada e mostrar ao cliente se a ação está disponível.
- A política deve considerar o horário operacional do agendamento no timezone configurado.
- Uma solicitação já processada não deve gerar efeitos duplicados.
- Agendamento concluído, cancelado ou no-show não pode ser cancelado pelo cliente.
- O cancelamento deve registrar quando ocorreu e quem o iniciou.
- O link pode continuar exibindo o estado cancelado sem permitir novas mutações indevidas.

### 13.2 Remarcação

- No MVP, a remarcação mantém o mesmo serviço.
- O novo horário deve respeitar disponibilidade e antecedência vigentes.
- O horário antigo deve permanecer válido até a confirmação segura do novo.
- A operação deve produzir integralmente um novo período válido ou não produzir mudança alguma.
- Após o sucesso, o horário antigo é liberado e o novo é ocupado.
- O histórico deve registrar o período anterior, o novo período e o momento da mudança.
- Não haverá promessa de manter preço ou política indefinidamente sem decisão explícita; o comportamento de preço na remarcação é questão aberta.

### 13.3 Política ainda não definida

A janela exata de cancelamento, o limite de remarcações e o comportamento após o prazo serão configuráveis, mas os valores iniciais ainda precisam ser aprovados antes do piloto. O produto não deve ocultar essa ausência com uma regra comercial silenciosa.

## 14. Capacidades administrativas

O painel deverá oferecer:

- edição do perfil público básico do negócio;
- login, encerramento de sessão e recuperação de acesso adequada ao lançamento;
- checklist de configuração inicial;
- cadastro, edição e inativação de serviços;
- configuração da agenda semanal;
- intervalos e tempo entre atendimentos;
- folgas, exceções e bloqueios;
- antecedência e política de cancelamento;
- agenda diária e semanal;
- criação manual sem sobreposição;
- consulta dos detalhes e histórico;
- cancelamento e registro de concluído/no-show;
- consulta básica de clientes;
- visão dos compromissos e pendências do dia.

Não estão incluídos gestão de equipe, permissões por função, contabilidade, campanhas ou relatórios avançados.

## 15. Segurança e privacidade

- **SEG-001** — Toda função administrativa deve exigir autenticação e autorização verificadas no servidor.
- **SEG-002** — O cliente não deve conseguir enumerar agendamentos por identificadores previsíveis.
- **SEG-003** — Tokens de gerenciamento devem ser secretos, suficientemente resistentes a tentativa e limitados ao agendamento correspondente.
- **SEG-004** — Tokens não devem aparecer em logs, analytics, mensagens de erro ou locais desnecessários.
- **SEG-005** — Operações sensíveis realizadas por token devem validar estado e política no servidor.
- **SEG-006** — Entradas devem ser validadas e tratadas como não confiáveis.
- **SEG-007** — Respostas públicas não devem revelar agenda completa, dados de outros clientes ou motivo detalhado de indisponibilidade.
- **SEG-008** — Deve existir proteção razoável contra abuso automatizado do fluxo de consulta e reserva, calibrada sem prejudicar usuários legítimos.
- **SEG-009** — Nome e WhatsApp devem ser exibidos somente onde necessários.
- **SEG-010** — A coleta deve ser limitada ao necessário para reserva e operação.
- **SEG-011** — O produto deverá informar finalidade de uso dos dados de forma clara antes da reserva.
- **SEG-012** — Política de retenção, correção e exclusão/anonimização deverá ser definida antes do lançamento público amplo.
- **SEG-013** — Segredos e credenciais operacionais devem permanecer fora do cliente e do repositório.

Este PRD define resultados de segurança, não algoritmos, bibliotecas ou infraestrutura; essas escolhas pertencem à FASE 3.

## 16. Integridade de dados

- **INT-001** — Em nenhum momento dois agendamentos ativos podem ocupar períodos sobrepostos.
- **INT-002** — A garantia deve continuar válida sob requisições concorrentes.
- **INT-003** — A confirmação apresentada ao usuário deve corresponder a um registro válido e persistido.
- **INT-004** — Repetição da mesma solicitação por recarregamento, atraso ou retry não deve gerar duplicidade indevida.
- **INT-005** — Remarcação deve ser tudo-ou-nada do ponto de vista do usuário.
- **INT-006** — Preço, nome e duração do serviço devem ser preservados como snapshots no agendamento.
- **INT-007** — Valores monetários devem ser representados sem perda de precisão.
- **INT-008** — Datas e horários devem ter interpretação inequívoca no timezone operacional.
- **INT-009** — Alterações de configuração não devem cancelar ou modificar reservas existentes silenciosamente.
- **INT-010** — Mudanças relevantes de estado e horário devem ser rastreáveis.
- **INT-011** — Dados inválidos ou incompletos não devem produzir agendamento parcialmente criado.
- **INT-012** — Inativação de serviço ou cliente não deve apagar histórico necessário.

## 17. Casos extremos

O produto e os testes deverão considerar, no mínimo:

- duas confirmações simultâneas para o mesmo horário;
- dois horários diferentes cujos intervalos ocupados se sobrepõem;
- serviço cuja duração ultrapassa o fim da jornada;
- buffer que ultrapassa intervalo ou fim da jornada;
- bloqueio parcial sobre um possível horário;
- exceção de data conflitante com regra semanal;
- alteração ou inativação do serviço após a reserva;
- redução de jornada com reservas futuras existentes;
- cliente mantendo a página aberta enquanto outro reserva o horário;
- duplo clique ou repetição da confirmação;
- cancelamento repetido;
- remarcação para horário que acaba de ser ocupado;
- falha durante remarcação;
- uso de token inválido, adulterado ou referente a estado terminal;
- acesso administrativo sem sessão válida;
- nome vazio, excessivamente longo ou malformado;
- WhatsApp inválido, incompleto ou em formato inesperado;
- preço zero, negativo ou fora dos limites aceitos;
- duração zero, negativa ou impraticável;
- antecedência mínima maior que a máxima;
- data no passado ou exatamente no limite de antecedência;
- timezone alterado com reservas existentes;
- horário local inexistente ou ambíguo por mudança de offset;
- agenda sem serviço ativo ou sem faixa de trabalho;
- indisponibilidade do sistema depois de o usuário enviar a confirmação.

## 18. Critérios de aceitação do MVP

O MVP será considerado funcionalmente aceito quando:

1. Edmar concluir a configuração essencial e o sistema distinguir claramente agenda pronta de incompleta.
2. Um cliente concluir a jornada serviço → data → horário → dados → confirmação em dispositivo móvel.
3. Horários exibidos respeitarem duração, buffer, jornada, intervalos, exceções, bloqueios, antecedência e ocupações.
4. Tentativas concorrentes não produzirem double booking e somente uma receber confirmação de sucesso.
5. Edmar criar um agendamento manual sem sobreposição.
6. Cliente autorizado consultar, cancelar e remarcar conforme as regras.
7. Uma remarcação concorrente ou com falha preservar o horário anterior.
8. Edmar visualizar a agenda diária e semanal e registrar concluído, cancelado ou no-show.
9. Alterar preço, duração ou nome de um serviço não modificar o snapshot de reservas anteriores.
10. Rotas e operações administrativas rejeitarem usuários não autenticados ou não autorizados.
11. Um token inválido não revelar dados do agendamento.
12. Erros e estados vazios oferecerem orientação compreensível sem confirmação enganosa.
13. Os fluxos críticos possuírem testes automatizados nos níveis apropriados, definidos no plano de engenharia.
14. O sistema registrar informações mínimas para diagnosticar falhas críticas sem expor segredos.
15. Edmar conseguir executar as operações normais sem intervenção do desenvolvedor.
16. Nome público do negócio e timezone estarem confirmados antes da publicação da agenda.

## 19. Métricas e sinais de sucesso

Durante o piloto, acompanhar:

- número e proporção de reservas públicas versus manuais;
- taxa de conclusão do fluxo de reserva iniciado;
- conflitos corretamente rejeitados;
- cancelamentos e remarcações por origem;
- divergências relatadas entre agenda real e sistema;
- solicitações de ajuda para tarefas rotineiras;
- erros nos fluxos de disponibilidade, confirmação e gerenciamento;
- frequência de uso do painel por Edmar;
- percepção de tempo economizado;
- intenção de continuar usando o sistema.

Não serão definidas metas numéricas sem linha de base. Métricas não devem coletar dados pessoais desnecessários.

## 20. Pós-MVP

Itens candidatos, sujeitos a nova descoberta e priorização:

- confirmação e lembretes automáticos;
- integração oficial com WhatsApp;
- lista de espera e aviso de vaga;
- pagamento ou sinal via PIX;
- fidelidade;
- promoções;
- indicadores e relatórios avançados;
- marketing automatizado;
- múltiplos barbeiros;
- múltiplas unidades;
- múltiplos negócios e gestão de tenants;
- onboarding público de negócios;
- planos, billing e marketplace;
- variações de comportamento específicas por segmento;
- exportações e integrações externas;
- aplicativo nativo, somente se o uso justificar.

## 21. Questões ainda abertas

### Bloqueiam o piloto, mas não a continuidade da FASE 1/UX

1. Qual política inicial de cancelamento será configurada?
2. Haverá limite de remarcações? Qual comportamento após o prazo?
3. Na remarcação, deve ser preservado o preço original ou aplicado o preço vigente?
4. O administrador pode criar compromisso fora da jornada configurada? Se sim, em quais condições e com qual alerta?
5. O buffer ocorre somente depois do serviço ou pode existir antes e depois?
6. Qual timezone inicial será confirmado por Edmar?
7. Qual informação mínima de privacidade será apresentada no fluxo de reserva?
8. Qual prazo de retenção e qual processo de exclusão/anonimização serão adotados?

### Podem ser respondidas por uso real

9. A consulta básica de clientes é necessária no primeiro lançamento ou a busca na agenda basta?
10. Edmar precisa corrigir um estado terminal lançado por engano?
11. O sistema precisa registrar valor efetivamente cobrado, desconto ou forma de pagamento?
12. A visão operacional precisa de algum total monetário no MVP?
13. O WhatsApp informado precisa de verificação antes de confirmar a reserva?
14. Quais navegadores e aparelhos predominam entre os usuários reais?
15. Deve existir limite operacional de reservas futuras por cliente?
16. Quando e como um token de gerenciamento deve ser revogado ou substituído?
17. Na FASE 3, onde o escopo de `Business` deverá ser armazenado e como eventual `business_id` será aplicado e garantido sem duplicação inconsistente?

## 22. Inconsistências e alertas de produto

### 22.1 Defaults versus configuração

Aplicar defaults silenciosos a duração, preço, timezone ou jornada pode criar reservas erradas. Portanto, esses campos exigem confirmação administrativa. Defaults razoáveis são permitidos durante desenvolvimento e para preferências não críticas, desde que visíveis.

### 22.2 Pagamento fora do sistema versus faturamento

O sistema conhece o preço do serviço, mas não necessariamente o valor recebido. Qualquer soma será, no máximo, valor de serviços concluídos. Chamar isso de faturamento real sem registrar pagamentos seria enganoso.

### 22.3 Link sem conta versus segurança

O token funciona como credencial. A simplicidade do fluxo aumenta a importância de proteção contra enumeração, vazamento, abuso e exposição em logs.

### 22.4 Flexibilidade administrativa versus consistência

Permitir exceções e overrides demais pode produzir regras difíceis de entender. O MVP deve oferecer poucas configurações claras e precedência previsível.

### 22.5 Remarcação versus integridade

Liberar o horário antigo antes de garantir o novo pode prejudicar o cliente; ocupar o novo sem liberar o antigo gera indisponibilidade incorreta. A remarcação exige comportamento tudo-ou-nada.

### 22.6 Alterações futuras versus reservas existentes

Editar jornada, timezone ou serviço não pode reescrever compromissos silenciosamente. Conflitos devem ser exibidos e resolvidos conscientemente.

## 23. Critério de encerramento da FASE 1

A FASE 1 poderá ser aprovada quando:

- o escopo e os não objetivos forem aceitos;
- requisitos funcionais, não funcionais e regras de negócio forem revisados;
- estados e transições forem aceitos;
- alertas e questões abertas forem reconhecidos;
- itens que bloqueiam o piloto tiverem responsável e momento de decisão;
- houver autorização explícita para iniciar a FASE 2 — UX.

**Próximo passo condicionado:** não iniciar a FASE 2 sem aprovação explícita deste PRD.
