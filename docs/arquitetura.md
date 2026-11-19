# Arquitetura do app

[← Guia da documentação](guide.md)

O Life Board é um app desktop com Electron, Vite, React, TypeScript,
Tailwind CSS 4 e shadcn/ui. O backend usa Rust, axum e SQLite.
Os caminhos abaixo são relativos à raiz do repositório.

## Estrutura

- `desktop/src/main.ts`: janela e ciclo de vida do Electron.
- `desktop/src/preload.ts`: APIs disponibilizadas para o React via `contextBridge`.
- `desktop/src/backend.ts`: inicia o binário `life-board-api`, que sobe a API
  numa porta livre em `127.0.0.1`, avisa o processo principal com uma linha no
  stdout e encerra quando o app fecha o stdin.
- `src-tauri/crates/api/`: backend em Rust + SQLite (veja [Backend](backend.md)).
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

## Pages: onde ficam as páginas

A API `/api/pages` guarda uma árvore de pastas e páginas em markdown. O SQLite
(tabela `pages`) guarda só os metadados: título, pasta pai, tamanho e o
`storage_path`, como um app guarda a chave de um objeto no S3. O texto de cada
página é o arquivo `<id da página>.md`, num diretório plano:
`<pasta de dados>/pages` por padrão, ou `<pasta escolhida>/life-board-app/pages`
quando há uma pasta em Settings → Files, ao lado de `uploads`. Trocar essa pasta
move uploads e páginas juntos, tudo ou nada.

A árvore **não** é espelhada em disco. Pastas existem só no SQLite, e renomear
ou mover uma página ou pasta só altera o banco, então um título nunca precisa
ser um nome de arquivo válido e nenhum título ou `folderPath` forma um caminho.
Todo caminho em disco passa por `FileStorageService::resolve`.

Salvar escreve `<id>.md.tmp` e renomeia sobre `<id>.md`, para que uma queda não
deixe uma página pela metade. Na inicialização, os `*.md.tmp` que sobraram são
removidos. Excluir é permanente: a pasta, tudo dentro dela e os arquivos.

## Inicialização e segundo plano

Em Settings → General → Inicialização e segundo plano, as duas opções começam
desativadas. Iniciar com o sistema registra o app no login do Windows/macOS ou
em `$XDG_CONFIG_HOME/autostart/dev.nathanmota.lifeboard.desktop` no Linux
(por padrão, `~/.config/autostart/`). O app inicia oculto na bandeja. No Linux,
o registro aponta para o AppImage instalado, não para sua montagem temporária.
Se o item for removido ou desativado no sistema, a opção reflete essa mudança.

Continuar em segundo plano faz o fechamento da janela destruí-la, liberando a
memória do renderer, enquanto o app, a API e a bandeja continuam ativos; use o
ícone instalado ou Abrir no menu da bandeja para reabrir e Sair para encerrar o
app. Abrir novamente cria outra janela com o tamanho, a posição e a
maximização salvos, na tela inicial ou na rota pedida pela notificação ou pela
bandeja. A interface é recarregada e busca os dados atuais; texto não salvo em
formulários é perdido. O app mantém uma única instância por perfil, inclusive
quando a janela já está visível. Uma nova execução com `--hidden` não traz a
janela à frente.
Um pomodoro em execução ou pausado sempre mantém o app em segundo plano,
mesmo com essa opção desativada. Nesse caso a janela é apenas ocultada, porque
o som de conclusão é tocado pelo renderer, e reabrir reutiliza a mesma tela.
Sem ele e com a opção desativada, fechar a janela encerra o app em todos os
sistemas. As preferências ficam em `startup-settings.json` na pasta de dados do
Electron.

O processo principal também mantém um único serviço de atualizações, com histórico durável, notificações, download verificado e instalação explícita para DEB/AppImage. Consulte [Atualizações](atualizacoes.md).
