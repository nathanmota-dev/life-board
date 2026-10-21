# Atualizações do aplicativo

[← Guia da documentação](guide.md)

**Configurações → Atualizações** mostra a versão instalada, a última verificação
bem-sucedida e os detalhes da versão disponível. A indicação no cabeçalho continua
visível fora das configurações. A notificação nativa abre `/settings?tab=updates`,
inclusive quando a inicialização foi oculta na bandeja.

## Verificação e consentimento

O processo principal cria um único serviço após `app.whenReady()`. Na primeira
execução empacotada, verifica sem bloquear a abertura. Depois, verifica a cada
24 horas enquanto estiver aberto, incluindo na bandeja. Não existe tarefa do
sistema operacional enquanto o aplicativo está fechado. Uma verificação vencida
acontece na próxima abertura.

`userData/updates.json` guarda tentativas e sucessos separadamente, o próximo
horário, a versão anunciada e a última versão disponível. A gravação usa arquivo
temporário e renomeação. Falhas usam intervalos de 5 minutos, 30 minutos e 2 horas;
após essas tentativas, voltam ao intervalo diário. O agendamento persiste entre
reinicializações. A verificação manual continua disponível e requisições
concorrentes compartilham a operação em andamento. Cada requisição de metadados
tem limite absoluto de 30 segundos; downloads usam o timeout de inatividade do
`electron-updater` e podem ser repetidos pelo usuário. Nos drivers nativos, o
download também tem limite total de 10 minutos; cada etapa de instalação nativa
tem limite de 2 minutos e remove seus próprios listeners ao terminar ou falhar.

A descoberta nunca inicia download ou instalação automaticamente. **Baixar
atualização** baixa e verifica o pacote. **Instalar e reiniciar** pede confirmação
antes de iniciar a instalação. Fechar a janela ou sair normalmente não instala
um download pendente (`autoInstallOnAppQuit=false`). O snapshot continua no
processo principal ao trocar de aba, navegar ou reabrir a janela. Após reiniciar
o processo, a disponibilidade é restaurada e o download pode reutilizar o cache
verificado do updater.

## Formatos e instalação

O updater reconhece Windows x64 instalado via NSIS, apps macOS Intel/Apple Silicon
e Linux DEB/AppImage x64 e ARM64. A publicação dos novos alvos depende dos workflows
#29–#30 e da release central #31; as releases Linux existentes continuam x64.
`APPIMAGE` identifica um AppImage; `resources/package-type=deb`, gerado pelo electron-builder, identifica DEB.
No Windows, exige `app-update.yml` e o desinstalador NSIS ao lado do executável;
no macOS, exige um bundle `.app` com `app-update.yml`. Builds de desenvolvimento,
prévia no navegador, Windows portátil/desempacotado, lojas, Snap e Flatpak
mostram indisponibilidade.
O atualizador não usa o token da integração GitHub do usuário.

- **DEB:** `DebUpdater` do `electron-updater` resolve o feed e baixa o pacote.
  Após verificar SHA-512 novamente, o processo principal executa
  `/usr/bin/pkexec --disable-internal-agent /usr/bin/apt-get install --yes --no-remove <pacote>`
  com argumentos separados, sem shell. O agente de autorização do ambiente pede
  autenticação. O apt resolve as dependências em uma operação. Cancelamento ou
  recusa mantém o app aberto, mostra erro recuperável e permite tentar novamente.
  Não há fallback que tente outra elevação após recusa. O aplicativo permanece
  no usuário normal; nenhuma senha passa pelo React.
- **AppImage:** `AppImageUpdater` resolve e verifica o download. O instalador copia
  o arquivo para o mesmo diretório do executável existente, verifica novamente,
  sincroniza e faz uma renomeação atômica. Isso conserva exatamente o caminho e
  os atalhos/autostart, incluindo
  `~/.local/opt/life-board/life-board.AppImage`. Falhas de checksum ou escrita antes
  da renomeação conservam o executável anterior. Tanto o arquivo quanto o
  diretório precisam permitir escrita pelo usuário.

- **Windows (NSIS):** `NsisUpdater` conserva o download, a validação de assinatura
  configurada pelo builder, os argumentos do instalador e a elevação nativos.
  O adaptador aguarda o lançamento do instalador antes de iniciar a saída; falhas
  assíncronas de lançamento são recuperáveis. O próprio NSIS abre a nova versão
  (`--force-run`); não há um segundo `app.relaunch()`. Instaladores web ficam
  desabilitados, conforme o contrato de empacotamento. A confirmação/recusa de
  UAC depois do lançamento do instalador precisa ser validada no Windows assinado.
- **macOS:** `MacUpdater` baixa o ZIP, conservando seu cache e proxy local do
  Squirrel.Mac. Somente após confirmar **Instalar e reiniciar**, o adaptador pede
  o staging nativo e aguarda `update-downloaded`, incluindo a validação da
  assinatura. Erros de assinatura impedem a saída e pedem outro download. Depois
  do staging, `quitAndInstall()` faz a única reinicialização. Não se instala um
  callback de reinício antes de o staging terminar, evitando reinícios tardios
  após um erro/timeout e durante um retry.

Os drivers nativos usam o arquivo e eventuais auxiliares registrados pelo cache da
biblioteca, em vez de assumir que o retorno de `downloadUpdate()` tem um único
arquivo ou que seu primeiro caminho corresponde ao payload. Os checksums são
conferidos após o download e antes da instalação. Os validadores de assinatura
da biblioteca e do sistema não são substituídos.

A instalação DEB exige `apt-get`, `pkexec`, um serviço PolicyKit e um agente de
autorização na sessão do desktop. O DEB declara `apt`, `pkexec | policykit-1` e
`libsecret-1-0`, além das bibliotecas do Electron. O desktop precisa disponibilizar um chaveiro
(libsecret/KWallet) e seu próprio agente de autorização. Ambientes sem agente
recebem um erro recuperável. `electron-updater` 6.8.9 é dependência de runtime,
compatível com electron-builder 26.x.

Após uma instalação Linux bem-sucedida, `app.relaunch()` agenda uma única abertura
e `app.quit()` passa pelo ciclo normal de saída. No Windows/macOS, a biblioteca
nativa controla a reinicialização. O ciclo de fechamento libera as janelas antes
do `before-quit` do Squirrel, mesmo com segundo plano ou pomodoro ativo. Antes
disso, o pomodoro grava um snapshot de recuperação de uso único: sessões
pausadas continuam pausadas, sessões em execução retomam o tempo
restante. O tempo da reinicialização fica suspenso. O snapshot é consumido na
abertura seguinte; uma saída comum mantém o comportamento anterior do timer.
Falhas no handoff removem o snapshot e restauram a interceptação de fechamento
para a bandeja. O serviço aguarda `will-quit` e captura erros assíncronos até a
saída, sem anunciar uma instalação concluída antes da versão nova abrir.

O diretório `userData` não muda: banco, uploads, chave criptografada, preferências
e configuração de inicialização continuam no mesmo lugar. No macOS, mantenha
`appId`, nome do app e identidade Developer ID entre versões, inclusive nos dois
alvos de CPU, para preservar o acesso ao Keychain. No Windows, conserve o diretório
de instalação e o executável NSIS usados pelo item de login (`--hidden`). O updater
não regrava chaves, preferências nem itens de login.

## Contrato do feed

A configuração de produção é GitHub Releases público:
`nathanmota-dev/life-board`, canal `latest`, somente versões estáveis. O updater
compara versões semânticas e não oferece pré-lançamentos ou downgrades. A escolha
do arquivo é filtrada antes da lógica de fallback da biblioteca: extensão e
arquitetura devem corresponder à instalação. DEB nunca troca para AppImage.

O electron-builder gera `app-update.yml` no pacote e `latest-linux.yml` junto aos
artefatos x64. Para ARM64, usa `latest-linux-arm64.yml`. O feed precisa manter a
lista `files`, os nomes dos artefatos, tamanhos e os hashes SHA-512 gerados juntos.
Os nomes configurados são `life-board_${version}_${arch}.deb` e
`life-board-${version}-${arch}.AppImage`; o builder normaliza x64 para `amd64` em
DEB e `x86_64` em AppImage. O seletor também aceita
`x64`; ARM64 aceita `arm64` e `aarch64`.

Windows lê `latest.yml` e seleciona exclusivamente
`life-board-<versão>-win-x64.exe`. macOS lê o `latest-mac.yml` combinado definido em
[Empacotamento multiplataforma](multiplataforma.md#feed-do-macos) e seleciona o ZIP
`life-board-<versão>-mac-x64.zip` ou `life-board-<versão>-mac-arm64.zip`. Apple Silicon
sob Rosetta usa arm64, como o `MacUpdater` instalado. Um feed somente Intel não
pode servir como fallback em Apple Silicon. DMG é para instalação inicial, não
payload de atualização. Nenhum driver nativo executa APT/PolicyKit ou troca AppImages.

O [workflow de release](releases.md) publica uma única release com os quatro alvos.
DEB, AppImage e `latest-linux.yml` continuam saindo de um único build x64, então o
feed Linux mantém os dois formatos e é publicado sem alteração, como na 1.0.0.
`latest.yml` vem do build Windows, e os feeds dos dois builds Mac são combinados em
um `latest-mac.yml` estruturado, sem sobrescrever a lista de uma arquitetura com a
de outra. Todos os feeds são conferidos antes do rascunho, antes da publicação e,
sem token, depois dela. Não publique releases fictícias para testar.

As notas são exibidas como texto, sem HTML da rede. O link de release é construído
para este repositório. O renderer recebe somente estado e ações fixas; não pode
definir URLs de download, provedor, caminhos ou comandos de instalação.

## Recuperação

Falhas de rede, timeout, rate limit, release inexistente, metadados inválidos e
pacotes incompatíveis mostram erro; nunca são apresentados como “atualizado”.
A data exibida continua sendo a última verificação bem-sucedida. A indicação de
uma versão já descoberta continua acessível durante falhas temporárias.

Após falha de integridade, baixe novamente. Após recusar autorização, tente
**Instalar e reiniciar** outra vez quando desejar. Erros de instalação do apt
exigem corrigir as dependências ou o estado do gerenciador de pacotes. Problemas
de gravação exigem espaço e permissões no diretório de dados ou do AppImage.

## Testes com pacotes controlados

Execute as verificações da issue: `npm ci`, `npm run typecheck`, `npm test`,
`npm run test:coverage`, `npm run build` e `npm run package:linux`. O último gera DEB,
AppImage e metadados; não publique os artefatos de teste.

Para o teste real, use um desktop Linux descartável com chaveiro desbloqueado e
agente PolicyKit. Prepare duas versões locais, por exemplo `0.99.0` e `0.99.1`,
sem alterar a versão de produção. Um arquivo de configuração CommonJS temporário
pode herdar a configuração do repositório e substituir somente o feed/versão:

```js
module.exports = {
  extends: `${process.cwd()}/desktop/electron-builder.yml`,
  publish: [{ provider: "generic", url: "http://127.0.0.1:8957/", channel: "latest" }],
  extraMetadata: { version: process.env.LIFE_BOARD_TEST_VERSION },
  directories: { output: `/tmp/life-board-test/${process.env.LIFE_BOARD_TEST_VERSION}` },
}
```

Depois de `npm run build`:

```bash
LIFE_BOARD_TEST_VERSION=0.99.0 npx electron-builder --config /tmp/life-board-fixture.cjs --linux AppImage deb --publish never
LIFE_BOARD_TEST_VERSION=0.99.1 npx electron-builder --config /tmp/life-board-fixture.cjs --linux AppImage deb --publish never
python3 -m http.server 8957 --bind 127.0.0.1 --directory /tmp/life-board-test/0.99.1
```

1. Instale o DEB antigo no desktop descartável. Abra como usuário normal. Verifique
   descoberta automática e download do DEB novo. Crie uma tarefa, um upload e
   configure autostart/background; registre o estado e a chave criptografada.
2. Cancele a autorização: confirme erro, mesma versão instalada e app aberto.
   Tente novamente, autentique e confirme pacote novo, uma única reabertura,
   dados legíveis, autostart preservado e pomodoro pausado/em execução restaurado.
3. Repita com o AppImage antigo no caminho estável documentado. Verifique que o
   novo executável ocupa exatamente o mesmo caminho e que menu/autostart continuam
   apontando para ele. Um ambiente sem FUSE pode usar `APPIMAGE_EXTRACT_AND_RUN=1`.
4. Teste feed offline, YAML inválido/ausente, arquitetura errada, checksum incorreto
   e caminho sem permissão. Nenhum desses casos pode reiniciar ou apagar o app.
5. Examine PT/EN, temas claro/escuro, largura de 640 px, foco por teclado,
   confirmação, progresso, retomada da janela e notificação nativa. Para inspecionar
   com CDP, habilite a porta de depuração somente no desktop descartável.

### Windows e macOS

Use uma conta de teste descartável em cada sistema/CPU, com perfil próprio; não
aplique fixtures ao perfil pessoal. Gere pares `0.99.0 → 0.99.1` assinados com a
mesma identidade, sem alterar a versão de produção. A configuração temporária
acima define o feed apenas nos pacotes de teste; o renderer e o app de produção
não têm um override de feed. No Windows, use NSIS x64; em cada Mac, DMG + ZIP da
mesma arquitetura. Sirva os arquivos da versão nova em `127.0.0.1:8957`; para uma
validação conjunta dos Macs, consolide os ZIPs no mesmo `latest-mac.yml`.

Execute os comandos do contrato em cada máquina correspondente:
`npm run package:win`, `npm run package:mac:x64`, `npm run package:mac:arm64`.
Para fixtures, substitua somente a configuração do builder e `extraMetadata.version`,
conservando os mesmos alvos/arquiteturas e `--publish never`. No PowerShell, defina
a variável de versão com `$env:LIFE_BOARD_TEST_VERSION = '0.99.0'` (e depois `0.99.1`).

Registre OS/CPU, par de versões, identidade da assinatura, hashes e URL isolada;
confirme assinatura do instalador no Windows e assinatura/notarização do bundle
no macOS. Repita os casos de feed offline/ausente/incompatível, checksum e assinatura
inválidos, interrupção e retry. Confira saída comum após download, confirmação
cancelada, recusa de UAC quando aplicável e instalação explícita com background e
pomodoro em execução/pausado. Após a atualização, confira uma única instância,
tarefa/upload, histórico diário, preferências, chaveiro e item de login.

Resultados e limites desta implementação ficam em [validação](validacao-atualizacoes.md).
