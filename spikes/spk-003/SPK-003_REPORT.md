# SPK-003 — Customer Access Token and Idempotency Strategy

**Resultado: PASS**

Data da execução: 2026-08-23  
Escopo: somente `spikes/spk-003/`  
Supabase hospedado: **não utilizado**; nenhuma garantia deste spike depende do ambiente gerenciado.  
Spikes SPK-001/002/004/005/006: não reexecutados e não alterados.  
Documentos oficiais/ADRs: não alterados.

## 1. Conclusão executiva

A estratégia foi comprovada, com quatro concretizações necessárias:

1. token de gerenciamento com 32 bytes aleatórios, base64url, e lookup por HMAC-SHA-256 usando pepper fora do banco;
2. fragment exchange mantido: fragmento no link, POST de bootstrap, cookie-capability curto e URL limpa com `history.replaceState`;
3. recibo idempotente serializado por lock transacional por `(Business, operação, key_hash)` e gravado na mesma transação do efeito;
4. envelope mínimo AES-256-GCM por 24 horas, enquanto o recibo sem segredo permanece 72 horas.

O envelope cifrado não é complexidade opcional se o contrato continuar exigindo que um retry legítimo recupere o link após “commit confirmado, resposta perdida”. Sem material reversível temporário, o token bruto não pode ser reconstruído do HMAC. Persisti-lo em claro viola a própria capability. O envelope autenticado e de TTL curto foi a menor alternativa testada que satisfez ambas as propriedades.

O fluxo fragmento → cookie é simples o bastante para o MVP: uma página bootstrap, um Route Handler de exchange, um cookie assinado e revalidação server-side. Retirar o exchange simplificaria um endpoint, mas deixaria o token duradouro no endereço/histórico e acessível a JavaScript durante toda a jornada; usar query string foi objetivamente pior.

## 2. Fontes de verdade e referências técnicas

Fontes de produto consultadas sem alteração:

- `BARBER_ARCHITECTURE_v1`;
- `BARBER_DATA_MODEL_v1`;
- `BARBER_ARCHITECTURE_DECISIONS_v1`, especialmente ADR-005.

Referências primárias para o mecanismo:

- [Node.js 24.19.0 — Crypto](https://nodejs.org/download/release/v24.19.0/docs/api/crypto.html);
- [PostgreSQL 18 — explicit/advisory locking](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS);
- [PostgreSQL 18 — partial indexes](https://www.postgresql.org/docs/18/indexes-partial.html);
- [PostgreSQL 18 — `INSERT`/`ON CONFLICT`](https://www.postgresql.org/docs/18/sql-insert.html#SQL-ON-CONFLICT);
- [WHATWG URL Standard — fragment](https://url.spec.whatwg.org/#concept-url-fragment);
- [W3C Referrer Policy — `no-referrer`](https://w3c.github.io/webappsec-referrer-policy/#referrer-policy-no-referrer).

## 3. Ambiente e versões exatas

| Componente | Versão/ambiente observado |
|---|---|
| Sistema | Windows `10.0.26200`, x64 |
| Node.js | `24.19.0` |
| OpenSSL do Node | `3.5.7` |
| PostgreSQL real local | `18.4` via `embedded-postgres@18.4.0-beta.17` |
| `pg` | `8.23.0` |
| TypeScript | `7.0.2` |
| `tsx` | `4.23.12` |
| pnpm | `11.19.0` |
| Navegador real | Chromium `151.0.0.0`, user agent preservado na evidência |
| Relógio de domínio | instante fixo/injetado; relógio real somente para timestamp da evidência e cookie do browser |

O PostgreSQL foi iniciado de forma descartável, escutando apenas em `127.0.0.1`. O servidor de transporte também escutou somente em `127.0.0.1`. Nenhuma credencial externa foi necessária.

## 4. Artefatos e método

- `sql/schema.sql`: schema mínimo descartável para Appointment, access token e idempotência;
- `scripts/lib/security.ts`: geração, HMAC, AES-GCM e cookie-capability;
- `scripts/lib/canonical.ts`: normalização, representação canônica, serialização determinística e SHA-256;
- `scripts/lib/db-scenarios.ts`: transações, concorrência, token lifecycle, TTL e negativos;
- `scripts/run-browser-harness.ts`: servidor HTTP descartável para o teste em browser;
- `evidence/SPK-003_BROWSER_EVIDENCE.json`: observações HTTP/browser sem segredos;
- `evidence/SPK-003_LOCAL_EVIDENCE.json`: evidência consolidada.

Comandos de verificação:

```text
node --import tsx scripts/run-browser-harness.ts
node --import tsx scripts/run-local-spike.ts
node node_modules/typescript/bin/tsc --noEmit
```

A concorrência não dependeu de `sleep` para correção. A primeira transação reteve o lock da intenção; a segunda só foi liberada após o observador encontrar `wait_event_type=Lock` e `wait_event=advisory` em `pg_stat_activity`.

## 5. Matriz de token

| Caso | Esperado | Observado | Resultado |
|---|---|---|---|
| Entropia | pelo menos 256 bits | 32 bytes/256 bits via `randomBytes`, base64url de 43 caracteres | PASS |
| Colisão na amostra | nenhuma | 256/256 valores únicos | PASS |
| Persistência | somente hash | `bytea(32)`; nenhum token bruto em coluna/projeção | PASS |
| Pepper | fora do banco | Buffer de aplicação; nenhuma coluna `pepper`/`raw_token`/`raw_key` | PASS |
| Hash | estável com mesmo pepper | HMAC-SHA-256 estável; pepper diferente produz hash diferente | PASS |
| Token correto | resolve um Appointment | `AUTHORIZED`, `READ_WRITE` | PASS |
| Token incorreto | resposta neutra | `404 MANAGEMENT_LINK_INVALID` | PASS |
| Appointment ID como token | não autoriza | exatamente o mesmo status/corpo do inválido | PASS |
| Segundo token ativo | rejeitado pelo banco | SQLSTATE `23505` pela partial unique index | PASS |
| Reuso da conexão após `23505` | possível após rollback | `select 1` funcionou na mesma conexão | PASS |
| Falha após revogar em rotação | rollback integral | antigo continuou válido; novo não confirmado ficou inválido | PASS |
| Rotação bem-sucedida | antigo inválido, novo válido | observado; uma linha ativa | PASS |
| Revogação | token deixa de funcionar | resposta idêntica ao token inválido; zero linhas ativas | PASS |
| Estado terminal | leitura sim, mutação não | `READ_ONLY`; mutação `409 APPOINTMENT_READ_ONLY` | PASS |
| Logs/evidência | nenhum segredo bruto | 269 segredos gerados auditados; zero ocorrência | PASS |

### 5.1 Geração, hash e pepper

Construção testada:

```text
raw token = base64url(randomBytes(32))
token_hash = HMAC-SHA-256(key = TOKEN_PEPPER, message = raw token)
```

O pepper não está no schema, no SQL, no arquivo de evidência nem em logs. Para produção, deve vir do secret store do runtime. O mesmo princípio foi usado para a idempotency key, com **pepper separado**.

HMAC foi preferido a concatenações ad hoc de hash + pepper. O índice único em `token_hash` oferece lookup direto e a partial unique index `(appointment_id) WHERE revoked_at IS NULL` torna “um token ativo” uma invariante do PostgreSQL, não apenas da aplicação.

### 5.2 Lookup uniforme

Inexistente, revogado e Appointment ID usado como suposto token retornam o mesmo `404` e o mesmo código lógico. Não se reivindica latência de rede perfeitamente constante; isso é impraticável com lookup de banco e não é necessário para a propriedade comprovada. Rate limiting distribuído continua necessário para controlar custo de abuso.

### 5.3 Rotação e revogação

A rotação adquire `FOR UPDATE` no Appointment, bloqueia o token ativo, revoga-o e insere o novo hash na mesma transação. Uma falha injetada após a revogação produziu rollback: o token antigo permaneceu válido e o novo não existiu. A rotação concluída deixou exatamente uma linha ativa. Revogação retornou zero linhas ativas.

## 6. Transporte, cookie, cache e referrer

### 6.1 Comparação objetiva

| Opção | Token no request inicial | Risco de URL/referrer | Revogável | Estado observado | Decisão |
|---|---:|---|---:|---|---|
| Query parameter | sim | alto: request target e referrer same-origin continham o token | sim | vazou nos dois probes | rejeitar |
| Fragmento mantido | não | não vai ao servidor/referrer, mas permanece na barra/histórico e no JS | sim | request não continha `#` nem token | insuficiente sozinho |
| Fragment exchange | não no GET; sim somente no corpo do POST de exchange | baixo com redaction/sem body logging | sim | troca funcionou e fragmento foi removido | manter |
| Cookie-capability assinado | não contém token bruto | baixo; cookie `HttpOnly` e escopado | sim, por revalidação | assinatura, referência e versão revalidadas | manter após exchange |
| Token stateless assinado como acesso duradouro | não requer lookup inicial | revogação/versionamento mais complexos | pior | não implementado; incompatível com a decisão | rejeitado |

### 6.2 Evidência de navegador real

Fluxo observado:

1. navegação para o link com fragmento;
2. request HTTP recebido como `GET /manage`, sem `#` e sem token;
3. bootstrap leu o fragmento e fez `POST /exchange`;
4. servidor validou o token somente em memória e respondeu com cookie-capability;
5. `history.replaceState` limpou a URL;
6. URL final observada: `http://127.0.0.1:<porta>/manage`;
7. `document.cookie` não enxergou o cookie `HttpOnly`;
8. o browser enviou o cookie de volta e o servidor revalidou assinatura, referência e versão do Appointment.

O teste comparativo deliberado enviou o mesmo segredo por query parameter. O servidor detectou o valor no request target, e um recurso same-origin recebeu o valor no `Referer` sob a política default. Esses valores foram comparados apenas em memória; a evidência guarda booleanos, nunca o token.

### 6.3 Cookie-capability

Contrato testado:

| Atributo | Valor |
|---|---|
| Conteúdo | referência opaca do token, versão do Appointment, `exp`, versão do formato e assinatura HMAC-SHA-256 |
| Token de gerenciamento bruto | ausente |
| `HttpOnly` | presente e invisível a `document.cookie` |
| `Secure` | presente; browser local enviou o cookie de volta |
| `SameSite` | `Strict` |
| `Path` | `/manage` |
| `Max-Age` | 600 segundos |
| Revalidação | assinatura + expiração + referência ativa + versão do Appointment |

O cookie é apenas uma capability curta, não uma sessão de identidade. A assinatura usa chave diferente do pepper do token e da chave de envelope.

### 6.4 Headers e recursos

Na superfície sensível, o servidor realmente respondeu com:

```text
Cache-Control: private, no-store
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'self'; connect/img/frame somente 'self'; base-uri 'none'; form-action 'none'
X-Content-Type-Options: nosniff
```

O probe sob `no-referrer` recebeu `Referer: null`. Não houve analytics ou scripts de terceiros; `thirdPartyRequests = 0`. O log HTTP allowlist guardou somente método e pathname, descartando query e corpo.

## 7. Fingerprint canônico

Pipeline provado:

```text
comando validado/normalizado
→ objeto canônico versionado `book-appointment/v1`
→ serialização recursiva com chaves ordenadas
→ SHA-256 dos bytes UTF-8
```

Normalizações exercitadas:

- UUID de Service para lowercase;
- instante equivalente para ISO UTC;
- nome e notas em Unicode NFC, trim e espaços internos colapsados;
- WhatsApp removendo apenas pontuação/espaços permitidos e validando E.164;
- ausência/notas vazias para `null` explícito;
- versão incluída dentro da representação canônica.

Vetor conhecido produzido:

```text
version: book-appointment/v1
sha256: d09f2eb441deb0b8aa6bc4549f2ebf06e3add88246bfe14929d9d82ceeaea32b
```

| Caso | Observado |
|---|---|
| mesma intenção, ordem de campos diferente | mesmo fingerprint |
| espaços/formato de telefone/offset equivalentes | mesmo fingerprint |
| payload semanticamente diferente | fingerprint diferente |
| `JSON.stringify` arbitrário dos inputs | deliberadamente não usado como contrato |

## 8. Idempotência e concorrência

### 8.1 Estratégia concreta

1. validar e normalizar o comando;
2. calcular `key_hash` com HMAC-SHA-256 e pepper específico;
3. calcular fingerprint canônico versionado;
4. abrir transação;
5. adquirir `pg_advisory_xact_lock` derivado de Business + operação + `key_hash`;
6. buscar recibo existente `FOR UPDATE`;
7. se existir, comparar fingerprint e devolver/descriptografar o resultado;
8. se não existir, executar efeito, token e recibo `SUCCEEDED` na mesma transação;
9. confirmar tudo junto.

O lock advisory é transacional e liberado automaticamente no commit/rollback. Ele evita persistir estado `IN_PROGRESS`, preservando a regra do data model de que somente `SUCCEEDED` é visível/persistido. A unique `(business_id, operation, key_hash)` permanece defesa final.

### 8.2 Matriz observada

| Caso | Resultado observado |
|---|---|
| mesma key + mesmo fingerprint | replay do Appointment, token e link originais |
| mesma key + payload diferente | `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST` |
| duas requests concorrentes com mesma key | uma `CREATED`, uma `REPLAYED` |
| efeitos após corrida | 1 Appointment, 1 token, 1 recibo |
| espera concorrente | `wait_event_type=Lock`, `wait_event=advisory` |
| falha antes do commit | totais de Appointment/token/recibo inalterados; zero recibos para a key falha |
| retry após rollback | `CREATED`, exatamente um novo efeito |
| mesma raw key em dois Businesses | permitida, com Appointment/recibo distintos por Business |
| conexão após erro SQL | reutilizada após rollback |

O isolamento usa `(business_id, operation, key_hash)` tanto na unicidade quanto no protocolo de lock. A composite FK do recibo para `(business_id, appointment_id)` impede associar resultado de outro Business.

## 9. Retry após timeout/commit e response envelope

### 9.1 Falha reproduzida

O harness confirmou a transação, descartou deliberadamente a resposta e lançou `SIMULATED_RESPONSE_LOSS_AFTER_COMMIT`. No retry com a mesma key/fingerprint:

- o recibo existente foi encontrado;
- o envelope autenticado foi descriptografado;
- o mesmo token bruto e o mesmo link foram recuperados;
- o resultado foi `REPLAYED`;
- permaneceram 1 Appointment, 1 token e 1 recibo.

Logo, o comportamento proibido — Appointment confirmado e retry legítimo sem acesso — **não ocorre dentro da janela do envelope**.

### 9.2 Comparação de alternativas

| Alternativa | Segurança | Retry após commit perdido | Simplicidade | Conclusão |
|---|---|---:|---:|---|
| Não guardar resposta recuperável | hash unilateral preservado | falha: não reconstrói token | alta | rejeitar pelo contrato |
| Token bruto no recibo | banco concede capability a quem vazar dump | funciona | alta | rejeitar |
| Token determinístico derivado da idempotency key | acopla dois segredos e transforma vazamento da key em capability | funciona | aparente | rejeitar |
| Reemissão administrativa imediata | segura após verificação humana | não é retry automático e cria fricção operacional | média | fallback após TTL, não fluxo normal |
| Envelope AES-256-GCM de TTL curto | banco sozinho não recupera plaintext; autenticado | funciona e devolve resultado idêntico | média/baixa | **adotar** |

### 9.3 Construção criptográfica validada

| Parâmetro | Valor testado |
|---|---|
| Biblioteca | `node:crypto` do Node `24.19.0` |
| Algoritmo | AES-256-GCM |
| Chave | 32 bytes, fora do banco |
| Nonce | 12 bytes aleatórios por envelope |
| Authentication tag | 16 bytes |
| AAD | versão do envelope, recibo, Business, operação, versão do fingerprint e expiração |
| Rotação | `envelope_key_version` + keyring no runtime |
| TTL do envelope | 24 horas |
| TTL do recibo | 72 horas |

Round-trip foi exato, dois envelopes do mesmo plaintext tiveram nonces distintos e ciphertext adulterado foi rejeitado pela autenticação GCM.

### 9.4 Expiração e limpeza

Após 24 horas:

- o receipt não tenta criar novo Appointment;
- retorna `409 IDEMPOTENCY_RESPONSE_EXPIRED_ADMIN_REISSUE_REQUIRED`;
- o administrador deve verificar o cliente e rotacionar/reemitir o link, conforme a política já proposta;
- o job de limpeza zera ciphertext, nonce, tag, key version e expiry do envelope;
- o receipt hash/fingerprint permanece até 72 horas para bloquear duplicação.

O ensaio limpou cinco envelopes vencidos e preservou os respectivos recibos/efeitos. Depois de 72 horas, remover o recibo encerra deliberadamente a garantia de deduplicação daquela key; essa fronteira precisa estar documentada no contrato do endpoint.

## 10. Testes negativos e SQLSTATEs

| Negativo | Resultado |
|---|---|
| token aleatório incorreto | resposta uniforme 404 |
| UUID do Appointment como token | mesma resposta uniforme 404 |
| token revogado | mesma resposta uniforme 404 |
| segundo token ativo | SQLSTATE `23505`; transação abortada e conexão recuperada após rollback |
| falha injetada no meio da rotação | rollback; token antigo preservado |
| mutação em Appointment terminal | 409 read-only |
| mesma idempotency key com intenção diferente | 409; nenhum efeito adicional |
| falha antes do commit | nenhum efeito/recibo confirmado |
| ciphertext alterado | autenticação GCM falhou |
| envelope expirado | sem replay do segredo e sem novo efeito; exige reemissão humana |
| query parameter com token | token detectado no request e referrer; opção rejeitada |
| tentativa de encontrar segredo em banco/log/evidência | zero ocorrências em 269 segredos auditados |

## 11. Proteções por camada

| Proteção | PostgreSQL | Application/Persistence | Browser/Delivery |
|---|---:|---:|---:|
| um token ativo por Appointment | partial unique index | transação de rotação | — |
| hash/token não bruto | coluna/check/index de 32 bytes | HMAC + pepper externo | — |
| revogação/rotação atômicas | transação/locks | ordem e caso de uso | — |
| recibo único por Business/op/key | unique + composite FK | HMAC, lock advisory e fingerprint | idempotency key por intenção |
| efeito + recibo atômicos | transação | orchestration | — |
| envelope autenticado | shape/check e ciphertext | AES-GCM/keyring/AAD/TTL | — |
| token fora do request inicial | — | exchange sem logging de body | fragmento |
| URL limpa | — | endpoint de exchange | `history.replaceState` |
| capability curta | — | assinatura/revalidação | cookie HttpOnly/Secure/SameSite/Path |
| cache/referrer | — | headers | obediência do browser |

## 12. Riscos encontrados

1. **XSS antes do exchange:** o bootstrap precisa ler o token. CSP estrita, nenhuma dependência/analytics de terceiros e página mínima são controles essenciais.
2. **Body capture por APM/proxy:** o token transita no corpo do POST de exchange. Logging de request body deve permanecer desabilitado nessa rota; logger por allowlist é obrigatório.
3. **Logs da plataforma não provados:** o harness provou a política local e evitou segredo em URL/log. Redaction específica do runtime de deploy/Vercel não foi executada.
4. **Rotação de pepper:** produção precisa de keyring/versionamento. Sem isso, trocar o pepper invalida tokens/keys existentes ou exige testar múltiplas versões.
5. **Colisão do identificador do advisory lock:** foi usado digest de 64 bits derivado de Business/op/key. O risco é extremamente baixo, mas colisão causaria serialização extra, não efeito duplicado.
6. **Disponibilidade da chave antiga do envelope:** enquanto houver envelope `env-vN`, a versão correspondente deve continuar no keyring. Remover cedo transforma retry legítimo em falha.
7. **Janela de retenção:** 24h/72h é parâmetro técnico candidato, não decisão jurídica. Receipt não deve ser apagado antes da janela pública de retry.
8. **Timing/abuso:** uniformidade de status/corpo foi comprovada, não tempo constante de ponta a ponta. Rate limiting distribuído continua necessário.
9. **Cookie roubado:** continua sendo capability até expirar/revogar; duração curta, `Secure`, `HttpOnly`, SameSite, Path e revalidação limitam o impacto.

## 13. Simplificações possíveis

Simplificações seguras para o MVP:

- usar somente primitives de `node:crypto`; nenhuma biblioteca criptográfica adicional;
- um único endpoint `/manage/exchange` e um único cookie-capability;
- cookie com payload mínimo assinado, sem tabela de sessão separada;
- uma função compartilhada de canonicalização por operação, com versão explícita;
- receipt somente `SUCCEEDED`; lock advisory transacional elimina estado persistido `IN_PROGRESS`;
- envelope em colunas simples (`ciphertext`, `nonce`, `tag`, `key_version`, `expires_at`), sem KMS envelope-encryption adicional no MVP;
- job único que primeiro apaga conteúdo cifrado vencido e depois remove receipts vencidos.

Não são simplificações aceitáveis: query parameter, UUID como segredo, token bruto no receipt, remoção do envelope mantendo a exigência de retry exato, logger de payload completo ou cookie contendo o token bruto.

## 14. Mudanças arquiteturais necessárias

Nenhum documento oficial foi alterado neste spike. A próxima revisão arquitetural deve registrar:

1. HMAC-SHA-256 com peppers separados para management token e idempotency key;
2. protocolo de serialização idempotente por `pg_advisory_xact_lock` transacional antes de ler/criar o receipt;
3. versão concreta da canonicalização por operação (`book-appointment/v1` neste ensaio);
4. shape do envelope: AES-256-GCM, nonce 12, tag 16, AAD, `key_version` e expiry;
5. contrato candidato: envelope 24h, receipt 72h, com reemissão administrativa depois da expiração;
6. cookie-capability `HttpOnly; Secure; SameSite=Strict; Path=/manage; Max-Age=600`, contendo somente referência/versões/exp;
7. keyring/versionamento para pepper, assinatura do cookie e cifra do envelope;
8. requisito explícito de não capturar body/query/cookie nas rotas sensíveis.

O data model conceitual precisa detalhar `envelope_nonce`, `envelope_auth_tag`, `envelope_key_version` e `envelope_expires_at`, ou definir um envelope binário versionado que carregue esses metadados. A evidência favorece colunas explícitas porque permitem constraint de shape e cleanup indexado.

## 15. Itens não provados

- comportamento de logs/redaction em Vercel/Next.js e em eventual APM/CDN de produção;
- matriz Safari/Firefox/mobile; foi exercitado Chromium 151;
- rate limiting distribuído e resistência operacional a brute-force volumétrico;
- rotação real no secret manager e procedimento de disaster recovery das chaves;
- execução do cleanup por scheduler gerenciado e observabilidade do atraso;
- valores jurídicos finais de retenção;
- comportamento além do TTL de 72h como garantia de idempotência — por definição, a garantia termina ali;
- integração com mensagens/WhatsApp, que está fora do MVP deste spike;
- Supabase hospedado, pois nenhuma propriedade testada é específica dele.

Esses itens não contradizem os critérios de PASS locais. Antes de produção, redaction do deploy, key rotation e rate limit precisam de verificação operacional.

## 16. Critérios de PASS

| Critério | Evidência | Estado |
|---|---|---|
| token bruto nunca precisa ser persistido | HMAC no banco; envelope somente cifrado; leak audit zero | PASS |
| lookup/rotação seguros e determinísticos | uniform 404, partial unique, locks e rollback | PASS |
| transporte reduz vazamento | fragmento ausente do GET/referrer, URL limpa, cookie curto | PASS |
| um efeito sob retry/concorrência | 1 Appointment/token/receipt; wait advisory observado | PASS |
| fingerprint determinístico | vetor conhecido + equivalências + payload distinto | PASS |
| retry após commit recupera resultado utilizável | mesmo token/link via AES-GCM; sem segundo efeito | PASS |
| solução proporcional ao MVP | primitives nativas, uma tabela/endpoint/cookie/job | PASS |

## 17. Próxima ação exata

Em uma tarefa separada de governança arquitetural, revisar esta evidência e, se aceita, atualizar **somente então** o ADR-005 de `PROPOSED` para `ACCEPTED`, registrando os oito itens da seção 14 e o contrato de expiração. Não iniciar Sprint 0 nem criar migrations do SaaS antes dessa aceitação.

Este spike encerra aqui.
