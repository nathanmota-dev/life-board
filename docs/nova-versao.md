# Lançar uma nova versão

[← Guia da documentação](guide.md)

Checklist rápido para publicar uma versão nova. Detalhes do workflow, falhas e
novas execuções ficam em [Publicação de releases](releases.md).

> Commits e merges na `main` **não** geram release. Só uma tag `vX.Y.Z` nova
> dispara o workflow. Uma versão publicada nunca é reaproveitada: cada release
> precisa de um número novo.

## 1. Escolher o número

| Mudança | Exemplo |
| --- | --- |
| Só correções | `1.0.0` → `1.0.1` |
| Funcionalidades novas | `1.0.1` → `1.1.0` |
| Mudança que quebra compatibilidade | `1.1.0` → `2.0.0` |

Os exemplos abaixo usam `1.1.0`; troque pela versão escolhida.

## 2. Preparar a versão em um branch

```bash
git switch main && git pull --ff-only
git switch -c chore/release-1.1.0
npm version 1.1.0 --no-git-tag-version
```

O `npm version` atualiza `package.json` e `package-lock.json`. Depois:

- Crie `docs/release-notes/1.1.0.md` com o que mudou. O texto vira as notas da
  release no GitHub e aparece em **Configurações → Atualizações**. Use
  `docs/release-notes/1.0.0.md` como modelo.
- No `README.md`, troque `1.0.0` pela nova versão nos links e no comando
  `sudo apt install ./life-board_1.1.0_amd64.deb`.

## 3. Abrir o PR e fazer o merge

Commit (`chore: release 1.1.0`), PR e merge na `main`, com as verificações
passando.

## 4. Criar e enviar a tag

A publicação é somente Linux x64 (DEB e AppImage). Não são necessários
certificados Windows ou credenciais Apple. Confira os testes Linux e as notas
da versão antes de enviar a tag.

```bash
git switch main && git pull --ff-only
git tag v1.1.0
git push origin v1.1.0
```

A tag precisa ser igual à versão do `package.json`, com `v` na frente. Se não
for, ou se faltarem as notas da versão, o workflow falha logo no início, sem
publicar nada.

## 5. Testar e aprovar

1. Acompanhe em **Actions → Release**.
2. Quando o job **Publish after maintainer approval** mostrar *Waiting for review*,
   abra **Releases** e baixe os arquivos do rascunho. No Linux, instale o `.deb`:
   `sudo apt install ./life-board_1.1.0_amd64.deb`. Para o
   AppImage, confira também abertura e atualização conforme o guia de
   [Linux](instalacao-linux.md).
3. Nos dois formatos Linux, confira se o app abre, se os dados continuam lá e se a versão
   nova aparece em **Configurações → Atualizações**. O teste completo está em
   [Teste manual antes de aprovar](releases.md#teste-manual-antes-de-aprovar).
4. Tudo certo: **Review deployments → release → Approve and deploy**.
   Algo errado: **Reject**. Nada é publicado e o rascunho continua invisível.

Depois de aprovada, quem tem o app instalado recebe a versão nova em
**Configurações → Atualizações**.

## Se algo der errado

- **O workflow falhou antes do rascunho:** corrija na `main` por PR e recrie a tag
  no commit novo:

  ```bash
  git switch main && git pull --ff-only
  git tag -d v1.1.0
  git push --delete origin v1.1.0
  git tag v1.1.0
  git push origin v1.1.0
  ```

- **Falha ao enviar o rascunho:** use **Re-run jobs** na execução. O rascunho é
  reaproveitado, sem criar outra release.
- **Já publicou e encontrou um bug:** não substitua a release. Lance uma versão de
  correção (`1.1.1`) seguindo este checklist desde o início.
