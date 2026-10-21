# Validação das atualizações multiplataforma

[← Atualizações do aplicativo](atualizacoes.md)

Registro de 2026-10-21 para a issue #27, sobre `release/1.1.0` (`29cc6be`).
Ambiente: Ubuntu 26.04.1 x64, kernel 7.0.0-38, Node 24.18.0, Electron 44.7.0,
electron-builder 26.15.3 e electron-updater 6.8.9. A versão de produção continua
1.0.0; nenhum pacote ou feed de teste foi publicado.

## Verificações executadas

| Comando | Resultado |
| --- | --- |
| `npm ci` | Passou, sem alterar o lockfile. |
| `npm run typecheck` | Passou nos projetos desktop, web, API e E2E. |
| `npm run test:desktop` | Passou: 158 testes em 12 arquivos. |
| `npm run test --workspace web -- src/components/settings/updates-panel.test.tsx` | Passou: 15 testes, incluindo consentimento e rótulos nativos em PT/EN. |
| `npm test` | Passou: 158 testes desktop, 311 web e 172 API (641 no total). |
| `npm run test:coverage` | Passou: API com 99,35% linhas, 97,86% funções, 98,49% branches e 99,34% statements. Limite de 80% preservado em todas as métricas. |
| `npm run build` | Passou, também executado pelo empacotamento e pelo E2E. |
| `npm run test:e2e:infra` | Passou: 3 testes. |
| `npm run test:e2e` | Passou: 95 cenários no Electron real, com Xvfb, D-Bus, chaveiro e perfis temporários. |
| `npm run test:e2e:run -- e2e/updates.spec.ts` | Passou: 5 cenários do updater repetidos com o build final. |
| `npm run package:linux` | Passou: DEB, AppImage e `latest-linux.yml`. O hook carregou `@libsql/linux-x64-gnu`. |
| `node desktop/scripts/release-checks.mts assets release` | Passou após gerar `SHA256SUMS.txt`: nomes, tamanhos, SHA-512 do feed e SHA-256 dos artefatos conferem. |
| `dpkg-deb --info` / `--contents` | Passou: pacote `life-board` 1.0.0 amd64, executável, ASAR, `app-update.yml`, `package-type=deb`, migrations e módulo nativo desempacotado. |
| `desktop/scripts/smoke-deb.sh` | Passou com o DEB instalado em um container Ubuntu 24.04, usuário sem privilégios e sessão D-Bus/chaveiro isolados: `/api/health`, banco e `secret.key.enc`. Também passou `desktop-file-validate`. |
| `git diff --check` | Passou. |

O sandbox inicial bloqueou a abertura de portas locais de dois testes da API
(`listen EPERM`). A suíte completa e a cobertura foram repetidas sem essa
restrição e passaram. O container de smoke usou `seccomp=unconfined` para permitir
o sandbox do Chromium, conforme a observação do contrato de empacotamento.

## Alcance das evidências

- **Drivers nativos, testes unitários:** instâncias reais de `NsisUpdater` e
  `MacUpdater` com descoberta, download, lançamento do instalador e eventos do
  Electron controlados pelo teste. Cobrem consentimento, seleção de OS/CPU,
  Rosetta, checksums reais de arquivos temporários, arquivos auxiliares/ordem de
  retorno, assinatura recusada por evento, timeout, cancelamento, erro posterior
  ao retorno de `quitAndInstall`, retry e ausência de callback de saída duplicado.
  Esses testes não substituem a verificação criptográfica em um sistema assinado.
- **Linux, testes unitários:** preservam nomes/metadados legados, comandos fixos
  PolicyKit/APT, recusa de elevação 126/127 sem nova tentativa automática,
  integridade antes de elevar e AppImage sem escrita, com retry e troca atômica
  após restaurar a permissão.
- **E2E do updater:** par 1.0.0 → 1.0.1 simulado pelo bootstrap de testes em
  `e2e/support/updates.cjs`, com artefato inerte e nenhuma assinatura/feed de rede.
  Exercita descoberta, progresso ao navegar, cancelamento da confirmação, erros,
  retry e reabertura preservando tarefas e pomodoro em execução/pausado.
- **Linux instalado:** o smoke executa de verdade o DEB 1.0.0 e seu backend,
  migrations e libsecret. Não simula que esse smoke fez um upgrade de pacotes.

## Validação nativa pendente

| Alvo | Situação |
| --- | --- |
| Windows x64 NSIS | Build/execução assinados e upgrade instalado não executados neste host Linux. |
| macOS x64 | DMG/ZIP assinados, Keychain e upgrade Squirrel.Mac não executados neste host Linux. |
| macOS arm64 | Mesmo limite; Rosetta foi coberto pela seleção de arquitetura em testes unitários. |
| Linux, upgrade instalado com duas versões reais | Não executado; as evidências acima distinguem testes de driver, E2E controlado e smoke instalado. |

`npm run package:win`, `npm run package:mac:x64` e
`npm run package:mac:arm64` devem rodar nas máquinas correspondentes. Não foram
apresentados builds cruzados como validação nativa. Os workflows #29/#30 fornecem
os artefatos assinados, e #32 reúne as evidências finais da série.

Para concluir essa validação, siga os [testes com pacotes controlados](atualizacoes.md#testes-com-pacotes-controlados)
e registre por alvo o par de versões (por exemplo 0.99.0 → 0.99.1), OS/CPU,
identidade de assinatura, hashes e URL do feed isolado. Confirme também UAC
cancelado no Windows quando aplicável, identidade Keychain entre versões,
executável/item de login, dados/uploads/preferências, saída comum versus
instalação explícita com background/pomodoro e uma única instância após reabrir.
