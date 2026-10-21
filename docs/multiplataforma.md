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
estão. A release central publica um único `latest-mac.yml`, montado por
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

`build-linux.yml` estabelece a interface para os workflows de Windows (#29) e
macOS (#30). Cada sistema fará seu build de forma independente; não dependerá do
smoke Linux nem usará APT fora do Linux. O fan-in multiplataforma fica em
`release.yml`; veja [Publicação de releases](releases.md).

| Interface | Contrato comum |
| --- | --- |
| Eventos | `workflow_call` e `workflow_dispatch` (build-only) |
| Input `release` | Booleano opcional, padrão `false`; `true` exige tag estável igual à versão e notas não vazias. Dispatch ignora modo release. |
| Checkout | Commit do caller/dispatch, sem input de ref alternativo; `HEAD` deve ser igual a `GITHUB_SHA` |
| Output `artifact-name` | Nome determinístico `<sistema>-<arquitetura>`: `linux-x64` ou `windows-x64`. O macOS expõe `artifact-names` (`["macos-x64","macos-arm64"]`) |
| Output `version` | Versão real do `package.json` do checkout |
| Output `source-sha` | SHA completo do commit efetivamente compilado |
| Output `target` | Alvo do artefato: `linux-x64` ou `windows-x64` (no macOS, os próprios `artifact-names`) |
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
A release combinada usa ainda `compose <artefatos> <saída>`, `assets <pasta> all` e
`uploaded <pasta> <assets.json> all`; veja
[Comandos de verificação](releases.md#comandos-de-verificação).

### Build Windows x64

`.github/workflows/build-windows.yml` usa `windows-2022` (Windows Server 2022,
build 20348) e Node.js **24.18.0**. O job verifica esses valores e registra a
versão exata da imagem do runner no resumo. Não depende de Linux/macOS e não usa
APT ou Bash. Executa `npm ci`, typecheck, todos os testes Vitest e cobertura da
API (mínimo de 80% em cada métrica) antes de `npm run package:win`. O E2E completo
continua no workflow próprio, com Linux/Xvfb/chaveiro; não é desabilitado nem
apresentado como evidência nativa do Windows.

Os testes usam os separadores nativos ao extrair arquivos do ASAR e fixtures de
sistema operacional explícitas. A prova do módulo nativo ocorre em subprocesso,
pois o Windows mantém uma DLL carregada bloqueada. O launcher de testes da API
também remove a sessão temporária depois de o Vitest encerrar: o libSQL 0.5.29
pode reter handles de statements após `close()` ([limitação conhecida](https://github.com/tursodatabase/libsql-js/issues/228)).
As asserções, os bancos reais por teste e a cobertura permanecem ativos; não há
supressão de erro de limpeza nem alteração das dependências de produção.

O hook `after-pack.cjs` carrega o libSQL da máquina e exige PE x64 no executável e
no módulo nativo. Inspeciona o ASAR: identidade do app, AppUserModelID, backend
do `utilityProcess`, preload e renderer. O NSIS instala por usuário, sem elevação
e sem abrir o app automaticamente ao terminar.

O smoke usa uma conta local descartável **sem privilégios de administrador**,
com espaços no nome do perfil. O runner administrador apenas cria/remove essa
conta. O script copia instalador e teste para uma pasta acessível pela conta,
carrega seu perfil e remove Node.js/npm/Git do PATH antes de instalar/abrir o app.
Confere versão/arquitetura do executável instalado, migrations, libSQL, recursos
e o AppUserModelID do atalho. Consulta `/api/health`, grava uma tarefa pela API,
encerra o app e abre novamente: a tarefa e o hash de `secret.key.enc` precisam
permanecer iguais. O segundo início exige descriptografar a chave existente pelo
`safeStorage`/DPAPI, sem adaptadores ou chaveiro sintético.

Instalação tem limite de 90 segundos; cada início espera até 60 segundos pela
API; o processo da conta inteira tem limite de seis minutos. O cleanup só encerra
processos da pasta de instalação exclusiva ou do SID criado pelo teste, remove
perfil/conta e preserva logs em `windows-x64-smoke` por 14 dias, inclusive em
falhas. O artefato de build só é enviado após o smoke e a verificação passarem.

`windows-x64` contém exatamente os arquivos entregáveis abaixo, na raiz:

- `life-board-<versão>-win-x64.exe` e `.exe.blockmap`;
- `latest.yml`, `build-info.json`, `signing-info.json` e `SHA256SUMS.txt`.

O feed deve conter apenas o instalador x64 completo, com tamanho/SHA-512 exatos;
pacotes web auxiliares são recusados. O blockmap gzip v2 precisa conter faixas
válidas que cubram todo o instalador. Os SHA-256 cobrem também blockmap e ambos
os manifestos. Checksums com LF ou CRLF são aceitos. `signing-info.json` usa
`schemaVersion: 1`, `status: "signed" | "unsigned"`, `publisher`, `thumbprint`,
`installerSha256` e `executableSha256`. Em unsigned, publisher/thumbprint são
null. Esse arquivo é a evidência gerada pela inspeção nativa de assinaturas;
revalidar um JSON no Linux não executa a verificação Authenticode do Windows.

O output adicional `signing-status` e o resumo marcam explicitamente o estado.
Dispatch e chamadas com `release: false` geram builds **unsigned**, sem acesso a
credenciais, inclusive quando selecionam uma tag. Não são distribuíveis como
release de produção. O verificador recusa manifesto com `releaseTag` preenchido
e `status: unsigned`.

Exemplo de chamada independente dos outros sistemas (o `release.yml` repassa os
secrets apenas no modo release):

```yaml
jobs:
  windows:
    uses: ./.github/workflows/build-windows.yml
    with:
      release: ${{ github.event_name == 'push' && github.ref_type == 'tag' }}
    secrets:
      WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
      WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
```

O workflow não cria release, tag nem publica feed. A aprovação do ambiente
`release` continua no orquestrador; não é consumida para executar esses checks.

Para uma branch já enviada, quando o workflow estiver registrado na branch
padrão do GitHub:

```powershell
gh workflow run build-windows.yml --ref ci/reusable-windows-build
gh run list --workflow build-windows.yml --branch ci/reusable-windows-build
gh run view <run-id> --log
gh run download <run-id> --name windows-x64 --dir artifacts/windows-x64
node desktop/scripts/release-checks.mts assets artifacts/windows-x64 windows-x64
```

O checkout local usado para revalidar deve ser o mesmo SHA do run; `RELEASE_TAG`
deve estar vazio em build-only. Antes de o workflow estar na branch padrão,
dispatch direto pode retornar 404. Pushes para branches `ci/**` que alteram o
workflow, `desktop/`, `api/`, `web/` ou a configuração de build também executam
esse workflow em build-only, permitindo validar antes da integração. Não criar
versão/tag de produção para testar branches.

### Build macOS x64 e arm64

`.github/workflows/build-macos.yml` executa um job nativo por arquitetura, com
Node.js **24.18.0** e macOS 15:

| Alvo | Runner | `uname -m` | Saída | Artefato |
| --- | --- | --- | --- | --- |
| macOS x64 | `macos-15-intel` | `x86_64` | `release/mac-x64/` | `macos-x64` |
| macOS arm64 | `macos-15` | `arm64` | `release/mac-arm64/` | `macos-arm64` |

O job não confia no rótulo: exige `process.arch`, `uname -m` e
`sysctl.proc_translated = 0` (sem Rosetta) e registra no resumo versão/build do
macOS, CPU, imagem do runner, Xcode, Node e SHA fonte. Não depende de Linux nem
de Windows. Cada job executa `npm ci`, typecheck, todos os testes Vitest e a
cobertura da API (mínimo de 80% em cada métrica) antes de `npm run package:mac:<arquitetura>`.
O E2E completo continua no workflow Linux; não é apresentado como evidência do macOS.

O hook `after-pack.cjs` carrega o libSQL da própria máquina e
`desktop/scripts/macos-package.cjs` exige Mach-O **thin** da arquitetura no executável,
no Electron Framework, nos quatro helpers (`Life Board Helper`, `(GPU)`, `(Plugin)`,
`(Renderer)`) e em `@libsql/darwin-<arquitetura>/index.node`. Também inspeciona o
ASAR: identidade do app, backend do `utilityProcess`, preload e renderer.
Binários universais e builds de uma arquitetura em outra são recusados.

**Smoke do app instalado.** `desktop/scripts/smoke-macos.sh` roda com o bash 3.2
do sistema:

```bash
bash desktop/scripts/smoke-macos.sh release/mac-arm64/life-board-<versão>-mac-arm64.dmg \
  [--team-id <TEAMID>] [--evidence test-results/macos-arm64]
```

1. Lê versão e arquitetura do nome do DMG e recusa outra arquitetura ou Rosetta.
2. Monta o DMG somente leitura, sem Finder (`hdiutil attach -nobrowse`), confere o
   link `Applications` e copia o app com `ditto` para uma pasta temporária com
   espaços. O teste usa essa cópia, não a saída do electron-builder.
3. Confere `CFBundleIdentifier` (`dev.nathanmota.lifeboard`), versão, `file`/`lipo`
   do executável, helpers e libSQL, `app.asar`, `app-update.yml` e as migrations.
4. `codesign --verify --deep --strict` no app; exige hardened runtime e
   `allow-jit`. Extrai o ZIP do updater e exige o mesmo CDHash do app do DMG.
5. Cria um keychain temporário, desbloqueado e sem timeout, e o torna o padrão do
   usuário. Abre o executável instalado com `--user-data-dir` em uma pasta com
   espaços, acento, `#` e `%20`. Espera até 60 segundos por `/api/health`, grava
   uma tarefa e exige `life-board.db`, `secret.key.enc` e exatamente um item
   `… Safe Storage` no keychain temporário.
6. Encerra com `SIGTERM` (até 30 segundos) e abre de novo: a tarefa, o hash de
   `secret.key.enc` e o item do Keychain devem continuar iguais. O segundo início
   só funciona descriptografando a chave existente pelo Keychain.
7. Restaura keychain padrão e lista de busca, apaga keychain, perfil e cópia, e
   grava `smoke.json`, `signing-info.json`, `codesign.txt` e os logs do app em
   `--evidence` (padrão `test-results/macos-smoke`).

O smoke altera o keychain padrão do usuário durante a execução. Use uma conta
descartável ou um runner; não interrompa o script com `kill -9`.

**Modos de assinatura.** Dispatch, push em `ci/**` e chamadas com `release: false`
geram builds **ad-hoc** (`--config.mac.identity=-`), sem nenhuma credencial. Mantêm o
hardened runtime e o `allow-jit` de produção; só acrescentam
`disable-library-validation` (`desktop/resources/entitlements.mac.adhoc.plist`),
porque código ad-hoc não tem Team ID. O smoke exige `Signature=adhoc` e
`TeamIdentifier=not set`. Esses artefatos não são distribuíveis: o Gatekeeper os
bloqueia em downloads e o updater do macOS não os instala. Também não comprovam
Keychain/item de login/atualização com assinatura estável. O
`CSC_FOR_PULL_REQUEST=true` desse passo só impede que o electron-builder
pule a assinatura ad-hoc quando o caller vem de um pull request.

No modo release, o caller precisa ser um push de tag do próprio repositório; tag,
versão e notas são conferidas. Só o passo de empacotamento recebe os secrets.
Ele importa o `.p12` em um keychain temporário, exige uma identidade
`Developer ID Application` válida do time `APPLE_TEAM_ID` e passa seu hash ao
electron-builder com `forceCodeSigning`. O electron-builder assina app, helpers e
o libSQL com hardened runtime, `allow-jit` e timestamp, notariza o app pelo
`notarytool` e grampeia o ticket antes de gerar DMG e ZIP. Em seguida, o
workflow assina o DMG com timestamp, envia-o ao `notarytool --wait`, exige
`Accepted` e grampeia o ticket. Credenciais ausentes, identidade de outro time
ou rejeição da Apple falham antes do smoke. Com `--team-id`, o smoke exige ainda
`Authority=Developer ID Application`, o mesmo time no app e no libSQL,
`spctl --assess` e `xcrun stapler validate` no app e no DMG.

`macos-x64` e `macos-arm64` contêm exatamente estes arquivos, na raiz:

- `life-board-<versão>-mac-<arquitetura>.dmg`, `.zip` e `.zip.blockmap`;
- `latest-mac.yml`, `build-info.json`, `signing-info.json` e `SHA256SUMS.txt`.

O `latest-mac.yml` de cada artefato lista apenas o ZIP da própria arquitetura, com
tamanho/SHA-512 exatos; o DMG e o ZIP da outra arquitetura são recusados. O
blockmap gzip v2 precisa cobrir todo o ZIP. `signing-info.json` usa
`schemaVersion: 1`, `status: "signed" | "adhoc"`, `teamId`, `notarized`, `cdHash` e
os SHA-256 do DMG e do ZIP. Em ad-hoc, `teamId` é null e `notarized` é false; em
signed, o Team ID tem 10 caracteres e `notarized` é true. O verificador recusa
`releaseTag` preenchido com `status: "adhoc"`. Assim como no Windows, esse JSON é
a evidência gerada no macOS; revalidá-lo no Linux não repete `codesign`.

Depois dos dois jobs, o job **Verify macOS artifacts** (Ubuntu) baixa cada artefato
em uma pasta separada, como faz o `release.yml`, revalida ambos com
`release-checks.mts assets` e exige mesma versão, SHA fonte e estado de assinatura.
Só então expõe os outputs. Os diagnósticos (`macos-<arquitetura>-diagnostics`:
smoke, `codesign.txt`, resposta/log do `notarytool` e relatórios do
electron-builder) são enviados também em falhas.

Exemplo de chamada independente dos outros sistemas (o `release.yml` repassa os
secrets apenas no modo release):

```yaml
jobs:
  macos:
    uses: ./.github/workflows/build-macos.yml
    with:
      release: ${{ github.event_name == 'push' && github.ref_type == 'tag' }}
    secrets:
      MAC_CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
      MAC_CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
      APPLE_API_KEY_P8: ${{ secrets.APPLE_API_KEY_P8 }}
      APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
      APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
  consume:
    needs: macos
    runs-on: ubuntu-24.04
    strategy:
      matrix:
        artifact: ${{ fromJSON(needs.macos.outputs.artifact-names) }}
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: ${{ matrix.artifact }}
          path: artifacts/${{ matrix.artifact }}
```

Os dois `latest-mac.yml` têm o mesmo nome e nunca podem ser baixados na mesma
pasta. O `release.yml` os combina como descrito em [Feed do macOS](#feed-do-macos) e
publica só o feed combinado, com DMGs, ZIPs e blockmaps das duas arquiteturas.
O workflow não cria release, tag nem publica feed, e não consome a aprovação do
ambiente `release`.

Para uma branch já enviada, quando o workflow estiver registrado na branch padrão:

```bash
gh workflow run build-macos.yml --ref ci/reusable-macos-build
gh run list --workflow build-macos.yml --branch ci/reusable-macos-build
gh run view <run-id> --log
gh run download <run-id> --name macos-x64 --dir artifacts/macos-x64
gh run download <run-id> --name macos-arm64 --dir artifacts/macos-arm64
node desktop/scripts/release-checks.mts assets artifacts/macos-x64 macos-x64
node desktop/scripts/release-checks.mts assets artifacts/macos-arm64 macos-arm64
```

O checkout local deve estar no SHA do run e `RELEASE_TAG` vazio em build-only.
Antes de o workflow estar na branch padrão, o dispatch pode retornar 404; pushes
para `ci/**` que alteram o workflow, `desktop/`, `api/`, `web/` ou a configuração
de build executam o workflow em build-only.

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

- **Windows:** o caminho implementado usa Authenticode por certificado PFX,
  suportado pelo electron-builder 26. O mantenedor deve escolher/provisionar uma
  identidade compatível com sua autoridade certificadora e política de custódia;
  nenhum serviço de nuvem é presumido nem provisionado por este workflow.
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
  `.p12`, `.p8` ou senhas ao Git; o workflow os grava só no diretório temporário
  do runner e remove keychain e chave ao terminar. O app não recebe nenhuma
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

O workflow macOS executa build, smoke do DMG instalado e Keychain nativamente nas
duas arquiteturas, em modo ad-hoc. Registrar run-id, versão do macOS/imagem,
`uname -m`, SHA fonte, hashes dos artefatos baixados e `smoke.json` de cada
arquitetura. Um runner não comprova: Gatekeeper em um download real com
quarentena, prompts do Keychain com assinatura Developer ID estável entre
versões, item de login após reiniciar (`status === "enabled"` só a partir do
macOS 13; verificar o macOS 12), permissão de notificações, ícone da bandeja,
atalho global e a atualização assinada pelo ZIP (#27). Esses itens ficam para a
matriz manual de #32, em Intel e Apple Silicon reais.

A implementação do workflow Windows não substitui a evidência de execução:
registrar run-id, versão da imagem, SHA fonte, hashes do artefato baixado e
`windows-x64-smoke/smoke.json` após o primeiro run nativo. Produção assinada
continua pendente da identidade/credenciais do mantenedor. A matriz manual de
#32 deve cobrir Windows 10/11 em usuário comum sem ferramentas de desenvolvimento,
tray, notificações/permissões, login real após reboot, SmartScreen, upgrade
assinado e preservação dos dados. Um runner Server 2022 não comprova esses itens.

Observação para a validação integrada: em um container sem namespaces de usuário,
o `postinst` do DEB usa o `chrome-sandbox` com SUID e o app não abriu
(`LaunchProcess: failed to execvp: /opt/Life`). Com namespaces de usuário
liberados no container (`--security-opt seccomp=unconfined`), o app abriu e o
teste passou. Falta verificar se isso ocorre fora de containers.
