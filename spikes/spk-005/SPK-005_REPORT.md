# SPK-005 — Supabase Auth SSR, Session and Security

## Resultado

**PASS**

A estratégia administrativa com Supabase Auth, `@supabase/ssr` e Next.js/Node foi comprovada no limite do ambiente disponível. O fluxo real hospedado demonstrou login por e-mail/senha, rejeição de senha inválida, sessão SSR em request subsequente, refresh com rotação do cookie, logout global, expiração real do JWT, falha de refresh revogado e início de recuperação PKCE. Os testes locais comprovaram cliente SSR por request, separação entre autenticação e autorização de Business, headers contra cache compartilhado, política de cookies e mitigação de CSRF compatível com o comportamento observado do Next.js.

O e-mail de recuperação foi solicitado ao Supabase Auth real e os cookies PKCE foram produzidos, mas a entrega na caixa postal, o clique no link, o exchange do código e a alteração efetiva da senha não foram inspecionados. Esse é o limite externo explicitamente registrado e não invalida o PASS definido para “recovery validada no limite possível do ambiente”.

Nenhum `service_role` foi usado. Nenhuma credencial, token, e-mail, senha, project ref ou valor de cookie foi persistido nas evidências. O `.env.local` usado para o teste foi removido após auditoria.

## Escopo

O trabalho ficou restrito a `spikes/spk-005/`. SPK-001, SPK-002, SPK-004 e SPK-006 não foram reexecutados nem alterados. Documentos oficiais e ADRs não foram modificados; Sprint 0 e o SaaS não foram iniciados.

Fontes de verdade consultadas, sem alteração:

- `BARBER_ARCHITECTURE_v1 (2).md`;
- `BARBER_DATA_MODEL_v1 (3).md`;
- `BARBER_ARCHITECTURE_DECISIONS_v1 (2).md`.

O PASS do SPK-006 foi reutilizado somente como evidência prévia da fronteira de schema privado/runtime. Este spike não repetiu sua matriz.

## Ambiente e versões exatas

| Componente | Versão/comportamento testado |
|---|---|
| Sistema | Windows, `win32 x64` |
| Node.js | `v24.19.0` |
| V8 | `13.6.233.17-node.51` |
| OpenSSL | `3.5.7` |
| `@supabase/ssr` | `0.12.4` |
| `@supabase/supabase-js` | `2.112.3` |
| Next.js | `16.3.2` |
| React / React DOM | `19.2.8` |
| TypeScript | `7.0.2` |
| `tsx` | `4.23.12` |
| pnpm | `11.19.0` |
| Auth remoto | projeto Supabase hospedado descartável |
| JWT expiry observado | aproximadamente 5 minutos; 301 segundos restantes na medição |
| `service_role` | não configurado e não usado |

As dependências foram fixadas sem ranges e o lockfile foi gerado. As versões publicadas podem ser conferidas nas páginas do [`@supabase/ssr`](https://www.npmjs.com/package/@supabase/ssr), [`@supabase/supabase-js`](https://www.npmjs.com/package/@supabase/supabase-js) e [Next.js](https://www.npmjs.com/package/next).

## Método

O harness separa três limites:

1. um factory servidor cria um novo `createServerClient` por request e recebe um cookie jar exclusivo;
2. autenticação chama `auth.getUser()` no servidor e não confia no usuário retornado por `getSession()`;
3. autorização de domínio é um passo posterior, que resolve o Business e compara `admin_auth_user_id` com o usuário autenticado.

O adapter SSR implementa os métodos atuais `getAll` e `setAll`. O segundo argumento de `setAll`, introduzido na versão testada para transportar headers de cache, também é propagado à resposta. O cliente oficial usa PKCE, cookies e rotação de refresh token. A orientação oficial igualmente adverte que `getSession()` lê o storage e não deve fundamentar autorização quando esse storage vem do browser; deve-se verificar a identidade com `getUser()` ou `getClaims()`. Ver [criação do client SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client) e [referência de `getSession()`](https://supabase.com/docs/reference/javascript/auth-getsession).

## Matriz de autenticação e segurança

| Caso | Ambiente | Esperado | Observado | Resultado |
|---|---|---|---|---|
| Login válido | Supabase real | sessão e cookie oficial | usuário e sessão retornados; cookie escrito | PASS |
| Senha inválida | Supabase real | rejeição sem sessão | HTTP/Auth status `400`, código `invalid_credentials`, sessão nula | PASS |
| Sessão ausente | Supabase real | operação admin negada | `AuthSessionMissingError`; aplicação mapeou para `401` | PASS |
| Sessão válida subsequente | Supabase real | nova request reconhece usuário | `getUser()` retornou o mesmo usuário | PASS |
| Refresh explícito | Supabase real | nova sessão e cookie rotacionado | refresh aceito; estado do cookie mudou | PASS |
| Request após refresh | Supabase real | sessão continua válida | `getUser()` passou com cookie rotacionado | PASS |
| Expiração real | Supabase real | `exp` governa access token | claim `exp` igual a `session.expires_at`; espera de `300239 ms` | PASS |
| Refresh revogado após expiração | Supabase real | sessão não recuperável | status `400`, `refresh_token_not_found`, usuário nulo | PASS |
| Logout global | Supabase real | revogar refresh e limpar cookie | Auth aceitou; cookie removido com `Max-Age=0` | PASS |
| Request limpa após logout | Supabase real | não autenticada | usuário nulo | PASS |
| Cookie antigo logo após logout | Supabase real | comportamento registrado, sem suposição | `getUser()` já não retornou usuário | PASS |
| Recovery initiation | Supabase real | request aceita | `resetPasswordForEmail` aceito | PASS no limite |
| Recovery PKCE | Supabase real | code verifier em cookie | três writes oficiais de code verifier observados | PASS |
| Cliente SSR por request | local | nenhuma instância global | 32 clients e 32 jars distintos | PASS |
| Clients simultâneos | Supabase real | sem vazamento entre requests | client autenticado viu usuário; vazio permaneceu sem usuário | PASS |
| Authn válida + authz correta | real/local | Business permitido | status `200` | PASS |
| Authn válida + admin incorreto | real/local | negar outro Business | status `403` | PASS |
| Repositório retorna escopo cruzado | local | falhar fechado | `BUSINESS_SCOPE_INVARIANT_FAILED`, `403` | PASS |
| Resposta autenticada | local/real | impedir cache compartilhado | todos os headers `private/no-store` observados | PASS |
| Origin/Host válido | local | mutação permitida | `ALLOWED` | PASS |
| Origin cruzado | local/real | mutação negada | `ORIGIN_NOT_ALLOWED` | PASS |
| GET como mutação | local | método rejeitado | `MUTATION_METHOD_REQUIRED` | PASS |

## Cookies observados

Nenhum valor de cookie foi registrado. Nomes com o project ref foram redigidos para `sb-<project-ref>-...`.

| Fase | Ação | Path | SameSite | Secure | HttpOnly | Max-Age |
|---|---|---|---|---|---|---|
| login | `SET auth-token` | `/` | `lax` | `true` | `false` | `34560000` s |
| refresh | `SET auth-token` | `/` | `lax` | `true` | `false` | `34560000` s |
| recovery | `SET code-verifier` | `/` | `lax` | `true` | `false` | `34560000` s |
| logout | `DELETE auth-token` | `/` | `lax` | `true` | `false` | `0` |

Contagem do browser simulado: `0` cookies antes do login, `1` após login, `1` após refresh e `0` após logout.

Os defaults reais de `@supabase/ssr@0.12.4` encontrados no pacote instalado são:

- `Path=/`;
- `SameSite=Lax`;
- `HttpOnly=false`;
- `Max-Age=400 dias`;
- `Secure` não é definido pelo default.

Portanto, o factory do produto deve definir `Secure=true` explicitamente em produção. O fluxo padrão testado **não garante `HttpOnly`** e nenhuma afirmação contrária deve permanecer. O `Max-Age` longo do cookie não é o tempo de validade do access token nem da sessão; a validade continua controlada por JWT, refresh token e política do Supabase Auth.

`SameSite=Lax` é adequado ao fluxo testado: reduz envio cross-site e ainda permite a navegação top-level GET do link de recovery. Ele é defesa em profundidade e não substitui verificação de Origin/Host em mutações.

## Refresh, expiration e revogação

O refresh explícito foi aceito pelo Auth real, rotacionou o estado armazenado e a request seguinte permaneceu autenticada. A sessão foi medida contra o claim JWT assinado: `session.expires_at` e `exp` coincidiram.

Depois do logout global:

- o browser que aplicou o `Set-Cookie` de remoção ficou sem sessão imediatamente;
- uma cópia retida do cookie pré-logout também não foi aceita por `getUser()` no teste imediato;
- após ultrapassar `exp`, a mesma cópia não pôde renovar a sessão porque o refresh estava revogado: `refresh_token_not_found`.

Esse resultado não deve ser generalizado como revogação criptográfica instantânea de todo access JWT. Access tokens são stateless e podem continuar aceitos até `exp` por consumidores que validam somente assinatura/claims. A documentação recomenda expiração curta ou validação de `session_id` em operações que exijam revogação estrita. Ver [sessões do Supabase Auth](https://supabase.com/docs/guides/auth/sessions) e [comportamento de sign-out](https://supabase.com/docs/reference/javascript/auth-signout).

Para o MVP testado, operações administrativas usam `getUser()` server-side, autorização de Business e não expõem tabelas de domínio ao browser. Uma verificação adicional de `session_id` no banco não é necessária para o risco atual; pode ser adicionada somente se surgir requisito de revogação imediata mais forte.

## Recovery/reset de senha

`resetPasswordForEmail` foi chamado contra o Auth hospedado com redirect allowlisted e retornou sucesso. O fluxo PKCE oficial escreveu cookies code-verifier com a mesma política de produção. Isso comprova a iniciação real e a preparação SSR para o callback. Ver [referência oficial de reset por e-mail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

Não foram inspecionados:

- entrega do e-mail;
- template e URL recebidos;
- clique no link;
- exchange do código no callback;
- evento `PASSWORD_RECOVERY`;
- `updateUser({ password })` e novo login.

O teste não alterou a senha. A interface futura deve responder de forma neutra ao pedido de recovery para não enumerar contas e deve aplicar rate limiting do Supabase.

## Autenticação × autorização

Autenticação e autorização permaneceram separadas:

1. `auth.getUser()` revalidou a identidade no servidor;
2. o repositório resolveu o Business por `admin_auth_user_id`;
3. o caso de uso comparou novamente o identificador retornado;
4. ausência de sessão resultou em `401`;
5. usuário autenticado sem Business correspondente resultou em `403`;
6. um repositório deliberadamente cruzado também resultou em `403`.

Middleware pode antecipar navegação, mas não é autoridade final. Toda operação administrativa deve repetir esses passos no servidor. `getSession()` pode ser usado tecnicamente para transportar tokens/diagnóstico, nunca para aceitar o usuário do cookie como autorização.

## Browser e tabelas de domínio

O wrapper browser do spike expõe somente ações de Auth e não contém `.from()`, credencial PostgreSQL, `service_role`, resolução de Business ou acesso a schema de domínio. O boundary de schema privado/Data API já havia sido provado no SPK-006 e foi apenas reutilizado como infraestrutura conhecida.

A publishable key no browser é esperada para Auth; ela não é credencial de banco do runtime. O `service_role` continua proibido no browser e não foi necessário no servidor para este spike.

## Cache

O `setAll` oficial de `@supabase/ssr@0.12.4` forneceu:

```text
Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0
Expires: 0
Pragma: no-cache
```

O adapter preservou esses headers e a aplicação acrescentou:

```text
CDN-Cache-Control: private, no-store
Vercel-CDN-Cache-Control: private, no-store
Vary: Cookie
```

Assim, respostas que autenticam, atualizam ou transportam cookies não podem ser compartilhadas por browser cache, CDN ou Vercel cache. O adapter não pode ignorar o segundo argumento de `setAll`.

## CSRF e comportamento do Next.js

O guard de Route Handler exige:

- método mutável explícito (`POST`, `PUT`, `PATCH` ou `DELETE`);
- `Origin` presente e parseável;
- HTTPS em produção;
- Origin em allowlist;
- Host em allowlist;
- igualdade entre Origin host e Host/X-Forwarded-Host confiável;
- nunca executar mutação por GET.

Foram testados oito casos positivos e negativos, incluindo host injection, Origin cruzado, Origin ausente, mismatch, HTTP em produção e forwarded host.

No código instalado do Next.js `16.3.2`, Server Actions usam `POST`, comparam Origin a Host/X-Forwarded-Host, abortam mismatch e marcam fetch como `default-no-store`. Contudo, request sem Origin apenas gera warning e segue. Portanto, Route Handlers do MVP aplicam regra mais estrita e não presumem que o framework rejeita Origin ausente. A documentação do Next.js confirma a comparação Origin/Host e o papel de `allowedOrigins`: [Data Security](https://nextjs.org/docs/app/guides/data-security) e [configuração de Server Actions](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions).

`X-Forwarded-Host` só deve ser confiado no deploy atrás do proxy conhecido da plataforma; a allowlist de hosts evita transformar um header controlável em autoridade.

## Cliente SSR por request

O source contém um único ponto de construção de `createServerClient`, dentro do factory invocado por request. Não existe singleton de client ou cookie jar.

Provas:

- 32 clients locais simultâneos resultaram em 32 objetos e 32 jars distintos;
- cada jar manteve somente seu próprio sentinel;
- no Auth real, clients paralelos com cookie autenticado e vazio mantiveram estados diferentes;
- o client vazio nunca observou o usuário do client autenticado.

O factory deve continuar sendo chamado em middleware/proxy, Route Handler, Server Action ou render servidor por request. O browser client pode ter ciclo de vida de browser, mas isso não autoriza singleton SSR global.

## Evidências

- [`evidence/SPK-005_LOCAL_EVIDENCE.json`](evidence/SPK-005_LOCAL_EVIDENCE.json): 18 casos locais, defaults reais do pacote, Next.js, cache, CSRF, authz e clients concorrentes;
- [`evidence/SPK-005_REMOTE_EVIDENCE.json`](evidence/SPK-005_REMOTE_EVIDENCE.json): Auth hospedado real, cookies redigidos, login, refresh, expiration, logout, recovery e authz;
- `scripts/run-local-spike.ts`: matriz determinística local;
- `scripts/run-remote-spike.ts`: matriz hospedada, guarda destrutiva e redação;
- `src/server/request-client.ts`: factory request-scoped e política explícita de cookie;
- `src/server/authorization.ts`: revalidação e autorização do Business;
- `src/server/cache-policy.ts`: headers de resposta autenticada;
- `src/server/csrf.ts`: método/Origin/Host;
- `src/server/next-response.ts`: propagação de cookies e headers oficiais;
- `src/browser/admin-auth.ts`: superfície browser limitada a Auth.

## Limitações e riscos

1. **`@supabase/ssr` continua em major zero.** A API pode mudar; fixar versão e revisar changelog antes de atualizar.
2. **Cookies não são HttpOnly.** Um XSS no origin pode alcançar tokens. CSP, ausência de HTML arbitrário, escaping, dependências fixadas e revisão de scripts de terceiros permanecem essenciais.
3. **`Secure` não é default.** O ambiente de produção precisa configurá-lo explicitamente e testar a serialização final.
4. **Resposta precisa permanecer mutável durante refresh.** Se `setAll` ocorrer após commit, o novo refresh token se perde e surgem loops/terminações antecipadas.
5. **Requests paralelas com o mesmo refresh token exigem cuidado.** Middleware/proxy deve refrescar uma vez e propagar a request/response cookie; a janela de reutilização do Supabase reduz, mas não elimina, problemas de implementação.
6. **Access JWT é stateless.** Logout revoga refresh/sessão, mas consumidores que só validam JWT podem aceitar o access token até `exp`.
7. **Recovery depende de e-mail e redirect.** Template incorreto, redirect fora da allowlist, rate limit ou provedor de e-mail podem quebrar a conclusão mesmo com initiation aceita.
8. **Proxy/host.** Confiar indiscriminadamente em `X-Forwarded-Host` permite host spoofing; manter allowlist por ambiente.
9. **Cookie Max-Age não é session lifetime.** Não usar os 400 dias como política de segurança.
10. **Global logout afeta todas as sessões do usuário.** A UI deve decidir conscientemente entre `local` e `global`; o spike usou global para testar revogação.
11. **Logs do SDK.** O SDK escreveu o erro esperado de refresh revogado no stderr. Observabilidade deve aplicar allowlist/scrubbing e não registrar payloads, cookies ou e-mails.

## Mudanças arquiteturais necessárias

**Nenhuma mudança fundamental na estratégia proposta é necessária.** Supabase Auth + `@supabase/ssr` é compatível com o runtime e com o MVP de um único administrador.

Precisões obrigatórias para a implementação futura:

- criar server client e adapter de cookies por request;
- implementar `getAll` e `setAll` atuais e propagar cookies **e** headers retornados pelo pacote;
- definir `Secure=true`, `SameSite=Lax`, `Path=/` e reconhecer `HttpOnly=false` no modelo padrão;
- chamar `getUser()` ou `getClaims()` antes de produzir a resposta; nunca autorizar pelo user de `getSession()`;
- resolver Business por `admin_auth_user_id` e comparar novamente no caso de uso;
- aplicar `private/no-store` ao browser, CDN e Vercel, com `Vary: Cookie`;
- usar mutações não-GET e validação estrita de Origin/Host em Route Handlers;
- manter `serverActions.allowedOrigins` mínimo e não assumir que Origin ausente é rejeitado;
- tratar logout como revogação de refresh/sessão, com janela do access JWT documentada;
- manter recovery em PKCE com redirect allowlisted, resposta neutra e callback server-side;
- fixar versões e repetir esta matriz em upgrades de Next.js, Supabase SSR ou Supabase JS.

Não é necessário introduzir Auth próprio, NextAuth/Auth.js, RBAC, RLS multi-tenant ou modelo HttpOnly server-only no MVP. Uma mudança futura para cookies HttpOnly exigiria a decisão arquitetural separada já prevista.

## Itens não provados

- entrega e conteúdo do e-mail de recovery;
- exchange do link/código PKCE e alteração final da senha;
- novo login com senha redefinida;
- deployment real na Vercel, comportamento do CDN e headers após todos os proxies;
- Server Action end-to-end por HTTP; o spike executou `NextResponse` real e inspecionou o handler instalado da versão exata;
- middleware/proxy de uma aplicação completa, pois o SaaS não foi implementado;
- corrida de múltiplos refreshes usando exatamente o mesmo cookie expirado;
- resistência a XSS/CSP de uma UI real;
- validação adicional de `session_id` em `auth.sessions` para revogação instantânea forte;
- MFA, OAuth, passkeys, convite, equipe ou RBAC, todos fora do MVP;
- políticas de rate limit e entregabilidade do provedor de e-mail em produção.

Nenhum item não provado contradiz os critérios de PASS delimitados para o spike.

## Próxima ação exata

Encerrar o SPK-005 como **PASS**. Em uma tarefa separada e explicitamente autorizada de governança, registrar esta evidência junto à decisão administrativa de Auth e incorporar as precisões de implementação acima. Quando o módulo administrativo for implementado futuramente, transformar as matrizes local e remota em regressão automatizada, acrescentando um teste assistido de callback completo de recovery e um teste HTTP no deploy de preview. Não iniciar Sprint 0 nem alterar ADRs como parte deste spike.

