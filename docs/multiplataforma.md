# Empacotamento multiplataforma

[← Guia da documentação](guide.md)

Contrato de empacotamento e compatibilidade de execução para Linux x64, Windows x64,
macOS x64 (Intel) e macOS arm64 (Apple Silicon). A distribuição oficial e os
workflows atuais são somente Linux. Windows/macOS permanecem como suporte no
código e builds locais, sem instaladores oficiais, devido aos custos de
certificados e serviços de assinatura e do Apple Developer Program. Binário
universal do macOS, Windows ARM64 e Linux ARM64 ficam fora do escopo.

## Comandos

Cada comando compila o app antes, define formato e arquitetura e nunca publica
(`--publish never`). Nenhum deles altera a versão de `package.json`.

| Alvo | Comando | Máquina de build | Pasta de saída |
| --- | --- | --- | --- |
| Linux x64 | `npm run package:linux` | Linux x64 | `release/` |
| Windows x64 | `npm run package:win` | Windows x64 | `release/` |
| macOS x64 | `npm run package:mac:x64` | macOS Intel | `release/mac-x64/` |
| macOS arm64 | `npm run package:mac:arm64` | macOS Apple Silicon | `release/mac-arm64/` |

`npm run package` continua gerando os formatos configurados para o sistema atual,
também sem publicar.

Cada build precisa rodar em uma máquina do mesmo sistema e arquitetura do alvo.
O npm instala apenas o módulo nativo do libSQL da máquina que executa `npm ci`
(`@libsql/linux-x64-gnu`, `@libsql/win32-x64-msvc`, `@libsql/darwin-x64` ou
`@libsql/darwin-arm64`). Um build cruzado gera um pacote cujo backend não abre o
banco. O hook `desktop/scripts/after-pack.cjs` impede isso: depois de montar o app,
ele exige `resources/migrations/meta/_journal.json` e
`resources/app.asar.unpacked/node_modules/@libsql/<alvo>/index.node`. Quando o alvo
é a própria máquina, ele também carrega o módulo. Sem o módulo do alvo, o build falha
com `Missing @libsql/<alvo> for <sistema>-<arquitetura>`.

## Arquivos e feeds

`<versão>` é a versão de `package.json`, sem o `v`.

| Alvo | Instalador | Pacote do updater | Blockmap | Feed |
| --- | --- | --- | --- | --- |
| Linux x64 | `life-board_<versão>_amd64.deb` | `life-board-<versão>-x86_64.AppImage` e o DEB | embutido no AppImage | `latest-linux.yml` |
| Windows x64 | `life-board-<versão>-win-x64.exe` (NSIS) | o mesmo `.exe` | `life-board-<versão>-win-x64.exe.blockmap` | `latest.yml` |
| macOS x64 | `life-board-<versão>-mac-x64.dmg` | `life-board-<versão>-mac-x64.zip` | `life-board-<versão>-mac-x64.zip.blockmap` | `latest-mac.yml` |
| macOS arm64 | `life-board-<versão>-mac-arm64.dmg` | `life-board-<versão>-mac-arm64.zip` | `life-board-<versão>-mac-arm64.zip.blockmap` | `latest-mac.yml` |

O Linux mantém os nomes, o `appId` (`dev.nathanmota.lifeboard`), o `desktopName`
(`life-board-app.desktop`), o pacote APT `life-board` e o feed da 1.0.0. Os nomes
de Windows e macOS não têm espaços, então o nome do asset no GitHub é igual ao
`url` do feed. O DMG serve só para a primeira instalação: `dmg.writeUpdateInfo: false`
o deixa fora de `latest-mac.yml` e não gera `.dmg.blockmap`.

### Feed do macOS

Com electron-builder 26.15.3 e electron-updater 6.8.9, o macOS tem um único canal,
`latest-mac.yml`, para as duas arquiteturas. Não existe `latest-mac-arm64.yml`.
O `MacUpdater` escolhe o arquivo pela URL: em Macs arm64 (inclusive sob Rosetta),
usa os arquivos com `arm64` no nome, se houver; em Macs Intel, descarta esses
arquivos. Por isso, só o nome arm64 contém `arm64`.

Cada build Mac grava um `latest-mac.yml` com apenas o próprio ZIP. Os dois arquivos
têm o mesmo nome, então ficam em pastas separadas e não podem ser enviados como
estão. Para testes de composição multiplataforma, o helper gera um único
`latest-mac.yml`, montado por
`release-checks.mts compose` (`mergeMacFeeds`) a partir dos dois feeds lidos como
YAML, nunca concatenados:

- cada feed de origem precisa listar só o ZIP da própria arquitetura;
- `version` e os demais metadados precisam ser iguais nos dois feeds; qualquer
  diferença falha em vez de descartar um valor;
- `files` com as entradas dos dois ZIPs (x64 e depois arm64), sem alterá-las;
- `path` e `sha512` do ZIP x64 (campos legados);
- o `releaseDate` mais recente.

As strings são gravadas entre aspas, para o `js-yaml` do updater não converter
`releaseDate` em data. `desktop/scripts/packaging.test.ts` aplica o filtro do
`MacUpdater` instalado a esse feed, e `desktop/scripts/release-compose.test.ts` lê o
feed gerado com o parser do `electron-updater` e confirma que cada arquitetura
recebe o próprio ZIP. Um feed sem uma das arquiteturas ou com `path` de outro ZIP
é recusado por `assets <pasta> all`.

## Contrato de workflows e artefatos

`build-linux.yml` é o único workflow de empacotamento ativo. `release.yml`
consome somente seu artefato; veja [Publicação de releases](releases.md).
Os validadores nativos dos demais alvos permanecem para desenvolvimento local.

| Interface | Contrato comum |
| --- | --- |
| Eventos | `pull_request`, `workflow_call` e `workflow_dispatch` (build-only) |
| Input `release` | Booleano opcional, padrão `false`; `true` exige tag estável igual à versão e notas não vazias. Dispatch ignora modo release. |
| Checkout | Commit do caller/dispatch, sem input de ref alternativo; `HEAD` deve ser igual a `GITHUB_SHA` |
| Output `artifact-name` | `linux-x64` |
| Output `version` | Versão real do `package.json` do checkout |
| Output `source-sha` | SHA completo do commit efetivamente compilado |
| Output `target` | `linux-x64` |
| Output `release-tag` | Tag validada ou string vazia em build-only |
| Permissão | `contents: read`; sem publicação, tags ou uploads de GitHub Release |
| Retenção | 14 dias, com `if-no-files-found: error`; upload só após todos os gates |

Exemplo de chamada Linux (o modo release só é apropriado em push de tag):

```yaml
jobs:
  linux:
    uses: ./.github/workflows/build-linux.yml
    with:
      release: ${{ github.event_name == 'push' && github.ref_type == 'tag' }}
  consume:
    needs: linux
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.linux.outputs.artifact-name }}
          path: artifacts/linux-x64
```

Cada artefato contém seus instaladores, feed, blockmaps exigidos pelo updater,
`SHA256SUMS.txt` e **`build-info.json`**, todos na raiz. O Linux inclui DEB,
AppImage (blockmap embutido), `latest-linux.yml` e os dois manifestos. Não inclui
`linux-unpacked/` nem os relatórios internos do electron-builder.

Os checksums usam linhas `sha256  nome`, cobrindo exatamente todos os arquivos
entregues exceto o próprio `SHA256SUMS.txt`, inclusive `build-info.json`. O manifesto
JSON tem exatamente este esquema (versão de exemplo; não exige bump):

```json
{
  "schemaVersion": 1,
  "sourceSha": "0123456789abcdef0123456789abcdef01234567",
  "releaseTag": null,
  "version": "1.0.0",
  "targetOs": "linux",
  "architecture": "x64"
}
```

`targetOs` usa os nomes do Node (`linux`, `win32`, `darwin`), `architecture` é `x64`
ou `arm64`, e `releaseTag` é `null` em build-only ou `vX.Y.Z` no modo release.
O helper gera o SHA a partir do Git e o compara com `GITHUB_SHA`, quando definido.
A validação compara o manifesto com a versão e o commit do checkout e com
`RELEASE_TAG` (padrão vazio/null); não basta confiar no nome do arquivo ou em um
checksum válido de outro build. Feed e pacotes também têm tamanho e SHA-512
conferidos antes dos SHA-256.

A interface compartilhada é:

```bash
node desktop/scripts/release-checks.mts build-info <diretório> <alvo>
node desktop/scripts/release-checks.mts assets <diretório> <alvo>
node desktop/scripts/release-checks.mts uploaded <diretório> <assets.json> <alvo>
```

Os alvos `linux-x64`, `windows-x64`, `macos-x64` e `macos-arm64` estão
implementados; alvos desconhecidos falham. A chamada antiga `assets <diretório>` continua aceitando
um build Linux sem `build-info.json`; quando o manifesto existe, é validado e
precisa constar nos checksums mesmo na chamada antiga. O alvo explícito sempre
exige o manifesto. O mesmo vale para a chamada antiga `uploaded`.

Mantenha um diretório e um artefato por alvo (`linux-x64`, `windows-x64`,
`macos-x64`, `macos-arm64`). O nome do alvo Windows é `windows-x64`, enquanto seu
`targetOs` no manifesto é `win32`; os alvos Mac usam `darwin`. Checksums e manifestos de arquiteturas diferentes
nunca são sobrescritos em um download mesclado. Em particular, os feeds Mac com
mesmo nome precisam continuar separados até a combinação explícita por `compose`.
Rascunho, aprovação pelo ambiente `release` e publicação permanecem centralizados
em `release.yml`, que revalida origem/arquivos antes de criar o rascunho e publicar.
A release pública usa `compose <artefatos> <saída> linux`, `assets <pasta> linux` e
`uploaded <pasta> <assets.json> linux`; o modo `all` fica restrito a testes locais. Veja
[Comandos de verificação](releases.md#comandos-de-verificação).

### Build Windows x64

O workflow `build-windows.yml` foi removido. Não há dispatch ou artefato Windows
nas releases atuais. O comando `npm run package:win`, o script
`desktop/scripts/windows-package.cjs` e o smoke nativo permanecem no código.
Veja [Windows](instalacao-windows.md#gerar-a-partir-do-código) e
[Desenvolvimento](desenvolvimento.md) para compilar e testar localmente.

O NSIS de desenvolvimento não tem assinatura de produção. Uma futura distribuição
assinada exigirá integrar certificado/serviço compatível; o caminho PFX existente
não substitui a integração com provedores que usam HSM ou assinatura em nuvem.

### Build macOS x64 e arm64

O workflow `build-macos.yml` foi removido. Não há dispatch nem DMGs/ZIPs oficiais.
Os comandos `npm run package:mac:x64` e `npm run package:mac:arm64`, o empacotamento,
os validadores e o smoke nativo permanecem disponíveis para desenvolvimento.

Compile na arquitetura do alvo, com as opções ad-hoc descritas em
[Desenvolvimento](desenvolvimento.md). Veja também o guia de
[macOS](instalacao-macos.md#gerar-a-partir-do-código). Builds ad-hoc não comprovam
Gatekeeper, notarização ou atualização assinada de produção. Essas capacidades
precisam de validação nativa caso a distribuição seja retomada.

## Caminhos e dados do usuário

O perfil continua em `app.getPath("userData")`, com o nome `life-board-app`:

| Sistema | Pasta |
| --- | --- |
| Linux | `~/.config/life-board-app` (ou `$XDG_CONFIG_HOME/life-board-app`) |
| Windows | `%APPDATA%\life-board-app` |
| macOS | `~/Library/Application Support/life-board-app` |

O banco (`life-board.db`), os uploads e `secret.key.enc` ficam nessa pasta. A chave
é protegida pelo `safeStorage`: libsecret/KWallet no Linux, DPAPI no Windows e
Keychain no macOS.

### Chave dos segredos no Windows

No Windows, o `safeStorage` usa o OSCrypt do Chromium: a chave que cifra
`secret.key.enc` é protegida pelo DPAPI e salva no `Local State`, dentro da mesma
pasta, em `os_crypt.encrypted_key`. O Chromium grava o `Local State` alguns
segundos depois de uma mudança ou ao sair normalmente, e o Electron não expõe uma
API para forçar essa gravação. Se o app é encerrado à força no primeiro início
antes disso, o próximo início recebe outra chave do OSCrypt e não consegue decifrar
`secret.key.enc` (#38). Linux e macOS gravam a chave no chaveiro na hora.

Por isso, `desktop/src/secret-key.ts` não depende do `Local State`:

- Uma chave nova no Windows fica **pendente** (`secret.key.pending`) até um início
  posterior decifrá-la. Se a chave pendente não decifra, ela foi criada num início
  cujo OSCrypt nunca foi salvo: o app cria outra chave sem perguntar, registra um
  aviso no log e continua.
- Toda chave nova grava `secret.key.reset` antes de `secret.key.enc` (que é gravado
  num arquivo temporário e renomeado). O backend recebe `resetSecrets` e apaga só
  os segredos cifrados com a chave anterior — hoje, a linha de `github_settings`
  com o token do GitHub. O marcador só é removido quando o backend fica pronto, então
  um crash no meio repete a limpeza no próximo início.
- Uma chave já confirmada que não decifra (em qualquer sistema) é registrada no log
  do processo principal antes de qualquer diálogo. O diálogo explica que os segredos
  salvos não podem ser lidos e oferece **Redefinir chave** ou **Sair** (padrão).
  Redefinir mantém o banco: tarefas, hábitos, metas e os demais dados continuam; só
  o token do GitHub precisa ser conectado de novo. Chaveiro indisponível continua
  fechando o app com a mensagem de erro, também registrada no log.

O cliente libSQL lê `file:<caminho>` como URL: decodifica `%XX` e trata `?` e `#`
como query e fragmento. Antes, um perfil com `#` ou `?` não abria o banco, e `%20`
no caminho abria um banco em outra pasta. `sqliteFileUrl()` em `api/src/db/client.ts`
codifica o caminho inteiro com `encodeURIComponent`. O libSQL recebe de volta o
caminho original, inclusive letra de unidade e barras invertidas do Windows. Os testes
de `api/` usam uma pasta temporária com espaços, acentos, `#` e `%20`. Os uploads usam
`path.resolve`, que não depende de URL.

## Integração com o sistema

Revisão do código de `desktop/src/`. Windows e macOS ainda precisam ser validados
nos sistemas reais; a situação de cada item está na
[validação multiplataforma](validacao-multiplataforma.md#matriz-manual):

- **Login:** Linux usa o arquivo de autostart; Windows registra executável e
  argumentos (`--hidden`); macOS usa o item de login e `wasOpenedAtLogin`. No macOS,
  `getStartOnLogin` exige `status === "enabled"`, que o Electron só informa a partir
  do macOS 13. Verificar o macOS 12.
- **Notificações:** no Windows, `setAppUserModelId("dev.nathanmota.lifeboard")` é
  o `appId` usado pelo atalho do NSIS. Sem o atalho, como no desenvolvimento, o
  Windows não mostra as notificações.
- **Bandeja:** 16 px no Windows (clique abre o pomodoro) e 22 px no Linux e no macOS
  (clique abre o menu). O ícone do macOS é colorido, não template.
- **Captura rápida:** `CommandOrControl+Shift+Space`, exibido como `Cmd` no macOS
  e `Ctrl` nos outros.
- **Fechar e reabrir:** sem segundo plano nem pomodoro ativo, fechar a janela
  encerra o app em todos os sistemas. No macOS, `activate` reabre a janela quando o
  app continua aberto.

## Assinatura

Os comandos permitem builds de desenvolvimento sem certificado de produção.
Os requisitos abaixo são referência para uma futura retomada da distribuição
assinada; nenhum workflow atual configura ou consome esses secrets:

- **Windows:** o caminho implementado usa Authenticode por certificado PFX,
  suportado pelo electron-builder 26. O mantenedor deve escolher/provisionar uma
  identidade compatível com sua autoridade certificadora e política de custódia;
  nenhum serviço de nuvem é presumido nem provisionado pelo projeto.
  Configurar os secrets `WIN_CSC_LINK` (PFX codificado em base64) e
  `WIN_CSC_KEY_PASSWORD`, e a variável de repositório `WINDOWS_PUBLISHER_NAME`
  exatamente igual ao nome comum do certificado. Não adicionar PFX/senha ao Git.
  Certificados com chave não exportável/HSM exigem integração específica do
  provedor antes de habilitar releases; não são convertidos automaticamente em PFX.
  Em produção, o caller deve vir de push de tag do próprio repositório; tag,
  versão e notas são conferidas. Só o passo de empacotamento recebe os secrets.
  `forceCodeSigning` impede fallback silencioso. `Get-AuthenticodeSignature`
  exige assinatura válida, publisher esperado e o mesmo certificado no
  instalador e no executável instalado. Credenciais ausentes, certificado
  inválido ou publisher diferente falham antes do upload. Renovação deve manter
  o publisher esperado pelo updater. Branches deliberadamente unsigned podem
  disparar avisos do SmartScreen; assinatura válida também não garante ausência
  desses avisos. O comportamento observado deve ser registrado no teste manual.
- **macOS:** exige associação ao Apple Developer Program e um certificado
  **Developer ID Application** exportado como `.p12` com a chave privada. Configurar
  os secrets `MAC_CSC_LINK` (`.p12` em base64) e `MAC_CSC_KEY_PASSWORD`, e a
  variável de repositório `APPLE_TEAM_ID` (Team ID de 10 caracteres). A
  notarização usa uma chave de API do App Store Connect com acesso de Developer:
  `APPLE_API_KEY_P8` (conteúdo do `AuthKey_<id>.p8`), `APPLE_API_KEY_ID` e
  `APPLE_API_ISSUER`. A chave de API foi escolhida em vez de Apple ID e senha de
  app: pode ser revogada sozinha e não depende da conta pessoal. Não adicionar
  `.p12`, `.p8` ou senhas ao Git; uma futura automação deve gravá-los apenas em diretório temporário
  e remover keychain e chave ao terminar. O app não recebe nenhuma
  dessas variáveis. Renovação deve manter o mesmo Team ID: o Keychain, o item
  de login e o updater dependem da mesma identidade (`dev.nathanmota.lifeboard` +
  Team ID) entre versões. Para conferir:
  `codesign --verify --deep --strict --verbose=2 "<app>"`,
  `codesign -dv --verbose=4 "<app>"`, `spctl --assess --type execute --verbose=2 "<app>"`
  e `xcrun stapler validate "<app>"`. Em falha de notarização, o
  `notary-dmg-log.json` fica nos diagnósticos; para o app, rode
  `xcrun notarytool history`/`log` com a mesma chave. Até as credenciais existirem
  e um run de tag ser verificado, a produção macOS está **pendente**: só os
  builds ad-hoc foram validados.

## Sistemas suportados

Electron 44 requer Windows 10 ou superior e macOS 12 ou superior. No Linux, o DEB
segue os requisitos de [Instalação no Linux](instalacao-linux.md). Os guias de
[Windows](instalacao-windows.md) e [macOS](instalacao-macos.md) descrevem instalação,
permissões, atualizações e recuperação.

## Registro de validação

Este é o registro do contrato de empacotamento (#26). A validação integrada da
série, com os runs nativos e os bloqueios, está em
[Validação multiplataforma](validacao-multiplataforma.md).

Em 2026-10-21, a partir do Linux x64 (Ubuntu, kernel 7.0), com electron-builder 26.15.3.
"Nativo" é a execução no sistema e na arquitetura do alvo; "cruzado" é o build feito
em outro sistema; "inspeção" é a leitura do arquivo gerado.

| Alvo | Tipo | Resultado |
| --- | --- | --- |
| Linux x64 | nativo | `npm run package:linux` gerou `life-board_1.0.0_amd64.deb`, `life-board-1.0.0-x86_64.AppImage` e `latest-linux.yml` com os nomes da 1.0.0. O hook carregou `@libsql/linux-x64-gnu`. `dpkg-deb --info`/`--contents` mostram `life-board` 1.0.0 amd64, as migrations e o módulo nativo desempacotado. O DEB foi instalado em um container Ubuntu 24.04 limpo e passou em `desktop/scripts/smoke-deb.sh` (`/api/health`, `life-board.db` e `secret.key.enc`), no perfil padrão e com `XDG_CONFIG_HOME="…/Configuração Ç #1 %20"`. |
| Windows x64 | cruzado | Sem o módulo do Windows, o hook recusou o build: `Missing @libsql/win32-x64-msvc for win32-x64`. Com `@libsql/win32-x64-msvc@0.5.29` do lockfile (integridade conferida) extraído temporariamente, o NSIS foi gerado no `electronuserland/builder:wine`: `life-board-1.0.0-win-x64.exe`, `.exe.blockmap` e `latest.yml`. |
| macOS x64 | cruzado + inspeção | Só o ZIP (o DMG exige macOS). `life-board-1.0.0-mac-x64.zip`, `.zip.blockmap` e `latest-mac.yml` em `release/mac-x64/`. Executável Mach-O x86_64, `@libsql/darwin-x64/index.node` Mach-O x86_64, migrations e `CFBundleIdentifier` `dev.nathanmota.lifeboard`. |
| macOS arm64 | cruzado + inspeção | Só o ZIP. `life-board-1.0.0-mac-arm64.zip`, `.zip.blockmap` e `latest-mac.yml` em `release/mac-arm64/`, listando apenas o ZIP arm64. Executável e `@libsql/darwin-arm64/index.node` Mach-O arm64. |

Este registro é histórico. As execuções nativas posteriores e os bloqueios de
assinatura constam em [Validação multiplataforma](validacao-multiplataforma.md).
Os workflows Windows/macOS foram removidos; não há validação contínua desses
alvos. Retomar a distribuição exige validar assinatura, instalação e atualização
em sistemas reais, além dos testes unitários preservados.

Observação para a validação integrada: em um container sem namespaces de usuário,
o `postinst` do DEB usa o `chrome-sandbox` com SUID e o app não abriu
(`LaunchProcess: failed to execvp: /opt/Life`). Com namespaces de usuário
liberados no container (`--security-opt seccomp=unconfined`), o app abriu e o
teste passou. Falta verificar se isso ocorre fora de containers.
