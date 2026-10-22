# Validação multiplataforma

[← Guia da documentação](guide.md)

Registro da validação integrada da série multiplataforma (#26–#31), pedida pela
#32. Cada item diz **passou**, **falhou** ou **não executado**, com o motivo. Um alvo
só é considerado validado com execução nativa no sistema e na arquitetura dele;
build cruzado, inspeção de arquivo e testes com mocks aparecem separados.

Base: `release/1.1.0` em `1e72d77` (inclui #26–#31, #41 e #42). A versão do
`package.json` continua 1.0.0; nenhuma tag, rascunho, release ou feed de teste foi
criado (`gh release list` mostra só `v1.0.0`).

## Resumo

| Alvo | Pacote instalado nativamente | Assinatura de produção | Atualização entre duas versões reais | Situação |
| --- | --- | --- | --- | --- |
| Linux x64 | Smoke do DEB em CI e container (`1e72d77`) | Não se aplica | Não executada | Parcial |
| Windows x64 | Smoke do NSIS no runner `windows-2022` | Bloqueada: sem certificado | Não executada | Parcial; produção bloqueada |
| macOS x64 | Smoke do DMG no runner `macos-15-intel` (ad-hoc) | Bloqueada: sem Developer ID | Não executada | Parcial; produção bloqueada |
| macOS arm64 | Smoke do DMG no runner `macos-15` (ad-hoc) | Bloqueada: sem Developer ID | Não executada | Parcial; produção bloqueada |

O suporte multiplataforma **ainda não está pronto para release**. Os bloqueios estão
em [Bloqueios](#bloqueios) e precisam ser resolvidos antes de aprovar a 1.1.0.

## Verificações locais

Ubuntu 26.04.1 LTS x86_64, kernel 7.0.0-38, Node.js 24.18.0, em `1e72d77`.

| Comando | Resultado |
| --- | --- |
| `npm ci` | Passou, sem alterar o lockfile. |
| `npm run typecheck` | Passou nos projetos desktop, web, API e E2E. |
| `npm test` | Passou: 363 testes desktop (20 arquivos), 322 web (40) e 188 API (38). |
| `npm run test:coverage` | Passou: API com 99,38% statements, 98,53% branches, 97,43% funções e 99,39% linhas; limite de 80% em cada métrica. |
| `npm run build` | Passou. |
| `npm run test:e2e:infra` | Passou: 3 testes. |
| `npm run test:e2e` | Passou: 95 cenários no Electron real. Na primeira execução, um worker do Playwright caiu com `SIGSEGV` em `updates.spec.ts` (94 passaram); a spec sozinha passou (5 cenários) e a suíte completa repetida passou inteira. |
| `npm run package:linux` | Passou: `life-board_1.0.0_amd64.deb`, `life-board-1.0.0-x86_64.AppImage` e `latest-linux.yml`; o hook carregou `@libsql/linux-x64-gnu`. |
| `node desktop/scripts/release-checks.mts assets release` | Passou, após gerar `SHA256SUMS.txt`; `sha256sum -c SHA256SUMS.txt` também passou. |
| `dpkg-deb --info` / `--contents` | Passou: pacote `life-board` 1.0.0 amd64, migrations, `app-update.yml`, `package-type` e `@libsql/linux-x64-gnu/index.node` desempacotado. |
| `desktop/scripts/smoke-deb.sh` | Passou com o DEB instalado em um container Ubuntu 24.04 limpo (`seccomp=unconfined`), usuário sem privilégios: `/api/health` respondeu `{"ok":true}` e criou `life-board.db` e `secret.key.enc` no perfil padrão e com `XDG_CONFIG_HOME="…/Configuração Ç #1 %20"`. `desktop-file-validate` passou. |

## Execuções nativas em CI

Runs de push na branch `ci/multiplatform-release-approval` em `d834379`, o commit
da #31 antes do merge em `release/1.1.0`. São builds de branch: Windows sem
assinatura, macOS com assinatura ad-hoc.

| Alvo | Run | Ambiente | Resultado |
| --- | --- | --- | --- |
| Windows x64 | [39680371959](https://github.com/nathanmota-dev/life-board/actions/runs/39680371959) | `windows-2022`, imagem 20261012.333.1, Windows NT 10.0.20348.0, Node 24.18.0 | Passou: typecheck, testes, cobertura, NSIS, instalação como usuário comum descartável (`administrator: false`) com espaços no perfil, `/api/health`, tarefa preservada após reinício e chave DPAPI decifrada no segundo início. `signing: unsigned`. Instalador `51f1d064…5a4c`, executável `862f2b7d…b283`. |
| Windows x64, saída forçada | [39678717274](https://github.com/nathanmota-dev/life-board/actions/runs/39678717274) | Mesmo runner, em `d0ed0e9` (#41) | Passou: `forcedExit.outcome = healthy-new-key`, com `localStateKeySaved: false` e `keyPending: true`, como descrito em [chave dos segredos no Windows](multiplataforma.md#chave-dos-segredos-no-windows). |
| macOS x64 | [39680371963](https://github.com/nathanmota-dev/life-board/actions/runs/39680371963) | `macos-15-intel`, macOS 15.7.9, `x86_64`, sem Rosetta | Passou: DMG montado, app copiado para pasta com espaços, `/api/health`, tarefa e item do Keychain preservados após reinício. `signing: adhoc`, CDHash `6509c128…1d58da`; DMG `534b4615…4559`, ZIP `3900cec7…b553`. |
| macOS arm64 | [39680371963](https://github.com/nathanmota-dev/life-board/actions/runs/39680371963) | `macos-15` (imagem `macos-15-arm64` 20260907.0337.1), macOS 15.7.9 (24G830), `arm64`, sem Rosetta | Passou: mesmo smoke. `signing: adhoc`, CDHash `22166d88…76d7`; DMG `174a092e…15c5`, ZIP `e5429547…0c22`. |
| Linux x64 | [39644976340](https://github.com/nathanmota-dev/life-board/actions/runs/39644976340) (Release, dispatch em `b42f485`) | `ubuntu-24.04` | Passou: E2E, checks, DEB/AppImage e smoke do DEB. Rascunho e publicação pulados (build-only). |

Os arquivos `smoke.json` e `signing-info.json` vêm dos artefatos
`windows-x64-smoke`, `macos-x64-diagnostics` e `macos-arm64-diagnostics` desses runs:

```bash
gh run download 39680371959 --name windows-x64-smoke --dir <pasta>
gh run download 39680371963 --name macos-x64-diagnostics --dir <pasta>
gh run download 39680371963 --name macos-arm64-diagnostics --dir <pasta>
```

Esses runs não usam o commit integrado: entre `d834379` e `1e72d77` entraram a
correção da chave no Windows (#41) e os quadros de arquivos (#42). Também não
existe run do orquestrador `release.yml` com os quatro alvos depois da #31. O
dispatch build-only abaixo ficou pendente nesta sessão, porque a política de
permissões do agente não permitiu disparar workflows:

```bash
gh workflow run release.yml --ref release/1.1.0
```

## Matriz manual

Nenhum item abaixo foi executado em uma máquina real de usuário. Os runners de CI
não comprovam esses comportamentos.

| Verificação | Linux x64 | Windows x64 | macOS x64 | macOS arm64 |
| --- | --- | --- | --- | --- |
| Instalação limpa por usuário comum, sem Node/npm/Git | CI passou | CI passou | CI passou (ad-hoc) | CI passou (ad-hoc) |
| API, migrations e persistência após reinício | CI passou | CI passou | CI passou | CI passou |
| Credencial protegida pelo sistema (libsecret/DPAPI/Keychain) | CI passou | CI passou | CI passou (keychain temporário) | CI passou (keychain temporário) |
| Uploads e quadros de arquivos, token do GitHub cifrado | Não executado | Não executado | Não executado | Não executado |
| Caminhos com espaços e caracteres não ASCII | Container passou | Perfil com espaços passou | Perfil com espaço, acento, `#` e `%20` passou | Igual ao x64 |
| Instância única e fechar/reabrir | Não executado | Não executado | Não executado | Não executado |
| Bandeja/dock/barra de tarefas, temas claro e escuro | Não executado | Não executado | Não executado | Não executado |
| Notificações e clique para Atualizações/Pomodoro | Não executado | Não executado | Não executado | Não executado |
| Iniciar com o sistema, oculto, após reboot real | Não executado | Não executado | Não executado | Não executado |
| Atalhos Ctrl/Cmd e captura global, atalho ocupado | Não executado | Não executado | Não executado | Não executado |
| Pomodoro em execução/pausado ao fechar e ao atualizar | E2E simulado (#27) | Não executado | Não executado | Não executado |
| Gatekeeper/SmartScreen em download real | Não se aplica | Bloqueado: sem assinatura | Bloqueado: sem notarização | Bloqueado: sem notarização |
| Atualização entre duas versões reais | Não executado | Bloqueado: sem assinatura | Bloqueado: sem assinatura | Bloqueado: sem assinatura |
| Erros do updater (offline, metadados, checksum, cancelamento, sem permissão) | Testes unitários e E2E simulado (#27) | Testes unitários (#27) | Testes unitários (#27) | Testes unitários (#27) |
| Dados da 1.0.0 após upgrade para a versão nova | Não executado | Não se aplica (sem 1.0.0) | Não se aplica | Não se aplica |

Siga [Testes com pacotes controlados](atualizacoes.md#testes-com-pacotes-controlados)
para as atualizações e os guias de [Windows](instalacao-windows.md),
[macOS](instalacao-macos.md) e [Linux](instalacao-linux.md) para a instalação.
Registre em cada linha o sistema e a versão exata, a CPU, o SHA fonte, a versão do
pacote, a identidade/hash da assinatura e o resultado. Não copie o token do GitHub
para a evidência.

## Release e aprovação

| Verificação | Resultado |
| --- | --- |
| Ambiente `release` com revisor obrigatório | Passou: `gh api repos/nathanmota-dev/life-board/environments/release` mostra `required_reviewers` com `nathanmota-dev`, sem política de branches/tags. |
| Recusa de alvo ausente ou com falha antes do rascunho | Testes unitários em `desktop/scripts/release-compose.test.ts` (#31); não executado em um run real. |
| Run build-only do orquestrador com os quatro alvos | Não executado (veja acima). |
| Espera e rejeição da aprovação | Bloqueado: exige uma tag em modo release, que exige Windows e macOS `signed`. |
| Secrets de assinatura | Bloqueado: `gh secret list` e `gh variable list` estão vazios (sem `WIN_CSC_*`, `MAC_CSC_*`, `APPLE_API_*`, `WINDOWS_PUBLISHER_NAME`, `APPLE_TEAM_ID`). |

## Bloqueios

1. **Assinatura do Windows:** sem certificado Authenticode, os secrets
   `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` e a variável `WINDOWS_PUBLISHER_NAME`. Sem
   eles, o modo release falha, não há publisher para conferir com
   `Get-AuthenticodeSignature` e o upgrade assinado não pode ser testado.
2. **Assinatura e notarização do macOS:** sem certificado Developer ID, chave de API
   do App Store Connect e `APPLE_TEAM_ID`. Bloqueia Gatekeeper, `spctl`, `stapler`,
   Keychain estável entre versões e o updater do macOS, que não instala apps ad-hoc.
3. **Máquinas reais:** a matriz manual precisa de Windows 10/11 x64, um Mac Intel e
   um Mac Apple Silicon, cada um com uma conta descartável, e de um desktop Linux com
   chaveiro e agente PolicyKit.
4. **Run integrado:** falta o dispatch build-only de `release.yml` em
   `release/1.1.0` e a conferência dos artefatos com `compose` e `assets … all`,
   como em [Build de branch](releases.md#build-de-branch-sem-publicação).

## Limitações conhecidas

- Builds de branch não são distribuíveis: no Windows saem sem assinatura e no macOS
  com assinatura ad-hoc, que o Gatekeeper bloqueia em downloads.
- Os segredos ficam presos ao sistema: copiar a pasta de dados para outro sistema ou
  usuário preserva o banco e os uploads, mas o token do GitHub precisa ser conectado
  de novo.
- No Windows, as notificações exigem o atalho criado pelo instalador.
- No macOS 12, a leitura do item de login não foi verificada: `getStartOnLogin` exige
  `status === "enabled"`, que o Electron só informa a partir do macOS 13.
- Em containers sem namespaces de usuário, o DEB não abre (`chrome-sandbox` com
  SUID); veja o [registro do empacotamento](multiplataforma.md#registro-de-validação).
