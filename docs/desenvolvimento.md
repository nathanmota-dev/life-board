# Desenvolvimento

[← Guia da documentação](guide.md)

Requer Node.js 22.12 ou superior e npm. Execute os comandos na raiz do repo:

```bash
npm install
npm run dev
```

O comando abre o Electron, inicia o backend Node e habilita a atualização
automática da interface. Alterações em `desktop/` reiniciam o Electron.
As dependências de `web/` são instaladas pelo workspace npm da raiz.

As execuções locais (`dev` e `start`) usam `--no-sandbox` para desabilitar o sandbox do
Chromium para funcionar em ambientes com restrições do AppArmor. O isolamento
de contexto continua habilitado. O [atalho manual do AppImage](instalacao-linux.md#instalar-a-partir-do-código)
também usa essa opção. O DEB mantém o sandbox e instala um perfil do AppArmor.

## Comandos

```bash
npm run typecheck  # Verifica os tipos do desktop, frontend, backend e E2E
npm run build      # Compila o app para out/
npm start          # Abre a versão compilada (execute build antes)
npm run package    # Gera um instalador para o sistema atual em release/, sem publicar
npm run package:linux     # DEB e AppImage x64 e latest-linux.yml
npm run package:win       # NSIS x64 e latest.yml
npm run package:mac:x64   # DMG e ZIP Intel em release/mac-x64/
npm run package:mac:arm64 # DMG e ZIP Apple Silicon em release/mac-arm64/
```

O empacotamento usa DEB e AppImage no Linux, NSIS no Windows e DMG + ZIP no macOS.
Os comandos específicos não publicam e precisam rodar no mesmo sistema e arquitetura
do alvo. Veja [Empacotamento multiplataforma](multiplataforma.md) para os nomes dos
arquivos, os feeds e o registro de validação.
As releases públicas são geradas pelo workflow de tag; veja
[Publicação de releases](releases.md).

## Testes do backend

Os testes de `api/` usam Vitest com SQLite real (um arquivo temporário por
teste). Os services são testados direto contra o banco e os controllers via
`app.inject()`. A cobertura mínima é 80% em linhas, funções, branches e
statements; abaixo disso o comando falha.

```bash
npm run test:coverage  # Testes do backend com relatório de cobertura
```

`npm test` na raiz roda os testes do desktop, do frontend e do backend.
`npm run test:desktop` verifica a integração com o login do sistema, a
persistência e as decisões ao fechar a janela, incluindo a exceção do pomodoro.

## Testes unitários do frontend

Os testes de `web/` usam Vitest, React Testing Library e os matchers do
jest-dom, com jsdom para simular o DOM. Execute na raiz:

```bash
npm test           # Executa os testes uma vez
npm run test:watch # Reexecuta os testes ao alterar os arquivos
```

`npm test` e `npm run test:watch` também funcionam dentro de `web/`,
onde executam apenas os testes do frontend. Crie arquivos `*.test.ts`
ou `*.test.tsx` ao lado do código testado em `web/src/` (o padrão `*.spec.*`
também é aceito). Importe `describe`, `it` e `expect` de `vitest`.
O alias `@/` aponta para `web/src/`, e o setup em `web/src/test/setup.ts`
registra os matchers de DOM e limpa os componentes renderizados após cada teste.

## Testes E2E

`npm run test:e2e` compila e executa os fluxos de todas as páginas no Electron
real, em segundo plano pelo Xvfb, com dados e chaveiro temporários. A suíte roda
em PRs para `main` e `release/**` e bloqueia o empacotamento de releases em caso de falha. Veja
[Testes E2E](e2e.md) para dependências Linux, comandos, matriz de cobertura e debug.

`npm run package:linux` gera AppImage e DEB Linux com metadados de atualização.
`desktop/scripts/packaging.test.ts` cobre a verificação do módulo nativo, os nomes
dos pacotes, a assinatura do macOS e a escolha do ZIP do macOS pelo updater.
`desktop/scripts/release-checks.test.ts` cobre a validação da tag, do feed, dos
checksums, da proveniência de `build-info.json` e dos arquivos enviados usada pelos
workflows de build/release. `desktop/scripts/release-compose.test.ts` cobre a release
combinada: fan-in dos builds, montagem da pasta de upload, `latest-mac.yml` com as
duas arquiteturas, `SHA256SUMS.txt` global e recusa de plataforma ausente, checksum
alterado, origem/versão misturadas, arquivo duplicado, assinatura inelegível e
versão já publicada. Para testar instalação real com duas versões e um feed local,
consulte [Atualizações](atualizacoes.md).

O workflow **Build Linux** pode ser executado em branches sem publicar. Ele mantém
os gates E2E, unitários, cobertura, inspeção e instalação/smoke do DEB no
`ubuntu-24.04` com Node.js 24.18.0. Veja
[Build de branch](releases.md#build-de-branch-sem-publicação) para dispatch/download e
[contrato de artefatos](multiplataforma.md#contrato-de-workflows-e-artefatos) para
inputs, outputs, manifesto e verificações locais. O linter de workflows é
`actionlint .github/workflows/*.yml`. O orquestrador **Release** chama os três
builds; executado manualmente em uma branch, só compila e valida a release
combinada, sem rascunho nem publicação (veja [Publicação de releases](releases.md)).

O workflow **Build Windows** executa checks e NSIS nativamente no
`windows-2022`, também com Node.js 24.18.0. Pode ser chamado por outro workflow ou
executado em uma branch sem publicar. A suíte E2E completa permanece no workflow
Linux; o Windows acrescenta smoke do app instalado com perfil comum e DPAPI real.
Consulte [Build Windows x64](multiplataforma.md#build-windows-x64) para interface,
artefatos, dispatch e assinatura de produção. Para validar os quatro alvos juntos
em uma branch de integração, dispare o orquestrador como em
[Build de branch](releases.md#build-de-branch-sem-publicação) e registre o resultado
em [Validação multiplataforma](validacao-multiplataforma.md).

Para validar numa máquina Windows descartável, em PowerShell:

```powershell
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run package:win
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/scripts/smoke-windows.ps1 -InstallerPath "release/life-board-$version-win-x64.exe" -Version $version -AsDisposableUser
```

`-AsDisposableUser` exige terminal administrador somente para criar/remover a
conta temporária. O teste falha se o instalador/app executar como administrador.
Para usar uma conta padrão descartável já criada, omita a opção; o perfil deve
ter espaços e nenhum dado existente do Life Board. Não use um perfil pessoal.
Os logs e evidências ficam em `test-results/windows-smoke/`. O workflow copia a
evidência de assinatura para `release/`, escreve proveniência/checksums e executa
`node desktop/scripts/release-checks.mts assets release windows-x64` antes de enviar
o artefato. Para produção, o smoke também exige `-RequireSignature -PublisherName`
e verifica Authenticode no instalador e app instalado.

O workflow **Build macOS** executa checks, DMG + ZIP e o smoke do app instalado
nativamente em `macos-15-intel` (x64) e `macos-15` (arm64), com Node.js 24.18.0.
Branches geram builds ad-hoc sem credenciais; só tags de release assinam com
Developer ID e notarizam. Consulte [Build macOS x64 e arm64](multiplataforma.md#build-macos-x64-e-arm64)
para runners, interface, artefatos e assinatura.

Para validar num Mac da mesma arquitetura do alvo (Intel para x64, Apple
Silicon sem Rosetta para arm64), em uma conta descartável:

```bash
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run package:mac:arm64 -- --config.mac.identity=- \
  --config.mac.entitlements=desktop/resources/entitlements.mac.adhoc.plist \
  --config.mac.entitlementsInherit=desktop/resources/entitlements.mac.adhoc.plist
version=$(node -p 'require("./package.json").version')
bash desktop/scripts/smoke-macos.sh "release/mac-arm64/life-board-$version-mac-arm64.dmg"
```

Sem as opções `--config.mac.*`, o electron-builder procura um certificado no
keychain e, sem nenhum, gera um app sem assinatura, que o smoke recusa. O smoke
troca temporariamente o keychain padrão e grava as evidências em
`test-results/macos-smoke/`. Para um build Developer ID notarizado, acrescente
`--team-id <TEAMID>`. O workflow copia `signing-info.json` para a pasta de saída,
escreve proveniência/checksums e executa
`node desktop/scripts/release-checks.mts assets release/mac-arm64 macos-arm64`
antes de enviar cada artefato.
