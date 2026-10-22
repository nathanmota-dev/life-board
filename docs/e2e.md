# Testes E2E do Electron

[← Guia da documentação](guide.md)

A suíte Playwright em `e2e/` abre o Life Board compilado com Electron real.
React, preload, IPC, Fastify, `utilityProcess`, SQLite, migrations, uploads e
criptografia pelo chaveiro do sistema participam dos testes.

## Executar em segundo plano

O ambiente suportado é Linux x64. Use Node.js 24.18.0 (a versão do CI) e instale
as dependências a partir do lockfile:

```bash
npm ci
npx playwright install-deps chromium
sudo apt-get install xvfb xauth dbus-x11 gnome-keyring libsecret-1-0 libglib2.0-bin
npm run test:e2e
```

Electron já inclui Chromium; não é necessário baixar um navegador do Playwright.
O comando normal usa **Xvfb mesmo quando há uma sessão gráfica disponível**.
As janelas ficam em outro display e não cobrem outros programas nem tomam seu
foco. O terminal acompanha a execução e retorna o status da suíte. Cada execução
escolhe um display livre de 1920 × 1080, com X11 explícito também em Wayland.

```bash
npm run test:e2e                           # Compila e executa tudo
npm run test:e2e:run -- e2e/tasks.spec.ts    # Usa o build existente
npm run test:e2e:run -- --grep 'capture'     # Filtra pelo nome
npm run test:e2e:infra                      # Launcher e cancelamento
npm run test:e2e:report                     # Abre o relatório HTML
```

`test:e2e:run` exige um `npm run build` atualizado. Os testes funcionais são
separados do Vitest: `npm test` continua executando desktop, frontend e API.
`npm run typecheck` também verifica a configuração e os arquivos TypeScript E2E.

Somente para diagnóstico **visível no monitor**, use `npm run test:e2e:debug`.
As opções `--debug`, `--ui`, `PWDEBUG=1` e `LIFE_BOARD_TEST_DISPLAY=host` também
selecionam o display do desktop. Não use essas opções se quiser continuar
trabalhando no monitor durante a execução. O padrão é
`LIFE_BOARD_TEST_DISPLAY=xvfb`.

## Isolamento e fixtures

Cada teste cria diretórios temporários próprios para dados do Electron,
SQLite, uploads, cache, autostart e preferências. A fixture confere o caminho
real de `userData`. Testes de reinício reutilizam exclusivamente seus próprios
dados. O launcher cria uma sessão D-Bus privada com um GNOME Keyring temporário;
o chaveiro do usuário não participa. O bootstrap desfaz o `password-store=basic`
adicionado pelo Playwright e seleciona libsecret antes de iniciar o app.

Electron é encerrado no teardown; o launcher supervisiona os grupos de processos
e limpa o display e os diretórios da sessão também em SIGINT/SIGTERM. Os dados
de cada teste ficam dentro dessa sessão, permitindo removê-los após cancelamento.
Nenhum teste usa o banco, tokens, autostart ou instalação pessoal do Life Board.

As fixtures preparam dados pela API real. Após preparar um lote, a navegação
recarrega a interface para atualizar os caches de React Query. As ações testadas
são realizadas pela interface; consultas à API e arquivos complementam as
asserções de persistência. O relógio parte de 21/10/2026 às 12:00 UTC; o tempo
avança de forma controlada nos processos e janelas para testar o pomodoro.

Os adaptadores em `e2e/support/` são carregados antes do entrypoint compilado e
não entram no pacote de produção:

- O backend real recebe respostas REST/GraphQL sintéticas na fronteira HTTP do
  GitHub. Token de teste, conta, PRs, issues, contribuições e repositórios são
  fictícios. Cenários incluem conta vazia, credenciais inválidas e falhas externas.
- Geolocalização e Open-Meteo são interceptados no renderer. Requisições externas
  inesperadas fazem o teste falhar.
- Abertura de links e notificações são registradas localmente. Os callbacks de
  notificações, bandeja e do atalho registrado exercitam as ações reais do app;
  a apresentação desses elementos pelo ambiente gráfico não é automatizada.
  O teste de tamanho da janela parte de um estado salvo sem maximização, pois
  Xvfb não fornece um gerenciador de janelas para confirmar maximizar/restaurar.
- Atualizações usam um provedor sintético e arquivos inertes em diretórios
  temporários. Serviço de estados, IPC, integridade, confirmação e recuperação
  do pomodoro são reais. O pedido de relançamento é registrado e a fixture abre
  o app novamente. DEB, instalação/upgrade real de pacotes e publicação ficam
  fora desta suíte.

## Matriz de cobertura

O inventário explícito em `routes.spec.ts` compara todos os links da navegação e
visita cada página com workspace vazio e preenchido, incluindo recarga. Adicionar
uma página exige atualizar esse inventário e seus testes funcionais.

| Specs | Fluxos |
| --- | --- |
| `routes` | As 15 páginas, link ativo, URL e recarga, vazias e preenchidas |
| `dashboard-settings` | Paleta/teclado, histórico, breadcrumb, janela estreita; widgets, ordem, visibilidade, captura, foco/limite/pendências; aparência, cores, PT/EN, abas, autostart e segundo plano |
| `inbox` | Tokens de captura e remoção, tarefa/ideia, triagem, datas, pular, editar, conversão, exclusão, desfazer, teclado; janela global, foco, sincronização e Escape |
| `tasks` | Formulário, compositor, notas, checklist, conclusão/reabertura, quadro/lista, filtros, busca, cores, prazos, fixação, arraste, arquivo e desfazer |
| `task-views` | Filtros de hoje/próximas/algum dia, limpar prazo, expandir/recolher itens concluídos e reabertura |
| `projects` | Formulário e criação rápida, edição/detalhes, pausa/motivo/histórico, arraste, WIP, concluídos, arquivo/restauração e desfazer |
| `goals` | Cadastro, edição, exclusão, vínculos, marcos/prazos, progresso automático/manual, áreas/status, agrupamento, timeline e risco |
| `habits-mood` | Hábitos personalizados, check-ins, progresso, desfazer, edição/exclusão, filtros e períodos; humor diário, atualização/exclusão e painel |
| `thoughts-tags-activity` | Ideias, fixação, busca, edição/exclusão, paginação; vínculos/backlinks, etiquetas e atividade entre módulos |
| `calendar-files` | Agenda semanal, grade, intervalos inválidos, sobreposição, dia inteiro, edição pelo painel; quadros, uploads múltiplos, miniaturas, bytes, metadados e exclusão |
| `github` | Token inválido/válido, sincronização, categorias de PRs, issues, contribuições/repositórios, links, persistência e desconexão; vazio e recuperação de falha |
| `pomodoro-desktop` | Controles, presets/durações, fases, pausas, som, auto start, conclusão/estatísticas, bandeja/notificação, segundo plano, tamanho da janela, encerramento e instância única; clima/fallback/erro |
| `updates` | Descoberta, atualizado/disponível, notas/link, progresso entre páginas, cancelamento, falhas de rede/integridade/permissão e reinício controlado preservando dados/timer |
| `failure-states` | Falhas de leitura nas páginas com API, recuperação por recarga, carregamento pendente e gravações malsucedidas preservando rascunho/progresso |

Use papéis e nomes acessíveis nos seletores. Para controles com estado confirmado
pelo servidor, clique e aguarde a mudança observável; `check()` pressupõe que a
mudança da checkbox já ocorreu ao terminar o clique. Evite sleeps fixos e testes
que dependam da ordem ou dos dados de outro teste.

## Diagnóstico e CI

São usados um worker, zero retries e proibição de `test.only` no CI. Falhas geram
screenshot, trace e logs do app/backend e das integrações sintéticas. O relatório
HTML fica em `playwright-report/`; evidências e resumo JSON ficam em
`test-results/`. Ambos são ignorados pelo Git.

O workflow **Electron E2E** roda em PRs para `main` e `release/**`, pode ser executado
manualmente e é reutilizado pela release. O job de empacotamento depende do sucesso do E2E
no commit/tag da execução. Os relatórios são enviados mesmo em falhas e ficam
disponíveis por 14 dias. Nenhuma credencial de integração é necessária.

Antes de concluir alterações, execute:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e:infra
npm run test:e2e
```

## Vídeo de demonstração do README

`npm run demo:record` compila o app e grava `web/src/public/life-board-demo.mp4`
com o roteiro de `e2e/demo/demo.record.ts`. A gravação usa o mesmo ambiente
isolado da suíte (Xvfb, keyring temporário e perfil descartável), dados de
exemplo e `ffmpeg` para capturar o display virtual; ela não faz parte de
`npm run test:e2e`. Sem `LIFE_BOARD_DEMO_GITHUB_TOKEN`, as telas do GitHub usam
os dados sintéticos; com a variável, o backend acessa a API real do GitHub
apenas durante a gravação.

O README exibe o vídeo por uma URL `user-attachments`. Depois de regravar, anexe
o novo arquivo a um comentário de issue e troque a URL no README:

```bash
gh issue comment <número> --attach web/src/public/life-board-demo.mp4
```
