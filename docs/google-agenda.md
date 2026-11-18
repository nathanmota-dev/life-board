# Google Agenda

[← Guia da documentação](guide.md)

O Life Board se conecta ao Google Agenda com OAuth 2.0. O Google não tem um token
pessoal como o do GitHub, então cada pessoa cria o próprio cliente OAuth no Google
Cloud e cola o ID e a chave secreta dele em **Configurações > Google Agenda**. Nada
disso vai para o repositório ou para o binário.

Por enquanto, a conexão só liga e desliga a conta: os eventos do Google ainda não
aparecem na Agenda.

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
- **Desconectar** revoga o acesso no Google e apaga o refresh token e o e-mail. O ID
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
