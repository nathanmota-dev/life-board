# Empacotamento multiplataforma

[← Guia da documentação](guide.md)

Contrato de empacotamento e compatibilidade de execução para Linux x64, Windows x64,
macOS x64 (Intel) e macOS arm64 (Apple Silicon). Os workflows de cada sistema e a
release central usam estes nomes e comandos. Binário universal do macOS, Windows ARM64
e Linux ARM64 ficam fora do escopo.

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
`url` do feed. O DMG pode gerar também um `.dmg.blockmap`; isso só pode ser
confirmado em um build no macOS.

### Feed do macOS

Com electron-builder 26.15.3 e electron-updater 6.8.9, o macOS tem um único canal,
`latest-mac.yml`, para as duas arquiteturas. Não existe `latest-mac-arm64.yml`.
O `MacUpdater` escolhe o arquivo pela URL: em Macs arm64 (inclusive sob Rosetta),
usa os arquivos com `arm64` no nome, se houver; em Macs Intel, descarta esses
arquivos. Por isso, só o nome arm64 contém `arm64`.

Cada build Mac grava um `latest-mac.yml` com apenas o próprio ZIP. Os dois arquivos
têm o mesmo nome, então ficam em pastas separadas e não podem ser enviados como
estão. A release central deve publicar um único `latest-mac.yml` com:

- `version` igual nos dois feeds;
- `files` com as entradas `url`, `sha512` e `size` dos dois ZIPs, sem alterá-las;
- `path` e `sha512` do ZIP x64 (campos legados);
- o `releaseDate` mais recente.

`desktop/scripts/packaging.test.ts` aplica o filtro do `MacUpdater` instalado a esse
feed combinado e confirma que cada arquitetura recebe o próprio ZIP.

## Contrato de workflows e artefatos

`build-linux.yml` estabelece a interface para os workflows de Windows (#29) e
macOS (#30). Cada sistema fará seu build de forma independente; não dependerá do
smoke Linux nem usará APT fora do Linux. O fan-in multiplataforma é a tarefa #31.

| Interface | Contrato comum |
| --- | --- |
| Eventos | `workflow_call` e `workflow_dispatch` (build-only) |
| Input `release` | Booleano opcional, padrão `false`; `true` exige tag estável igual à versão e notas não vazias. Dispatch ignora modo release. |
| Checkout | Commit do caller/dispatch, sem input de ref alternativo; `HEAD` deve ser igual a `GITHUB_SHA` |
| Output `artifact-name` | Nome determinístico `<sistema>-<arquitetura>`; Linux: `linux-x64` |
| Output `version` | Versão real do `package.json` do checkout |
| Output `source-sha` | SHA completo do commit efetivamente compilado |
| Output `target` | Alvo do artefato; Linux: `linux-x64` |
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

Nesta etapa só `linux-x64` é implementado; alvos desconhecidos falham. #29/#30
estenderão essa interface. A chamada antiga `assets <diretório>` continua aceitando
um build Linux sem `build-info.json`; quando o manifesto existe, é validado e
precisa constar nos checksums mesmo na chamada antiga. O alvo explícito sempre
exige o manifesto. O mesmo vale para a chamada antiga `uploaded`.

Mantenha um diretório e um artefato por alvo (`linux-x64`, `win32-x64`,
`darwin-x64`, `darwin-arm64`). Checksums e manifestos de arquiteturas diferentes
nunca são sobrescritos em um download mesclado. Em particular, os feeds Mac com
mesmo nome precisam continuar separados até a combinação explícita em #31.
Rascunho, aprovação pelo ambiente `release` e publicação permanecem centralizados
em `release.yml`, que revalida origem/arquivos antes de criar o rascunho e publicar.

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

O cliente libSQL lê `file:<caminho>` como URL: decodifica `%XX` e trata `?` e `#`
como query e fragmento. Antes, um perfil com `#` ou `?` não abria o banco, e `%20`
no caminho abria um banco em outra pasta. `sqliteFileUrl()` em `api/src/db/client.ts`
codifica o caminho inteiro com `encodeURIComponent`. O libSQL recebe de volta o
caminho original, inclusive letra de unidade e barras invertidas do Windows. Os testes
de `api/` usam uma pasta temporária com espaços, acentos, `#` e `%20`. Os uploads usam
`path.resolve`, que não depende de URL.

## Integração com o sistema

Revisão do código de `desktop/src/`. Windows e macOS ainda precisam ser validados
nos sistemas reais (#32):

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

Os comandos geram pacotes sem assinatura quando não há certificado. Os pré-requisitos
de cada workflow:

- **Windows:** certificado de assinatura de código (`CSC_LINK`/`CSC_KEY_PASSWORD` ou
  `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`). Sem ele, o NSIS funciona, mas o SmartScreen
  avisa.
- **macOS:** certificado Developer ID Application (`CSC_LINK`/`CSC_KEY_PASSWORD`)
  e notarização (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). O
  updater do macOS só instala apps assinados.

## Sistemas suportados

Electron 44 requer Windows 10 ou superior e macOS 12 ou superior. No Linux, o DEB
segue os requisitos de [Instalação no Linux](instalacao-linux.md).

## Registro de validação

Em 2026-10-21, a partir do Linux x64 (Ubuntu, kernel 7.0), com electron-builder 26.15.3.
"Nativo" é a execução no sistema e na arquitetura do alvo; "cruzado" é o build feito
em outro sistema; "inspeção" é a leitura do arquivo gerado.

| Alvo | Tipo | Resultado |
| --- | --- | --- |
| Linux x64 | nativo | `npm run package:linux` gerou `life-board_1.0.0_amd64.deb`, `life-board-1.0.0-x86_64.AppImage` e `latest-linux.yml` com os nomes da 1.0.0. O hook carregou `@libsql/linux-x64-gnu`. `dpkg-deb --info`/`--contents` mostram `life-board` 1.0.0 amd64, as migrations e o módulo nativo desempacotado. O DEB foi instalado em um container Ubuntu 24.04 limpo e passou em `desktop/scripts/smoke-deb.sh` (`/api/health`, `life-board.db` e `secret.key.enc`), no perfil padrão e com `XDG_CONFIG_HOME="…/Configuração Ç #1 %20"`. |
| Windows x64 | cruzado | Sem o módulo do Windows, o hook recusou o build: `Missing @libsql/win32-x64-msvc for win32-x64`. Com `@libsql/win32-x64-msvc@0.5.29` do lockfile (integridade conferida) extraído temporariamente, o NSIS foi gerado no `electronuserland/builder:wine`: `life-board-1.0.0-win-x64.exe`, `.exe.blockmap` e `latest.yml`. |
| macOS x64 | cruzado + inspeção | Só o ZIP (o DMG exige macOS). `life-board-1.0.0-mac-x64.zip`, `.zip.blockmap` e `latest-mac.yml` em `release/mac-x64/`. Executável Mach-O x86_64, `@libsql/darwin-x64/index.node` Mach-O x86_64, migrations e `CFBundleIdentifier` `dev.nathanmota.lifeboard`. |
| macOS arm64 | cruzado + inspeção | Só o ZIP. `life-board-1.0.0-mac-arm64.zip`, `.zip.blockmap` e `latest-mac.yml` em `release/mac-arm64/`, listando apenas o ZIP arm64. Executável e `@libsql/darwin-arm64/index.node` Mach-O arm64. |

Ainda não validado: execução nativa no Windows e no macOS (instalação, `/api/health`,
DPAPI/Keychain, `utilityProcess` e integração com o sistema) e o DMG. Esses itens
ficam para os workflows de Windows e macOS e para a validação integrada.

Observação para a validação integrada: em um container sem namespaces de usuário,
o `postinst` do DEB usa o `chrome-sandbox` com SUID e o app não abriu
(`LaunchProcess: failed to execvp: /opt/Life`). Com namespaces de usuário
liberados no container (`--security-opt seccomp=unconfined`), o app abriu e o
teste passou. Falta verificar se isso ocorre fora de containers.
