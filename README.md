# Life Board

App desktop com Electron, Vite, React, TypeScript, Tailwind CSS 4 e shadcn/ui.
A interface inicial usa fundo branco, uma sidebar recolhível e páginas com título.

## Desenvolvimento

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
de contexto continua habilitado; o app empacotado mantém o sandbox padrão.

## Estrutura

- `desktop/src/main.ts`: janela e ciclo de vida do Electron.
- `desktop/src/preload.ts`: APIs disponibilizadas para o React via `contextBridge`.
- `desktop/src/backend-process.ts`: processo Node iniciado com `utilityProcess`.
  Sobe a API de `api/` numa porta livre em `127.0.0.1`, avisa o processo
  principal quando está pronta e encerra junto com o app.
- `api/`: backend em Fastify + Drizzle + SQLite (veja "Backend" abaixo).
- `web/src/main.tsx`: entrada React e layout compartilhado com sidebar e cabeçalho.
- `web/src/router.ts`: TanStack Router, layout `sidebar` e rota `/dashboard`.
- `web/src/routes/dashboard.tsx`: conteúdo da página Dashboard.
- `web/src/components/app-sidebar.tsx`: sidebar personalizada sobre o shadcn/ui.
- `web/src/components/ui/`: componentes do shadcn/ui.
- `web/src/index.css`: Tailwind e tema claro.
- `electron.vite.config.mts`: configuração do main, preload e frontend Vite.

As rotas usam hash history para funcionar também com `file://` no Electron
compilado. A entrada `/` redireciona para `/dashboard`. Os módulos ficam na
sidebar, com Settings no rodapé. A busca encontra as páginas pelo nome
traduzido ou pelo caminho. Os novos arquivos React seguem kebab-case.

O React não acessa o Node diretamente. Para novas funcionalidades, exponha
métodos específicos no preload e registre os handlers no processo principal.
Como exemplo, `window.desktop.getVersion()` retorna a versão do app.

## Backend

A API fica em `api/` (workspace npm) e segue uma MVC reduzida:

- `src/dto/`: schemas Zod de body, query e params de cada módulo.
- `src/controllers/`: rotas Fastify; validam a entrada com o DTO e chamam o service.
- `src/services/`: regras de negócio e acesso ao banco com Drizzle.
- `src/db/schema/`: tabelas SQLite; `api/drizzle/` guarda as migrations geradas.
- `src/plugins/`: tratamento de erros e o hook de autenticação.

Módulos: tasks, thoughts, links, goals (com milestones), calendar, mood,
habits, stats, github e file-boards. Todas as rotas usam o prefixo `/api`.

O banco `life-board.db` e os uploads ficam na pasta de dados do Electron
(`~/.config/life-board-app/` no Linux). As migrations rodam sempre que a API
inicia.

O token do GitHub é salvo cifrado com AES-256-GCM. A chave fica em
`secret.key.enc`, protegida pelo chaveiro do sistema via `safeStorage` do
Electron (libsecret/KWallet no Linux, Keychain no macOS, DPAPI no Windows). O
processo principal abre a chave e a envia ao backend pelo `parentPort`. No
Linux, o app não inicia sem um chaveiro de verdade, para não cair no modo
`basic_text`.

Ainda não há login. Só `/api/health` é pública; as demais rotas passam pelo
hook `authenticate` de `src/plugins/auth.ts`, que hoje libera tudo. Quando a
autenticação chegar, basta implementar esse hook.

O React recebe a URL da API com `window.desktop.getApiBaseUrl()`.

## Frontend

Cada rota de `web/src/routes/` é uma view curta que monta componentes de
`web/src/components/<módulo>/`. O resto fica separado:

- `web/src/types/`: tipos do domínio e das props dos componentes (nada de tipos nas views).
- `web/src/services/`: chamadas HTTP por módulo, todas via `api-client.ts`.
- `web/src/hooks/queries/`: hooks do TanStack Query; mutations invalidam o cache do módulo.
- `web/src/lib/`: funções puras reaproveitáveis (datas, layout do calendário, hábitos…).
- `web/src/components/shared/`: peças comuns (stat card, badges, estados vazios, dialogs).

A cor de destaque (Settings → General) muda `--brand` no `:root`; botões, anéis
de foco e gráficos (`--chart-1…5`) derivam dela. O padrão é `#FF892B`.
O token do GitHub é configurado em Settings → GitHub e alimenta o gráfico de
contribuições do Dashboard pela rota `/api/github/contributions`.

## Idiomas

O app usa i18next e react-i18next, com os dicionários em `public/i18n/pt.json`
e `public/i18n/en.json`. Na primeira abertura, detecta o idioma do navegador
ou sistema; variantes como `pt-BR` e `en-US` usam `pt` e `en`. O fallback é inglês.
Em Settings → General → Language, a escolha muda a interface imediatamente e
fica salva em `localStorage` na chave `life-board-language`.

Todas as páginas usam o idioma escolhido, incluindo datas, filtros e contagens.
As URLs continuam iguais, sem prefixos de idioma. Os JSONs são incluídos no
bundle para funcionar offline no Electron e copiados para `out/renderer/i18n/`.
Para novos textos, adicione a mesma chave aos dois arquivos e use `useTranslation()`
no componente. Opções traduzidas devem ser calculadas durante a renderização.

Para alterar o banco, edite `api/src/db/schema/` e gere uma migration:

```bash
npm run db:generate --workspace api
```

## Comandos

```bash
npm run typecheck  # Verifica os tipos do desktop, frontend e backend
npm run build      # Compila o app para out/
npm start          # Abre a versão compilada (execute build antes)
npm run package    # Gera um instalador para o sistema atual em release/
```

O empacotamento usa AppImage no Linux, NSIS no Windows e DMG no macOS.

## Testes do backend

Os testes de `api/` usam Vitest com SQLite real (um arquivo temporário por
teste). Os services são testados direto contra o banco e os controllers via
`app.inject()`. A cobertura mínima é 80% em linhas, funções, branches e
statements; abaixo disso o comando falha.

```bash
npm run test:coverage  # Testes do backend com relatório de cobertura
```

`npm test` na raiz roda os testes do frontend e do backend.

## Testes unitários do frontend

Os testes de `web/` usam Vitest, React Testing Library e os matchers do
jest-dom, com jsdom para simular o DOM. Execute na raiz:

```bash
npm test           # Executa os testes uma vez
npm run test:watch # Reexecuta os testes ao alterar os arquivos
```

Os mesmos comandos funcionam dentro de `web/`. Crie arquivos `*.test.ts`
ou `*.test.tsx` ao lado do código testado em `web/src/` (o padrão `*.spec.*`
também é aceito). Importe `describe`, `it` e `expect` de `vitest`.
O alias `@/` aponta para `web/src/`, e o setup em `web/src/test/setup.ts`
registra os matchers de DOM e limpa os componentes renderizados após cada teste.

O teste inicial em `web/src/components/workspace-page.test.tsx` verifica
que `WorkspacePage` exibe o título recebido como um heading de nível 1.

Para adicionar componentes do shadcn, execute na raiz:

```bash
npx shadcn@latest add button --cwd web
```
