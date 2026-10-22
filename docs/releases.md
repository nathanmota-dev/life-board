# Publicação de releases

[← Guia da documentação](guide.md)

As releases são orquestradas por `.github/workflows/release.yml` a partir de uma
tag `vMAJOR.MINOR.PATCH`. Um único run chama os workflows reutilizáveis
`build-linux.yml`, `build-windows.yml` e `build-macos.yml` no mesmo commit, junta os
quatro alvos em **um** rascunho e só o publica depois da aprovação do mantenedor.
Nenhum build publica sozinho e não existe release separada por sistema. Cada
release pública contém exatamente:

| Arquivo | Uso |
| --- | --- |
| `life-board_<versão>_amd64.deb` | Instalação com `sudo apt install ./…` e atualização de instalações DEB |
| `life-board-<versão>-x86_64.AppImage` | Uso sem instalação e atualização de instalações AppImage (blockmap embutido) |
| `latest-linux.yml` | Feed Linux do `electron-updater` (DEB e AppImage), igual ao da 1.0.0 |
| `life-board-<versão>-win-x64.exe` | Instalador NSIS e pacote de atualização do Windows |
| `life-board-<versão>-win-x64.exe.blockmap` | Blockmap do instalador, para download diferencial |
| `latest.yml` | Feed do Windows |
| `life-board-<versão>-mac-x64.dmg` / `-mac-arm64.dmg` | Primeira instalação no macOS Intel / Apple Silicon |
| `life-board-<versão>-mac-x64.zip` / `-mac-arm64.zip` | Pacotes de atualização do macOS |
| `life-board-<versão>-mac-x64.zip.blockmap` / `-mac-arm64.zip.blockmap` | Blockmaps dos ZIPs |
| `latest-mac.yml` | Feed único do macOS com os dois ZIPs ([formato](multiplataforma.md#feed-do-macos)) |
| `SHA256SUMS.txt` | SHA-256 de todos os arquivos acima; confira com `sha256sum -c` |

O app instalado lê o feed do seu sistema na release marcada como mais recente em
`nathanmota-dev/life-board` (provedor `github`, canal `latest`) e escolhe somente o
arquivo do seu formato e arquitetura. Feeds e pacotes vêm sempre dos builds do mesmo
run; não edite nem substitua arquivos de uma release manualmente.

`build-info.json`, `signing-info.json` e o `SHA256SUMS.txt` de cada build são
internos: ficam nos artefatos do Actions (14 dias) e são validados antes de montar
a pasta de upload, mas não são publicados. A 1.0.0 publicou o `build-info.json` do
Linux; a partir da release multiplataforma ele deixa a release, porque os quatro
manifestos teriam o mesmo nome. Nenhum cliente o lê.

## Preparar uma versão

1. Atualize `version` em `package.json` e `package-lock.json` (`npm version <x.y.z> --no-git-tag-version`).
2. Crie `docs/release-notes/<x.y.z>.md` com as funcionalidades, plataformas e
   arquiteturas suportadas, instalação e limitações conhecidas. O texto vira as notas
   da release e aparece em **Configurações → Atualizações**.
3. Atualize os links da versão no `README.md`.
4. Integre essas mudanças à `main` por PR, com as verificações abaixo aprovadas.
5. Confira os pré-requisitos de [assinatura](multiplataforma.md#assinatura): sem os
   secrets de Windows e macOS, os builds de release falham e nada é publicado.
6. Crie e envie a tag no commit integrado:

   ```bash
   git switch main && git pull --ff-only
   git tag v<x.y.z>
   git push origin v<x.y.z>
   ```

## O que o workflow faz

```text
validate ─┬─ Linux (E2E → build) ─┐
          ├─ Windows ─────────────┼─ verify ─ draft ─ [aprovação] ─ publish
          └─ macOS x64 + arm64 ───┘
```

1. **Validate release request** escolhe o modo pelo evento. Só um push de tag é
   release: a tag precisa ser estável, igual à versão do `package.json` e ter notas
   não vazias, antes de qualquer build ou credencial. Qualquer outro evento é
   build-only. Não há input de texto que ignore essas regras.
2. **Linux**, **Windows** e **macOS** chamam os workflows reutilizáveis com
   `release: true|false`. Eles rodam em paralelo e não dependem uns dos outros. O
   Linux mantém o [E2E](e2e.md) como gate. Cada build roda typecheck, testes,
   cobertura, empacotamento, instalação e smoke no próprio sistema, grava
   `build-info.json`/`signing-info.json` e envia o artefato da sua plataforma
   (`linux-x64`, `windows-x64`, `macos-x64`, `macos-arm64`). Os secrets de
   assinatura só são repassados em release; o build Linux não recebe nenhum.
3. **Verify complete release assets** depende dos três builds. Falha, cancelamento
   ou build pulado impede esse job e, portanto, o rascunho e a publicação. Ele:
   - confere as saídas de cada build (`release-checks.mts builds`): resultado
     `success`, nomes dos artefatos, versão, commit, tag e, em release, Windows e
     macOS `signed`;
   - baixa os quatro artefatos **deste run** em pastas separadas (nunca de outro
     run ou de "o último build com sucesso");
   - executa `compose`, que valida cada artefato contra o checkout (commit, versão,
     alvo, tag, assinatura exigida, feeds, blockmaps e checksums), recusa arquivos
     inesperados, copia só os arquivos públicos sem sobrescrever nenhum, combina
     `latest-mac.yml` e escreve o `SHA256SUMS.txt` global;
   - valida a pasta resultante com `assets release all` e a envia como artefato
     `release-assets`, com os checksums no resumo do run.
4. **Stage draft release** (só em release) recompõe a pasta a partir dos mesmos
   artefatos, cria ou reaproveita o rascunho da tag com as notas, envia os arquivos
   e confere o rascunho: lista e tamanhos (`uploaded release assets.json all`) e
   download de cada arquivo comparado byte a byte. Rascunhos não são públicos;
   os feeds estáveis continuam na versão anterior.
5. **Publish after maintainer approval** é o único job com `environment: release`.
   Ele espera a aprovação. Depois dela, recompõe a pasta, exige que a release ainda
   seja rascunho, confere de novo lista, tamanhos e bytes do rascunho e só então
   publica como mais recente. Nada é recompilado após a aprovação. Por fim baixa
   cada arquivo sem token, compara byte a byte, valida a pasta pública com
   `assets public all` e confere que `releases/latest/download/` serve
   `latest-linux.yml`, `latest.yml` e `latest-mac.yml` desta versão. Qualquer
   diferença falha o job com uma anotação de erro.

### Aprovação

O ambiente **release** precisa ter revisores obrigatórios; o nome no YAML sozinho
não cria a aprovação. Em **Settings → Environments → release**, mantenha
**Required reviewers** com o mantenedor e, de preferência, restrinja
**Deployment branches and tags** a tags `v*`. Para conferir:

```bash
gh api repos/nathanmota-dev/life-board/environments/release \
  --jq '.protection_rules[] | {type, reviewers: [.reviewers[]?.reviewer.login]}'
```

O resultado deve conter `required_reviewers` com o mantenedor. Em 2026-10-21 o
ambiente exige `nathanmota-dev`, sem política de branches/tags.

Quando o rascunho estiver pronto, o run fica em **Waiting** no job de publicação.
Faça o [teste manual](#teste-manual-antes-de-aprovar) com os arquivos do rascunho e
use **Review deployments** para aprovar ou rejeitar. Os artefatos expiram em 14
dias; aprove antes disso ou reexecute o workflow.

## Build de branch sem publicação

O contrato de inputs/outputs e do manifesto está em
[Workflows e artefatos](multiplataforma.md#contrato-de-workflows-e-artefatos).
Uma execução manual do orquestrador roda os quatro builds, o fan-in e a validação
combinada no commit escolhido, sem criar tags, rascunhos ou releases e sem tocar nos
feeds, inclusive quando o dispatch seleciona uma tag. Os jobs de rascunho e de
publicação aparecem como pulados. Os builds Windows e macOS saem sem assinatura
de produção (unsigned/ad-hoc), aceitos apenas nesse modo. É assim que as tarefas
multiplataforma são validadas juntas em uma branch de integração:

```bash
gh workflow run release.yml --ref <branch>
gh run list --workflow release.yml --branch <branch>
gh run view <run-id> --log
# Escolha um diretório vazio; não misture execuções.
gh run download <run-id> --name release-assets --dir /tmp/life-board-release-<run-id>
for target in linux-x64 windows-x64 macos-x64 macos-arm64; do
  gh run download <run-id> --name "$target" --dir "/tmp/life-board-artifacts-<run-id>/$target"
done
# No checkout do mesmo commit, com npm ci já executado:
node desktop/scripts/release-checks.mts assets /tmp/life-board-artifacts-<run-id>/linux-x64 linux-x64
node desktop/scripts/release-checks.mts compose /tmp/life-board-artifacts-<run-id> /tmp/life-board-combined-<run-id>
node desktop/scripts/release-checks.mts assets /tmp/life-board-release-<run-id> all
diff -r /tmp/life-board-release-<run-id> /tmp/life-board-combined-<run-id>
```

`build-info.json.sourceSha` de cada artefato deve ser igual ao `headSha` da
execução, `releaseTag` deve ser `null`, e `gh release list` deve continuar sem novo
rascunho/release. As verificações comparam os manifestos com o checkout local, não
usam o SHA do próprio manifesto como origem. `RELEASE_TAG` vazio é o padrão; para
conferir artefatos de release use `RELEASE_TAG=vX.Y.Z` no checkout da tag.

Cada build também pode rodar sozinho (`gh workflow run build-linux.yml --ref <branch>`
e equivalentes), com o mesmo artefato. O [GitHub exige](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
que um workflow com dispatch esteja registrado na branch padrão; antes disso, use
o orquestrador já registrado. Valide os YAMLs com `actionlint .github/workflows/*.yml`,
que também confere inputs, outputs e secrets das chamadas locais.

## Comandos de verificação

Execute a partir da raiz do checkout do commit compilado, depois de `npm ci`:

| Comando | Verifica |
| --- | --- |
| `assets <pasta> <alvo>` | Um artefato de build: instaladores, feed, blockmaps, proveniência, assinatura e checksums |
| `builds` | `toJSON(needs)` em `BUILDS`: resultado, nomes, versão, commit, tag e assinatura dos três builds |
| `compose <artefatos> <saída>` | Valida `<artefatos>/{linux-x64,windows-x64,macos-x64,macos-arm64}` e monta a pasta de upload vazia `<saída>` |
| `assets <pasta> all` | Pasta combinada: exatamente os arquivos públicos, todos os feeds e blockmaps, `SHA256SUMS.txt` global |
| `uploaded <pasta> <assets.json> all` | Assets do rascunho (`gh release view --json assets`): mesmos nomes, sem duplicados, mesmos tamanhos |
| `draft-action <tag> <true\|false\|missing>` | `create`, `reuse` ou erro para release já publicada |

O comando é `node desktop/scripts/release-checks.mts …`. Os alvos individuais
continuam aceitos por `assets` e `uploaded`.

## Teste manual antes de aprovar

Baixe os arquivos do rascunho (`gh release download v<x.y.z> --dir <pasta>`) e
confira `sha256sum -c SHA256SUMS.txt`. Depois, em máquinas de teste:

1. **Linux** (GNOME com chaveiro e agente PolicyKit): instalação limpa com
   `sudo apt install ./life-board_<versão>_amd64.deb`, abertura pelo menu, banco,
   chaveiro, bandeja, instância única, pomodoro e inicialização com o sistema;
   migração a partir do AppImage manual conforme
   [Instalação no Linux](instalacao-linux.md#migrar-do-appimage-manual-para-o-deb).
2. **Windows x64**: instalador assinado com o publisher esperado, instalação em
   usuário comum, abertura e dados, conforme [Instalação no Windows](instalacao-windows.md).
3. **macOS Intel e Apple Silicon**: DMG de cada arquitetura com Gatekeeper,
   abertura e Keychain, conforme [Instalação no macOS](instalacao-macos.md).
4. A partir da segunda release, atualização pelo app em cada formato (DEB
   cancelando e depois autorizando o PolicyKit, AppImage, NSIS e os dois Macs).
   Antes disso, use o teste com feed local de
   [Atualizações](atualizacoes.md#testes-com-pacotes-controlados).

A matriz completa, as evidências e os bloqueios estão em
[Validação multiplataforma](validacao-multiplataforma.md). Não aprove enquanto um
alvo tiver um bloqueio aberto ou um item obrigatório sem evidência. Se algo
falhar, rejeite a aprovação. O rascunho continua invisível para os usuários.

## Falhas e novas execuções

- **Algum build falha, é cancelado ou não roda:** o fan-in não roda e nenhum
  rascunho é criado. Um Windows ou macOS bem-sucedido nunca é publicado sem os
  outros alvos. Corrija na `main`; se a correção mudar o código, apague a tag
  (`git push --delete origin v<x.y.z>` e `git tag -d v<x.y.z>`), recrie no commit
  corrigido e envie de novo.
- **Artefato incompatível** (outro commit, versão ou tag, assinatura ausente,
  arquivo faltando, extra ou duplicado, checksum alterado, feed inválido): o
  `verify` ou o `draft` falha e o job de publicação nunca é alcançado.
- **Falha ao enviar ou conferir o rascunho:** reexecute o workflow. Um rascunho
  existente da mesma tag é reaproveitado: seus arquivos são removidos e reenviados a
  partir do novo run, sem criar uma segunda release.
- **Aprovação rejeitada:** o job de publicação falha, o rascunho continua não
  publicado e os feeds públicos não mudam. Corrija, apague o rascunho e a tag e
  recomece, ou reexecute para aprovar depois.
- **Release já publicada:** o workflow recusa a tag (`draft-action`), e a publicação
  exige que a release ainda seja rascunho. Binários publicados nunca são
  substituídos, porque instalações podem ter baixado e conferido o SHA-512 deles.
  Uma correção depois da publicação sai em uma nova versão de patch.
- **Entrega pública incompleta:** se um arquivo ou feed não puder ser baixado sem
  token ou diferir do build, o último job falha visivelmente. Investigue antes de
  anunciar a versão; não substitua os arquivos publicados.
- Execuções da mesma tag não rodam em paralelo (`concurrency`).

## Permissões e credenciais

O workflow tem `contents: read` por padrão; somente os jobs de rascunho e de
publicação recebem `contents: write`, usando o `GITHUB_TOKEN` da execução. Os
secrets de assinatura são repassados apenas aos builds Windows/macOS em release e
apenas ao passo de empacotamento; os jobs com permissão de escrita não recebem
nenhum deles. Nenhum segredo é embutido no app: `app-update.yml` contém só o dono,
o repositório e o canal, e o updater lê a release pública sem token. O token da
integração GitHub do usuário nunca é usado para atualizações.
