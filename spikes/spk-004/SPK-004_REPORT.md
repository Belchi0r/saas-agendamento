# SPK-004 — Timezone and DST Strategy

## Resultado

**PASS**

A estratégia proposta foi comprovada localmente com timezone IANA explícito e `@js-temporal/polyfill`: horários inexistentes são omitidos sem ajuste silencioso; horários ambíguos escolhem deterministicamente o primeiro instante cronológico; instantes UTC e snapshots são consistentes; intervalos continuam half-open `[)`; a matriz não depende do timezone da máquina; e a política de alteração do timezone do Business preserva o histórico.

Não surgiu garantia que dependesse do Supabase hospedado. Nenhum ambiente remoto foi usado.

## Escopo e fontes de verdade

O spike foi limitado a `spikes/spk-004/`. Não reexecutou nem alterou SPK-001, SPK-002 ou SPK-006, não iniciou Sprint 0, não implementou o SaaS e não alterou documentos oficiais.

Fontes de verdade consultadas, sem modificação:

- `BARBER_ARCHITECTURE_v1 (2).md`;
- `BARBER_DATA_MODEL_v1 (3).md`;
- `BARBER_ARCHITECTURE_DECISIONS_v1 (2).md`.

A implementação exploratória aplica as decisões dessas fontes: regra recorrente em data/hora local; timezone IANA do Business; confirmação como instante UTC; snapshots de timezone, data local, hora local e offset; e intervalos `[)`.

## Ambiente e versões exatas

| Componente | Versão/comportamento testado |
|---|---|
| Sistema | Windows, `win32 x64` |
| Node.js | `v24.19.0` |
| V8 | `13.6.233.17-node.51` |
| ICU | `78.3` |
| CLDR | `48.0` |
| tzdata do runtime | `2026b` |
| `@js-temporal/polyfill` | `0.5.1`, fixado no lockfile |
| TypeScript | `7.0.2` |
| `tsx` | `4.23.12` |
| `@types/node` | `24.10.10` |
| pnpm | `11.19.0` |
| Temporal nativo, execução padrão | indisponível: `globalThis.Temporal === undefined` |
| Temporal nativo, execução experimental | disponível somente com `--harmony-temporal` |

O pacote testado é a versão `0.5.1` publicada no [npm](https://www.npmjs.com/package/@js-temporal/polyfill); mudanças futuras devem ser avaliadas contra o [changelog oficial](https://github.com/js-temporal/temporal-polyfill/blob/main/CHANGELOG.md) antes de atualizar o lockfile.

## Método

Foi criado um harness TypeScript autocontido com três limites explícitos:

1. conversão local → UTC somente em `src/server/`;
2. browser limitado a formatar snapshots já persistidos;
3. nenhum uso de `Date` local, `Date.now()` ou timezone implícito do processo como regra de negócio.

O resolvedor não usa o comportamento padrão `compatible`, pois ele desloca gaps para frente. Para uma data/hora local, calcula explicitamente as alternativas `earlier` e `later` e faz round-trip de ambas:

- nenhuma alternativa volta aos campos locais originais: `NONEXISTENT`, sem slot e sem instante;
- ambas voltam e os instantes diferem: ambíguo, seleciona o menor instante, isto é, a primeira ocorrência cronológica;
- ambas representam o mesmo instante: `UNIQUE`.

Essa distinção é necessária porque a documentação do Temporal define que `compatible` escolhe a ocorrência anterior em folds, mas a posterior em gaps, ajustando o horário local inexistente. O spike não aceita esse ajuste silencioso. Ver [disambiguation de timezone no Temporal](https://tc39.es/proposal-temporal/docs/timezone.html).

## Matriz de casos

Todos os valores esperados foram fixados no código e comparados por igualdade; não são snapshots gerados a partir do próprio resultado.

| Caso | Entrada local | Timezone IANA | Classificação / offset | Instante UTC resultante | Esperado | Observado |
|---|---|---|---|---|---|---|
| Sem DST, inverno | `2025-01-15 09:00` | `America/Phoenix` | `UNIQUE`, `-07:00` | `2025-01-15T16:00:00Z` | Offset fixo `-07:00` | Igual ao esperado |
| Sem DST, verão | `2025-07-15 09:00` | `America/Phoenix` | `UNIQUE`, `-07:00` | `2025-07-15T16:00:00Z` | Mesmo offset no verão | Igual ao esperado |
| Offset fracionário | `2025-06-15 09:00` | `Asia/Calcutta` | `UNIQUE`, `+05:30` | `2025-06-15T03:30:00Z` | Preservar meia hora | Igual ao esperado |
| Antes do avanço | `2025-03-09 01:59` | `America/New_York` | `UNIQUE`, `-05:00` | `2025-03-09T06:59:00Z` | Último período pré-DST | Igual ao esperado |
| Horário inexistente | `2025-03-09 02:30` | `America/New_York` | `NONEXISTENT`, sem offset | nenhum | Não criar slot; não mover para `03:30` | Slot omitido; nenhum UTC produzido |
| Depois do avanço | `2025-03-09 03:00` | `America/New_York` | `UNIQUE`, `-04:00` | `2025-03-09T07:00:00Z` | Primeiro período pós-DST | Igual ao esperado |
| Horário ambíguo | `2025-11-02 01:30` | `America/New_York` | `AMBIGUOUS_FIRST`, `-04:00` | `2025-11-02T05:30:00Z` | Primeira ocorrência; alternativa `06:30Z/-05:00` | Primeira ocorrência selecionada |
| Depois do retorno | `2025-11-02 02:00` | `America/New_York` | `UNIQUE`, `-05:00` | `2025-11-02T07:00:00Z` | Período pós-retorno | Igual ao esperado |
| Gap europeu | `2025-03-30 02:30` | `Europe/Berlin` | `NONEXISTENT`, sem offset | nenhum | Não criar slot | Slot omitido; nenhum UTC produzido |
| Fold europeu | `2025-10-26 02:30` | `Europe/Berlin` | `AMBIGUOUS_FIRST`, `+02:00` | `2025-10-26T00:30:00Z` | Primeira ocorrência; alternativa `01:30Z/+01:00` | Primeira ocorrência selecionada |
| Meia-noite/ano | `2026-01-01 00:15` | `Pacific/Kiritimati` | `UNIQUE`, `+14:00` | `2025-12-31T10:15:00Z` | Ano UTC anterior | Igual ao esperado |
| Meia-noite/mês | `2025-03-01 00:00` | `America/New_York` | `UNIQUE`, `-05:00` | `2025-03-01T05:00:00Z` | Fronteira determinística | Igual ao esperado |
| Dia após transição | `2025-03-10 00:00` | `America/New_York` | `UNIQUE`, `-04:00` | `2025-03-10T04:00:00Z` | Novo offset aplicado | Igual ao esperado |

Resultado da matriz: **13/13 PASS**.

## Nonexistent e ambiguous

### Horários inexistentes

Os gaps de `America/New_York` e `Europe/Berlin` foram classificados como `NONEXISTENT`. Em ambos:

- nenhum slot foi emitido;
- nenhum instante UTC foi produzido;
- o horário não foi movido silenciosamente para depois do avanço;
- a rejeição é uma decisão do resolvedor, não uma interpretação de texto de exceção.

### Horários ambíguos

Em `America/New_York`, `2025-11-02 01:30` corresponde a:

- primeira ocorrência: `2025-11-02T05:30:00Z`, offset `-04:00`;
- segunda ocorrência: `2025-11-02T06:30:00Z`, offset `-05:00`.

O resolvedor escolheu `05:30Z`. O mesmo comportamento foi confirmado em `Europe/Berlin`: `2025-10-26 02:30` escolheu `00:30Z/+02:00`, antes de `01:30Z/+01:00`.

## Conversão local → UTC → local e snapshots

O caso ambíguo confirmado de New York produziu:

```json
{
  "scheduledStartAtUtc": "2025-11-02T05:30:00Z",
  "timezoneSnapshot": "America/New_York",
  "localDateSnapshot": "2025-11-02",
  "localTimeSnapshot": "01:30:00",
  "utcOffsetMinutesSnapshot": -240
}
```

Apresentação reconstruída: `2025-11-02 01:30:00 -04:00 [America/New_York]`.

A recomposição de data local, hora local, timezone e offset produziu novamente `2025-11-02T05:30:00Z`. Logo, o instante confirmado é inequívoco e os snapshots preservam a representação numérica apresentada no momento da confirmação, mesmo que regras futuras de timezone mudem.

Os snapshots não preservam texto traduzido, abreviação regional como `EDT`, locale ou template visual; esses elementos são apresentação e não fazem parte do requisito provado.

## Duração atravessando mudança de offset

Foi adotada duração como tempo decorrido sobre `Temporal.Instant`, não como soma de relógio local:

| Transição | Início UTC | Fim UTC | Início/fim local | Duração observada |
|---|---|---|---|---|
| avanço | `2025-03-09T06:30:00Z` | `2025-03-09T08:30:00Z` | `01:30 -05:00` → `04:30 -04:00` | 120 min |
| retorno | `2025-11-02T04:30:00Z` | `2025-11-02T06:30:00Z` | `00:30 -04:00` → `01:30 -05:00` | 120 min |

Nos dois casos a duração real permaneceu exatamente 120 minutos.

## Intervalos half-open `[)`

- `[05:30Z, 06:00Z)` e `[06:00Z, 06:30Z)` não conflitaram;
- `[05:30Z, 06:00Z)` e `[05:59Z, 06:01Z)` conflitaram.

Isso mantém adjacência válida em instantes UTC e é consistente com a estratégia de ocupação já validada no SPK-001, que não foi reexecutado.

## Validação de timezone IANA

`America/New_York` foi aceito. Identificadores inválidos e identificadores de offset fixo foram rejeitados deliberadamente, incluindo valores inexistentes ou não-IANA. A validação retorna o identificador canônico aceito pelo runtime; aliases válidos podem ser normalizados.

Essa normalização deve acontecer no servidor antes de persistir `Business.timezone`. O browser não é autoridade para validar nem para converter data/hora local em UTC.

## Alteração do timezone do Business

O relógio do teste foi fixado em `2026-01-01T00:00:00Z`.

### Com appointment futuro confirmado

Uma tentativa de troca encontrou o Appointment `future-confirmed` e retornou `BLOCKED_FUTURE_CONFIRMED`:

- timezone não foi alterado;
- versão de disponibilidade permaneceu `7`;
- o identificador conflitante foi registrado.

### Sem appointment futuro confirmado

Com apenas histórico confirmado e appointment futuro cancelado, a troca de `America/New_York` para `America/Los_Angeles` foi permitida:

- versão incrementada de `7` para `8`;
- registros de Appointment permaneceram byte a byte iguais;
- instante histórico permaneceu `2025-06-01T13:00:00Z`;
- regra recorrente futura `2030-01-15 09:00` passou de `14:00Z` em New York para `17:00Z` em Los Angeles.

Portanto, o histórico não é reinterpretado nem reescrito; somente regras locais ainda não materializadas são reinterpretadas conscientemente no novo timezone.

Na implementação real, a verificação de Appointment futuro confirmado, a alteração do timezone e o incremento da versão devem ocorrer na mesma transação, respeitando a ordem global de locks já estabelecida pela arquitetura.

## Temporal nativo versus polyfill

| Aspecto | Node padrão | Node com `--harmony-temporal` | Polyfill `0.5.1` |
|---|---|---|---|
| Disponibilidade | ausente | presente, experimental | import explícito |
| `globalThis.Temporal` | `undefined` | objeto | continua `undefined` |
| Gap `compatible` | n/a | desloca `02:30` para `03:30` | igual |
| Fold `compatible` | n/a | primeira ocorrência | igual |
| Vetores `earlier`/`later` | n/a | iguais ao polyfill | referência do spike |
| `reject` | n/a | `RangeError` com mensagem interna do V8 | `RangeError` com mensagem `multiple instants found` |

Os resultados semânticos centrais foram iguais entre o Temporal nativo experimental e o polyfill. As mensagens de erro foram diferentes e, no gap, a mensagem do polyfill não é adequada para classificação. O código não depende do texto da exceção.

Não há incompatibilidade crítica com o runtime proposto. Como o Temporal nativo não está disponível no runtime padrão testado e requer uma flag explicitamente experimental, a decisão segura é continuar com import explícito e versão fixada do polyfill. Não se deve habilitar `--harmony-temporal` em produção com base neste spike.

## Independência do timezone da máquina

A mesma matriz foi executada em subprocessos com:

- `TZ=UTC`;
- `TZ=America/Los_Angeles`;
- `TZ=Asia/Tokyo`.

Os três resultados foram byte-equivalentes e produziram o mesmo SHA-256:

`883147695c3b5c0ca2bacc6ad799568da90c4128411138af5bb81570fcac28a2`

Não há uso de `Date` local do processo na implementação do domínio. O relógio de decisões também foi injetado como `Temporal.Instant` fixo nos testes.

## Fronteira servidor/browser

A conversão local → UTC está somente no módulo servidor. O módulo representando o browser recebe e formata snapshots persistidos; ele não importa Temporal, não aceita `business_id`/timezone como autoridade de conversão e não usa credencial de banco.

O spike prova o limite no código exploratório. A fiscalização desse limite no bundle e nas rotas reais continua sendo responsabilidade da implementação futura.

## Evidências estruturadas

- [`evidence/SPK-004_EVIDENCE.json`](evidence/SPK-004_EVIDENCE.json): resultado agregado, ambiente, snapshots, duração, mudança de timezone e independência do processo;
- [`evidence/SPK-004_CASE_MATRIX.json`](evidence/SPK-004_CASE_MATRIX.json): matriz determinística completa;
- [`evidence/SPK-004_NATIVE_COMPARISON.json`](evidence/SPK-004_NATIVE_COMPARISON.json): comparação entre runtime padrão, runtime experimental e polyfill;
- `src/server/time-strategy.ts`: validação IANA, resolução de local time, snapshots, duração e `[)`;
- `src/server/timezone-change.ts`: política de alteração de timezone;
- `src/browser/confirmation-view.ts`: limite de apresentação sem conversão local → UTC;
- `scripts/run-spike.ts`: orquestração, asserções e emissão de evidências.

## Riscos encontrados

1. **Evolução do tzdata.** Regras governamentais podem mudar e runtimes diferentes podem carregar versões distintas. O lockfile não fixa a base ICU/tzdata do Node. A versão do runtime deve ser controlada e a matriz deve rodar em upgrades.
2. **Polyfill pré-1.0.** A versão testada é `0.5.1`; atualizações podem mudar superfície ou detalhes. Manter versão exata e repetir o spike ao atualizar.
3. **Comportamento padrão perigoso.** `compatible` ajusta gaps silenciosamente. Um uso direto de `toZonedDateTime` sem o resolvedor de política pode criar um slot proibido.
4. **Mensagens de erro não portáveis.** Nativo e polyfill retornam textos diferentes. Apenas tipo/classificação e round-trip podem fundamentar regra de domínio.
5. **Aliases IANA.** O runtime pode canonicalizar aliases. Comparações e persistência devem usar a forma canônica retornada pelo servidor.
6. **Diferença app/PostgreSQL.** Este spike não comparou o tzdata do Node com o PostgreSQL. A arquitetura evita o problema ao tornar o servidor Temporal autoridade para local → UTC e persistir UTC; conversões de negócio no banco reabririam esse risco.
7. **Offsets históricos subminuto.** O snapshot de offset do modelo é inteiro em minutos. O harness rejeita offsets históricos com segundos; o domínio contemporâneo/futuro do MVP não precisa dessas eras, mas elas não foram validadas.
8. **Concorrência da mudança de timezone.** A política foi provada, mas sua execução transacional contra appointments reais deve obedecer locks/versionamento na implementação.

## Mudanças arquiteturais necessárias

**Nenhuma mudança semântica nas decisões propostas é necessária.** O resultado sustenta a estratégia descrita nas fontes de verdade.

Precisões obrigatórias para a implementação futura, sem alteração dos documentos neste spike:

- encapsular toda conversão local → UTC em um único serviço servidor;
- nunca usar a desambiguação padrão `compatible` para gerar slots;
- detectar gap/fold por alternativas explícitas e round-trip;
- selecionar o primeiro `Temporal.Instant` cronológico em folds;
- persistir simultaneamente UTC, timezone canônico, data local, hora local e offset em minutos;
- calcular duração sobre `Temporal.Instant`;
- injetar o instante atual em regras testáveis;
- alterar `Business.timezone` e sua versão somente em transação que também verifique appointments futuros confirmados;
- manter Node, ICU/tzdata e polyfill observáveis e cobertos por esta matriz em upgrades.

## Itens não provados

- execução no bundle, rotas e runtime de produção, pois o SaaS ainda não existe;
- transação real de mudança do Business no PostgreSQL e sua concorrência;
- equivalência entre tzdata do Node e do PostgreSQL, desnecessária enquanto PostgreSQL não fizer conversão local de regra de negócio;
- geração completa de disponibilidade recorrente; foram provadas as primitivas temporais e sua política;
- datas históricas com offsets anteriores à padronização em minutos;
- leap seconds, fora do modelo do Temporal e do escopo do produto;
- preservação de texto localizado, abreviações ou layout visual além dos campos numéricos persistidos;
- comportamento em versões diferentes de Node, ICU/tzdata ou polyfill.

Nenhum desses itens invalida os critérios de PASS do spike.

## Próxima ação exata

Encerrar o SPK-004 como **PASS**. Em uma tarefa separada e explicitamente autorizada de governança arquitetural, registrar a evidência para a decisão de timezone e incorporar as precisões de implementação acima; depois, quando a implementação correspondente for iniciada, transformar esta matriz em testes de regressão obrigatórios. Não iniciar Sprint 0 nem alterar ADRs como parte deste spike.

