# Publicação de releases

[← Guia da documentação](guide.md)

A distribuição oficial é **Linux x64**, em DEB e AppImage. O workflow
`.github/workflows/release.yml` é disparado por uma tag `vMAJOR.MINOR.PATCH` e chama
somente `build-linux.yml`. Windows e macOS permanecem no código para desenvolvimento,
mas seus workflows foram removidos: certificados, serviços de assinatura e a
adesão ao Apple Developer Program estão fora do escopo atual.

## Arquivos publicados

| Arquivo | Uso |
| --- | --- |
| `life-board_<versão>_amd64.deb` | Instalação e atualização DEB |
| `life-board-<versão>-x86_64.AppImage` | Instalação e atualização AppImage |
| `latest-linux.yml` | Feed Linux do atualizador, com ambos os formatos |
| `SHA256SUMS.txt` | SHA-256 dos três arquivos acima |

O `build-info.json` fica no artefato interno `linux-x64` do Actions, com o commit,
a versão, o alvo e a tag. Ele é conferido antes da composição e não é publicado.
Não há instaladores Windows/macOS nem feeds `latest.yml` ou `latest-mac.yml` na
release. O feed Linux continua compatível com os clientes existentes.

## Preparar uma versão

1. Atualize `version` em `package.json` e `package-lock.json` com
   `npm version <x.y.z> --no-git-tag-version`.
2. Escreva `docs/release-notes/<x.y.z>.md` com funcionalidades e limitações reais.
3. Mantenha os links do README apontando para uma versão publicada.
4. Integre a preparação à `main` por PR com as verificações do `AGENTS.md` aprovadas.
5. Crie a tag no commit integrado:

   ```bash
   git switch main && git pull --ff-only
   git tag v<x.y.z>
   git push origin v<x.y.z>
   ```

Não são necessários secrets de assinatura Windows ou Apple para a release Linux.

## O que o workflow faz

```text
validate → Linux (E2E → build) → verify → draft → [aprovação] → publish
```

1. **Validate release request** exige tag estável igual à versão do projeto e
   notas não vazias. Só push de tag ativa publicação; dispatch manual é build-only.
2. **Linux** executa E2E, typecheck, testes, cobertura, empacotamento DEB/AppImage,
   inspeção e teste do DEB instalado. Gera proveniência e checksums no artefato
   `linux-x64` deste run.
3. **Verify complete release assets** confere a saída do build e compõe os quatro
   arquivos públicos usando `compose artifacts release linux`. Rejeita origem,
   versão, tag, feeds ou checksums divergentes e arquivos extras. O resultado fica
   no artefato `release-assets` por 14 dias.
4. **Stage draft release** recompõe o pacote a partir do mesmo artefato Linux,
   cria ou reaproveita o rascunho, envia os arquivos e compara o download byte a
   byte. Uma versão já publicada não pode ser sobrescrita.
5. **Publish after maintainer approval** espera no ambiente `release`. Após a
   aprovação, revalida o rascunho sem recompilar, publica como latest e confere os
   downloads públicos e `latest-linux.yml` sem token.

### Aprovação

O ambiente **release** precisa de revisores obrigatórios. Confira em
**Settings → Environments → release**; restrinja preferencialmente a tags `v*`.

```bash
gh api repos/nathanmota-dev/life-board/environments/release \
  --jq '.protection_rules[] | {type, reviewers: [.reviewers[]?.reviewer.login]}'
```

Quando o run aguardar revisão, faça o [teste manual](#teste-manual-antes-de-aprovar)
e use **Review deployments** para aprovar ou rejeitar. Nenhum pacote é publicado
antes dessa etapa. Os artefatos expiram em 14 dias.

## Build de branch sem publicação

Dispatch manual compila e valida somente Linux, inclusive se selecionar uma tag.
Não cria tag, rascunho ou release e não altera feeds públicos.

```bash
gh workflow run release.yml --ref <branch>
gh run list --workflow release.yml --branch <branch>
gh run download <run-id> --name linux-x64 --dir /tmp/life-board-artifacts-<run-id>/linux-x64
gh run download <run-id> --name release-assets --dir /tmp/life-board-release-<run-id>
node desktop/scripts/release-checks.mts compose /tmp/life-board-artifacts-<run-id> /tmp/life-board-combined-<run-id> linux
node desktop/scripts/release-checks.mts assets /tmp/life-board-release-<run-id> linux
diff -r /tmp/life-board-release-<run-id> /tmp/life-board-combined-<run-id>
```

Use diretórios novos, dependências instaladas e checkout do mesmo commit do run.
Para artefatos de tag, defina `RELEASE_TAG=vX.Y.Z`; em build-only deixe vazio.
Também é possível executar `build-linux.yml` sozinho. Não existem mais dispatches
`build-windows.yml` ou `build-macos.yml`.

## Comandos de verificação

| Comando (`node desktop/scripts/release-checks.mts …`) | Verifica |
| --- | --- |
| `assets <pasta> linux-x64` | Artefato interno Linux, incluindo proveniência |
| `builds linux` | Saída do job Linux em `BUILDS`, comparada ao checkout |
| `compose <artefatos> <saída> linux` | Somente `<artefatos>/linux-x64`; gera os quatro arquivos públicos |
| `assets <pasta> linux` | Arquivos públicos Linux, feed e checksums, sem manifesto |
| `uploaded <pasta> <assets.json> linux` | Lista e tamanhos exatos dos arquivos publicados |
| `draft-action <tag> <true\|false\|missing>` | Criação/reuso de rascunho, recusando versão já publicada |

A distinção entre `linux-x64` (artefato interno) e `linux` (release pública) é
intencional. Os validadores dos outros alvos e o escopo `all` permanecem para
suporte técnico e testes locais, mas não são usados pelo workflow de publicação.
Valide os workflows com `actionlint .github/workflows/*.yml`.

## Teste manual antes de aprovar

Baixe o rascunho com `gh release download v<x.y.z> --dir <pasta>` e rode
`sha256sum -c SHA256SUMS.txt` nessa pasta. Em Linux de teste:

1. Instale o DEB, abra pelo menu e confira banco, chaveiro, bandeja, instância
   única, pomodoro e inicialização com o sistema.
2. Confira o AppImage e a migração descrita em
   [Instalação no Linux](instalacao-linux.md#migrar-do-appimage-manual-para-o-deb).
3. Teste atualização a partir da versão anterior em DEB (incluindo cancelamento
   e autorização PolicyKit) e AppImage. Consulte
   [Atualizações](atualizacoes.md#testes-com-pacotes-controlados).

Preserve dados existentes. Não aprove uma release com falhas Linux pendentes.
A [validação multiplataforma](validacao-multiplataforma.md) preserva evidências
históricas dos demais sistemas; eles não integram o escopo da release atual.

## Falhas e novas execuções

- Se Linux falhar, nenhum rascunho é criado. Corrija na `main` por PR.
- Se a tag ainda não foi publicada e o código mudou, recrie-a no commit corrigido:
  `git push --delete origin v<x.y.z>`, `git tag -d v<x.y.z>`,
  `git tag v<x.y.z>` e `git push origin v<x.y.z>`.
- Se apenas o upload falhar, reexecute o workflow. O rascunho é reaproveitado com
  os arquivos do novo run, sempre comparados byte a byte.
- Aprovação rejeitada mantém o rascunho invisível. Corrija e reexecute.
- Uma versão publicada é imutável. Correções exigem nova versão patch; nunca
  substitua binários que usuários já possam ter baixado.
- Um download público incorreto falha o último job. Não anuncie a versão antes
  da conferência dos arquivos e do feed.

## Permissões e credenciais

Os jobs têm `contents: read`, exceto criação do rascunho e publicação, com
`contents: write` e `GITHUB_TOKEN`. Não há secrets Windows/Apple no orquestrador.
O aplicativo consulta releases públicas sem token; credenciais da integração
pessoal GitHub não são usadas para atualizar o Life Board.
