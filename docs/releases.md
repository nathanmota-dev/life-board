# Publicação de releases

[← Guia da documentação](guide.md)

As releases Linux x64 são orquestradas por `.github/workflows/release.yml` a partir
de uma tag `vMAJOR.MINOR.PATCH`. O build é feito pelo workflow reutilizável
`.github/workflows/build-linux.yml`. Cada release pública contém exatamente:

| Arquivo | Uso |
| --- | --- |
| `life-board_<versão>_amd64.deb` | Instalação com `sudo apt install ./…` e atualização de instalações DEB |
| `life-board-<versão>-x86_64.AppImage` | Uso sem instalação e atualização de instalações AppImage (blockmap embutido) |
| `latest-linux.yml` | Feed do `electron-updater`: versão, nomes, tamanhos e SHA-512 dos dois pacotes |
| `build-info.json` | Commit, versão, sistema, arquitetura e tag (ou `null` em build sem publicação) |
| `SHA256SUMS.txt` | SHA-256 dos dois pacotes, do feed e de `build-info.json`; confira com `sha256sum -c` |

O app instalado lê `latest-linux.yml` da release marcada como mais recente em
`nathanmota-dev/life-board` (provedor `github`, canal `latest`) e escolhe somente
o arquivo do seu formato e arquitetura. O feed e os pacotes vêm sempre do mesmo
build; não edite nem substitua arquivos de uma release manualmente.

## Preparar uma versão

1. Atualize `version` em `package.json` e `package-lock.json` (`npm version <x.y.z> --no-git-tag-version`).
2. Crie `docs/release-notes/<x.y.z>.md` com as funcionalidades, plataforma e
   arquitetura suportadas, instalação e limitações conhecidas. O texto vira as notas
   da release e aparece em **Configurações → Atualizações**.
3. Atualize os links da versão no `README.md`.
4. Integre essas mudanças à `main` por PR, com as verificações abaixo aprovadas.
5. Crie e envie a tag no commit integrado:

   ```bash
   git switch main && git pull --ff-only
   git tag v<x.y.z>
   git push origin v<x.y.z>
   ```

## O que o workflow faz

O job **Check and package Linux** chama `build-linux.yml` no mesmo commit/tag.
O filho chama primeiro o [Electron E2E](e2e.md) como **E2E build gate** e exige
sucesso antes de empacotar. Esse gate também se aplica à execução manual do filho.
Relatórios e evidências de falhas ficam no artefato `electron-e2e` por 14 dias.

O job **Check and package Linux x64** mantém `ubuntu-24.04`, Node.js 24.18.0
(verificados em execução) e `npm ci` a partir do lockfile:

1. Em chamadas com `release: true`, exige uma referência de tag `vX.Y.Z` estável,
   igual à versão do `package.json`, e notas não vazias. O orquestrador só ativa
   esse modo em eventos de push de tags; dispatch manual sempre usa build-only.
2. Roda `npm run typecheck`, `npm test` e `npm run test:coverage` (API ≥ 80%).
3. Gera DEB, AppImage e `latest-linux.yml` com `npm run package:linux`
   (`--publish never`), grava `build-info.json` a partir de `git rev-parse HEAD`
   (exigindo igualdade com `GITHUB_SHA`) e escreve `SHA256SUMS.txt`.
4. `node desktop/scripts/release-checks.mts assets release linux-x64` confere
   commit, versão, alvo e tag, os nomes exatos do feed, os tamanhos e SHA-512
   dos pacotes e os SHA-256 dos quatro arquivos. Manifesto malformado, origem
   divergente, arquivo ausente/corrompido ou checksum duplicado faz o build falhar.
5. Inspeciona o DEB com `dpkg-deb` (pacote `life-board`, versão, `amd64`, app,
   `app.asar`, migrations, `app-update.yml`, `package-type`, atalho e ícone), instala
   com `apt-get install ./…`, valida o atalho e roda `desktop/scripts/smoke-deb.sh`:
   abre o app instalado com GNOME Keyring desbloqueado e confere API, banco e
   chave criptografada. Em falhas, exibe os logs do app/backend.
6. Só depois de todos os gates envia os cinco arquivos como artefato `linux-x64`,
   com `if-no-files-found: error` e retenção de 14 dias. O AppImage contém seu
   blockmap; não há blockmap externo para Linux.

O job **Stage draft release** cria uma release em rascunho para a tag, com as notas
da versão, valida novamente o artefato baixado contra o commit/tag do checkout,
envia os cinco arquivos e confere que a lista e os tamanhos enviados são exatamente
os do build. Esse job depende do sucesso de todo o workflow Linux. Rascunhos não
são públicos, então o feed estável continua apontando para a versão anterior.

O job **Publish after smoke-test approval** usa o ambiente `release`. Configure em
**Settings → Environments → release** a aprovação obrigatória pelo mantenedor.
Antes de aprovar, faça o teste manual abaixo com os arquivos do rascunho. Depois da
aprovação, o job confere o rascunho de novo, publica como release mais recente e
baixa cada arquivo e `releases/latest/download/latest-linux.yml` sem autenticação,
comparando byte a byte com o build.

Uma execução manual (**Run workflow**) do orquestrador ou de **Build Linux** roda
E2E, verificações, empacotamento e artefatos, sem criar tags, rascunhos ou releases,
inclusive quando o dispatch seleciona uma tag. O filho tem somente `contents: read`,
não recebe credenciais de publicação e não cria/envia assets de GitHub Releases.
O feed gerado fica apenas no artefato da execução.

## Build de branch sem publicação

O contrato de inputs/outputs e do manifesto está em
[Workflows e artefatos](multiplataforma.md#contrato-de-workflows-e-artefatos).
Para validar uma branch sem mudar a versão ou criar uma tag:

```bash
gh workflow run build-linux.yml --ref <branch>
gh run list --workflow build-linux.yml --branch <branch>
gh run view <run-id> --log
# Escolha um diretório vazio; não misture plataformas ou execuções.
gh run download <run-id> --name linux-x64 --dir /tmp/life-board-linux-<run-id>
# No checkout do mesmo commit, com npm ci já executado:
node desktop/scripts/release-checks.mts assets /tmp/life-board-linux-<run-id> linux-x64
```

`build-info.json.sourceSha` deve ser igual ao `headSha` da execução e ao commit
selecionado, `releaseTag` deve ser `null`, e `gh release list` deve continuar sem
novo rascunho/release. `assets` compara o manifesto com o checkout local, não usa
o SHA do próprio manifesto como origem esperada. `RELEASE_TAG` vazio é o padrão;
para conferir um artefato de release use `RELEASE_TAG=vX.Y.Z` no checkout da tag.

O [GitHub exige](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
que um workflow com dispatch esteja registrado na branch padrão.
Antes da primeira integração de `build-linux.yml`, use o orquestrador já registrado:
`gh workflow run release.yml --ref <branch>`. Ele chama o filho da mesma branch em
modo build-only. Depois de integrado, o dispatch direto fica disponível.
Valide ambos os YAMLs com `actionlint .github/workflows/*.yml` (inclui a resolução
das chamadas locais); não é necessário produzir uma tag de teste.

## Teste manual antes de aprovar

Em um desktop Linux de teste (GNOME com chaveiro e agente PolicyKit), com os
arquivos baixados do rascunho:

1. `sha256sum -c SHA256SUMS.txt`.
2. Instalação limpa: `sudo apt install ./life-board_<versão>_amd64.deb`, abertura
   pelo menu, primeira criação do banco, chaveiro, bandeja, instância única,
   pomodoro e inicialização com o sistema.
3. Migração a partir do AppImage manual, conforme
   [Instalação no Linux](instalacao-linux.md#migrar-do-appimage-manual-para-o-deb).
4. A partir da segunda release, atualização pelo app de uma instalação DEB
   (cancelando e depois autorizando o PolicyKit) e de um AppImage. Antes da primeira
   release, use o teste com feed local de [Atualizações](atualizacoes.md#testes-com-pacotes-controlados).

Se algo falhar, rejeite a aprovação. O rascunho continua invisível para os usuários.

## Falhas e novas execuções

- **Verificações ou empacotamento falham:** nenhuma release é criada. Corrija na
  `main`; se a correção mudar o código, apague a tag (`git push --delete origin v<x.y.z>`
  e `git tag -d v<x.y.z>`), recrie no commit corrigido e envie de novo.
- **Falha ao enviar ou conferir o rascunho:** reexecute o workflow. Um rascunho
  existente é reaproveitado: os arquivos dele são removidos e reenviados a partir
  do novo build, sem criar uma segunda release.
- **Aprovação rejeitada:** corrija, apague o rascunho e a tag e recomece.
- **Release já publicada:** o workflow recusa a tag. Binários publicados nunca são
  substituídos, porque instalações podem ter baixado e conferido o SHA-512 deles.
  Uma correção depois da publicação sai em uma nova versão de patch.
- Execuções da mesma tag não rodam em paralelo (`concurrency`).

## Permissões e credenciais

O workflow tem `contents: read` por padrão; somente os jobs de rascunho e de
publicação recebem `contents: write`, usando o `GITHUB_TOKEN` da execução. Nenhum
segredo é embutido no app: `app-update.yml` contém só o dono, o repositório e o
canal, e o updater lê a release pública sem token. O token da integração GitHub do
usuário nunca é usado para atualizações.
