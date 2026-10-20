# Publicação de releases

[← Guia da documentação](guide.md)

As releases Linux x64 são geradas por `.github/workflows/release.yml` a partir de
uma tag `vMAJOR.MINOR.PATCH`. Cada release pública contém exatamente:

| Arquivo | Uso |
| --- | --- |
| `life-board_<versão>_amd64.deb` | Instalação com `sudo apt install ./…` e atualização de instalações DEB |
| `life-board-<versão>-x86_64.AppImage` | Uso sem instalação e atualização de instalações AppImage (blockmap embutido) |
| `latest-linux.yml` | Feed do `electron-updater`: versão, nomes, tamanhos e SHA-512 dos dois pacotes |
| `SHA256SUMS.txt` | SHA-256 dos dois pacotes e do feed, para conferência manual com `sha256sum -c` |

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

O job **Check and package** roda no `ubuntu-24.04` com Node.js 24.18.0 (compatível
com `engines.node`) e `npm ci` a partir do lockfile:

1. Rejeita a tag se não for `vX.Y.Z` estável (sem pré-release ou metadados de build)
   ou se for diferente da versão do `package.json`. Exige as notas da versão.
2. Roda `npm run typecheck`, `npm test` e `npm run test:coverage` (API ≥ 80%).
3. Gera DEB, AppImage e `latest-linux.yml` com `npm run package:linux`
   (`--publish never`: o electron-builder nunca publica sozinho) e escreve `SHA256SUMS.txt`.
4. `node desktop/scripts/release-checks.mts assets release` confere que o feed
   anuncia a versão da tag, lista exatamente os dois pacotes, que tamanhos e SHA-512
   batem com os arquivos e que os checksums cobrem todos os arquivos.
5. Inspeciona o DEB com `dpkg-deb` (pacote `life-board`, versão, `amd64`, app,
   `app.asar`, migrations, `app-update.yml`, atalho e ícone), instala com
   `apt-get install ./…`, valida o atalho e roda `desktop/scripts/smoke-deb.sh`:
   abre o app instalado sem interface gráfica, com um GNOME Keyring desbloqueado,
   e confere a API, o banco criado pelas migrations e a chave no chaveiro.
6. Guarda os quatro arquivos como artefato `linux-x64` da execução.

O job **Stage draft release** cria uma release em rascunho para a tag, com as notas
da versão, envia os quatro arquivos e confere que a lista e os tamanhos enviados
são exatamente os do build. Rascunhos não são públicos, então o feed estável
continua apontando para a versão anterior.

O job **Publish after smoke-test approval** usa o ambiente `release`. Configure em
**Settings → Environments → release** a aprovação obrigatória pelo mantenedor.
Antes de aprovar, faça o teste manual abaixo com os arquivos do rascunho. Depois da
aprovação, o job confere o rascunho de novo, publica como release mais recente e
baixa cada arquivo e `releases/latest/download/latest-linux.yml` sem autenticação,
comparando byte a byte com o build.

Uma execução manual (**Run workflow**) roda somente o primeiro job: verificações,
empacotamento e artefatos, sem criar release. Use-a para testar o processo.

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
