# Google Agenda

[← Guia da documentação](guide.md)

O Life Board se conecta ao Google Agenda com OAuth 2.0. O Google não tem um token
pessoal como o do GitHub, então cada pessoa cria o próprio cliente OAuth no Google
Cloud e cola o ID e a chave secreta dele em **Configurações > Google Agenda**. Nada
disso vai para o repositório ou para o binário.

Depois de conectada, os eventos da agenda principal aparecem no Calendário do Life
Board e se mantêm atualizados (veja [Importação dos eventos](#importação-dos-eventos)).
Por enquanto eles são **somente leitura** no Life Board.

## Criar as credenciais no Google Cloud

Faça uma vez, com a conta do Google que você vai conectar.

1. Abra o [console do Google Cloud](https://console.cloud.google.com/) e crie um
   projeto (por exemplo, `Life Board`) no seletor de projetos do topo.
2. Em **APIs e serviços > Biblioteca**, procure **Google Calendar API** e clique em
   **Ativar**.
3. Em **APIs e serviços > Tela de consentimento OAuth** (ou **Google Auth
   Platform**):
   - escolha o tipo de usuário **Externo**;
   - preencha o nome do app e os e-mails de contato;
   - em **Acesso a dados** (escopos), adicione
     `https://www.googleapis.com/auth/calendar.events`;
   - em **Público-alvo**, clique em **Publicar app** para mudar o status para
     **Em produção**. Para uso pessoal não é preciso pedir a verificação do Google:
     no login, o Google avisa que o app não foi verificado, e você continua em
     **Avançado > Acessar Life Board (não seguro)**.
4. Em **APIs e serviços > Credenciais**, clique em **Criar credenciais > ID do
   cliente OAuth**, escolha o tipo **App para computador** e dê um nome.
5. Copie o **ID do cliente** (termina com `.apps.googleusercontent.com`) e a
   **chave secreta do cliente**.

> Deixe a tela de consentimento **Em produção**. No status **Em teste**, o Google
> expira o refresh token depois de 7 dias, e o Life Board pede para reconectar.

## Conectar a conta

1. No Life Board, abra **Configurações > Google Agenda**.
2. Cole o **ID do cliente** e a **chave secreta do cliente** e clique em **Salvar
   credenciais**. Os dois ficam cifrados neste computador, e a chave secreta não
   volta a ser exibida.
3. Clique em **Conectar Google Agenda**. O login abre no seu navegador padrão, onde
   você normalmente já está conectado ao Google: escolha a conta e aprove o acesso.
4. O navegador mostra "Conectado. Você pode voltar ao Life Board." e as
   Configurações passam a mostrar a conta, sem nenhum clique no app.

Se você negar o acesso, o navegador mostra uma página de erro e o app volta a
oferecer **Conectar Google Agenda**. O login espera até 10 minutos; depois disso,
ou se você clicar em **Cancelar**, uma resposta atrasada do Google é recusada.

## Reconectar, desconectar e trocar as credenciais

- **Reconectar** aparece quando o Google deixa de aceitar a autorização salva (por
  exemplo, depois de remover o acesso na sua conta do Google ou de 7 dias com a tela
  de consentimento em teste).
- **Desconectar** revoga o acesso no Google, apaga o refresh token e o e-mail e
  **remove os eventos importados**; os eventos criados no Life Board continuam. O ID
  e a chave secreta continuam salvos, então reconectar é um clique.
- **Trocar credenciais** apaga o ID e a chave secreta, para colar os de outro
  cliente.

## Como funciona

- Fluxo **authorization code com PKCE** (`S256`), para cliente do tipo **App para
  computador**. O app pede só o escopo `calendar.events`; o e-mail da conta vem do
  `id` da agenda principal (`GET /calendar/v3/calendars/primary`).
- O login abre no navegador padrão (`shell.openExternal`), nunca numa janela do
  Electron: o Google bloqueia OAuth em webviews embutidas, e a RFC 8252 recomenda o
  navegador do sistema para apps nativos.
- O Google devolve o navegador para a API local, em
  `http://127.0.0.1:<porta>/api/google/oauth/callback`. O Google aceita qualquer
  porta de loopback para clientes de computador, então a porta aleatória da API
  funciona.
- O ID e a chave secreta do cliente e o refresh token ficam cifrados com AES-256-GCM
  na tabela `google_settings`, como o token do GitHub (veja
  [Backend](backend.md)). O access token fica só na memória e é renovado 60 segundos
  antes de expirar.
- Só a agenda **principal** da conta é usada.

## Cliente da API do Google Agenda

`services/google_calendar_client.rs` concentra as chamadas à Calendar API v3, como
o cliente do GitHub: o trait `GoogleCalendarApi` permite um fake nos testes,
`with_base_url` aponta para o `wiremock`, e, com a feature `e2e`,
`LIFE_BOARD_E2E_GOOGLE_URL` troca o host pelo servidor falso
`e2e/support/google-server.cjs`. Cada chamada recebe o access token, que só vai no
cabeçalho `Authorization`. O cliente não renova o token nem repete pedidos; quem
decide é a sincronização.

- **Listagem**: `GET /calendars/{id}/events` com `singleEvents=true` (o Google já
  expande os eventos recorrentes em ocorrências), `showDeleted=true`, `timeMin`,
  `timeMax` e `maxResults=250`, seguindo o `nextPageToken` até o fim.
- **Escrita**: `POST` cria, `PATCH` com `If-Match: <etag>` altera e `DELETE` remove.
- **Erros**: `Unauthorized` (401), `Conflict` (412), `Gone` (404 ou 410 ao alterar
  ou remover), `RateLimited` (429 ou 403 `rateLimitExceeded`/`userRateLimitExceeded`),
  `Http` e `Network`.
- **Eventos de dia inteiro**: o Google manda `start.date` e um `end.date`
  **exclusivo**. O Life Board guarda, como o formulário (`valuesToEventInput`) e a
  visão do calendário, a meia-noite local do primeiro dia e a do **último** dia: de
  `2026-10-12` a `2026-10-13` no Google é um dia só, com `startAt == endAt`. As datas
  são lidas no fuso local, qualquer que seja o fuso da agenda no Google.
- **Eventos com horário**: `dateTime` em RFC 3339 com offset, enviado sem
  `timeZone`.
- **Cores**: as 11 cores de evento do Google (`colorId` de "1" a "11") viram hex;
  sem `colorId`, o evento fica com a cor padrão. Na volta, a cor guardada vai para o
  `colorId` mais próximo pela distância RGB, como `colorName` no frontend.
- Convidados, lembretes, anexos e videoconferência não são lidos nem enviados, e
  `linkedTaskIds`/`linkedThoughtIds` ficam só no Life Board.

## Vínculo dos eventos com o Google

A migration `0010_calendar_event_source` acrescenta a `calendar_events` as colunas
que ligam um evento ao Google. Perfis antigos migram com todos os eventos `local` e
as demais colunas `NULL`.

| Coluna | Significado | Na API |
| --- | --- | --- |
| `source` | Onde o evento nasceu: `local` ou `google`. Nunca muda. | `source` |
| `external_id` | Id do evento no Google; `NULL` se não está vinculado. | interno |
| `external_calendar_id` | Id da agenda no Google (o e-mail da agenda principal). | interno |
| `external_etag` | Último `etag` visto, enviado como `If-Match` ao alterar. | interno |
| `external_updated_at` | `updated` do Google, em milissegundos. | interno |
| `external_url` | `htmlLink` do Google, para "Abrir no Google Agenda". | `externalUrl` |
| `recurring_event_id` | `recurringEventId` de uma ocorrência de evento recorrente. | `recurringEventId` |
| `sync_state` | `NULL`, `pending_create`, `pending_update` ou `pending_delete`: o que falta enviar. | `syncState` |

- Um índice único em `(external_calendar_id, external_id)`, só onde `external_id` não
  é `NULL`, impede que uma importação duplique um evento. Outro índice, em
  `sync_state` onde não é `NULL`, serve à fila de envio.
- `createEventBody` e `updateEventBody` não aceitam esses campos: só os serviços de
  sincronização os gravam, com `upsert_external` e `find_by_external`
  (`db/schema/calendar.rs`).
- Os testes golden descartam os quatro campos públicos novos da resposta antes de
  comparar com as gravações da API Node 1.1.2, que continuam intactas.

## Importação dos eventos

`services/google_calendar.rs` (e `google_calendar/import.rs`) lê a agenda principal
e grava os eventos em `calendar_events`, como `services/github/sync.rs` faz com o
GitHub: registra `last_sync_at` ou `last_sync_error` em `google_settings`, e uma
falha no meio não apaga o que já estava salvo.

- **Janela**: do início do dia local de 30 dias atrás até 365 dias à frente. Linhas
  fora da janela ficam como estão.
- **Quando sincroniza**: logo depois de conectar; 10 segundos depois que a API
  inicia, se houver conta conectada; a cada **15 minutos** enquanto o app roda; e em
  **Sincronizar agora**, em Configurações > Google Agenda
  (`POST /api/google/sync`, `409 not_connected` sem conta). Com a feature `e2e`,
  `LIFE_BOARD_E2E_GOOGLE_SYNC=off` desliga o ciclo para os testes serem
  determinísticos.
- **Uma sincronização por vez**: um segundo pedido espera a que está rodando e
  devolve o mesmo resultado.
- **Leitura completa**: cada sincronização lê a janela inteira (ainda sem
  `syncToken`) e grava tudo em **uma transação** com `upsert_external`. Só depois de
  **todas as páginas** chegarem, os eventos `google` cujo início está na janela e
  que o Google não devolveu são removidos. Uma sincronização que falha no meio não
  remove nada.
- **Cancelados e removidos**: `status = cancelled` (inclusive uma ocorrência
  cancelada de um evento recorrente) remove a linha com `deleted_at`, como uma
  exclusão local. Se o Google devolver o evento de novo, o `upsert` limpa
  `deleted_at`.
- **Sem título**: o evento é guardado com título vazio, e o calendário mostra "Sem
  título"/"No title".
- **Pendências**: antes de ler a agenda, cada sincronização envia as mudanças
  pendentes (veja "Envio dos eventos"). As linhas que ainda têm `sync_state` depois
  disso (o Google falhou, ou a linha está esperando) são ignoradas pela importação e
  não são removidas por "o Google não devolveu".
- **Vinculados**: eventos criados no Life Board e já enviados também são atualizados
  e removidos pela importação, como os importados.
- **Erros**: `401` renova o token uma vez (`GoogleService::access_token()`) e repete;
  autorização recusada (`ReauthRequired`) interrompe e as Configurações passam a
  oferecer **Reconectar**; limite de requisições ou falha de rede interrompem,
  gravam `last_sync_error` e esperam o próximo intervalo.
- **Editáveis**: eventos do Google podem ser movidos, redimensionados, editados e
  excluídos no Life Board (não existe mais `409 read_only_event`). Os detalhes
  mostram "Google Agenda" e **Abrir no Google Agenda** (`externalUrl`, liberado em `app:open-external` para
  `https://www.google.com/calendar/` e `https://calendar.google.com/`).
- **Desconectar** (e `reset_secrets`) apaga de verdade as linhas `google` e limpa os
  campos de vínculo e o `sync_state` das linhas `local`.
- **Calendário aberto**: a tela consulta `GET /api/google/status` a cada 60 segundos
  e recarrega os eventos quando `lastSyncAt` muda. Um aviso com atalho para as
  Configurações aparece quando `reauthRequired` ou `lastSyncError` estão preenchidos.
- **Dashboard**: eventos importados contam no painel e nas estatísticas como os locais.

## Envio dos eventos

Com a conta conectada, o que você faz no Life Board chega ao Google em segundos.

- **Primeiro o local**: `POST`, `PATCH` e `DELETE /api/calendar/events` gravam na hora,
  marcam `sync_state` e respondem **sem esperar o Google**. A tela não trava nem falha
  sem rede.
- **O que vai**: eventos criados **depois de conectar** (`pending_create`) e todo
  evento vinculado (`pending_update`, `pending_delete`). Eventos criados antes de
  conectar ficam só locais, e editá-los não os envia. Campos enviados: título,
  descrição, local, início, fim, dia inteiro e cor (`to_google`). Tarefas e
  pensamentos vinculados ficam só no Life Board, e mudar só eles não envia nada.
- **O trabalhador** (`google_calendar/export.rs`): é acordado a cada mudança (um
  `Notify` compartilhado entre o serviço de calendário e o de sincronização) e também
  roda no começo de toda sincronização, antes da importação. Divide a trava de
  "uma sincronização por vez", então enviar e importar nunca se sobrepõem. Envia por
  ordem de alteração.
- **Junção de edições**: várias edições do mesmo evento antes do envio viram um só
  `PATCH` com os últimos valores; editar um `pending_create` continua
  `pending_create`; excluir um `pending_create` descarta o evento sem chamar o Google.
- **Sem sobrescrever o mais novo**: o resultado de um envio só é gravado na linha se
  ela não mudou durante o pedido (`updated_at`, `deleted_at` e `sync_state`). Se mudou,
  a linha continua pendente e o resultado útil (o vínculo de um evento recém-criado ou
  o novo `etag`) é guardado, para não duplicar nem tomar `412` à toa.
- **Conflitos**: o `PATCH` leva `If-Match` com o `external_etag`. No `412`, o evento é
  buscado no Google (`GET`), sobrescreve a linha local, `sync_state` é limpo e
  `GET /api/google/status` passa a trazer `lastConflict` (`title`, `at`): **o Google
  vence**. O aviso fica só em memória e some ao reiniciar.
- **Apagado do outro lado**: `404`/`410` no `PATCH` apaga o evento localmente; no
  `DELETE`, conta como sucesso.
- **Falhas**: `401` renova o token uma vez. Limite de requisições, rede e `5xx` mantêm
  o `sync_state` e tentam de novo com espera de 1, 5 e 15 minutos por evento (em
  memória; zera ao reiniciar); limite de requisições e rede interrompem a rodada.
  **Sincronizar agora** ignora essa espera. Um `4xx` de corpo inválido limpa o
  `sync_state` e grava em `last_sync_error` o título do evento, em vez de repetir
  para sempre.
- **Ocorrências**: o id guardado é o da ocorrência, então editar ou excluir uma
  ocorrência muda só ela (o Google guarda uma exceção). "Esta e as seguintes" e a
  edição da série não existem; os detalhes dizem "As alterações valem só para esta
  ocorrência."
- **Desconectar** descarta as pendências: os eventos locais continuam, desvinculados.
- **Na tela**: eventos com `syncState` mostram uma marca "Ainda não sincronizado" e a
  agenda recarrega a cada 3 segundos enquanto houver pendência. Configurações mostra
  quantas mudanças aguardam envio e, quando o Google venceu, qual evento; um aviso
  também aparece uma vez no calendário.
- Com a feature `e2e`, `LIFE_BOARD_E2E_GOOGLE_SYNC=off` desliga só a sincronização
  periódica: o envio de mudanças continua.
