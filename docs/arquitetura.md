# Arquitetura do app

[← Guia da documentação](guide.md)

O Life Board é um app desktop com Electron, Vite, React, TypeScript,
Tailwind CSS 4 e shadcn/ui. O backend usa Node, Fastify, Drizzle e SQLite.
Os caminhos abaixo são relativos à raiz do repositório.

## Estrutura

- `desktop/src/main.ts`: janela e ciclo de vida do Electron.
- `desktop/src/preload.ts`: APIs disponibilizadas para o React via `contextBridge`.
- `desktop/src/backend-process.ts`: processo Node iniciado com `utilityProcess`.
  Sobe a API de `api/` numa porta livre em `127.0.0.1`, avisa o processo
  principal quando está pronta e encerra junto com o app.
- `api/`: backend em Fastify + Drizzle + SQLite (veja [Backend](backend.md)).
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

## Inicialização e segundo plano

Em Settings → General → Inicialização e segundo plano, as duas opções começam
desativadas. Iniciar com o sistema registra o app no login do Windows/macOS ou
em `$XDG_CONFIG_HOME/autostart/dev.nathanmota.lifeboard.desktop` no Linux
(por padrão, `~/.config/autostart/`). O app inicia oculto na bandeja. No Linux,
o registro aponta para o AppImage instalado, não para sua montagem temporária.
Se o item for removido ou desativado no sistema, a opção reflete essa mudança.

Continuar em segundo plano faz o fechamento da janela apenas ocultá-la;
use o ícone instalado ou Abrir no menu da bandeja para reabrir e Sair para
encerrar o app. Abrir novamente reutiliza a janela existente, preservando
a tela atual, o tema e o estado da interface. O app mantém uma única instância
por perfil, inclusive quando a janela já está visível. Uma nova execução com
`--hidden` não traz a janela à frente.
Um pomodoro em execução ou pausado sempre mantém o app em segundo plano,
mesmo com essa opção desativada. Sem ele e com a opção desativada, fechar
a janela encerra o app em todos os sistemas. As preferências ficam em
`startup-settings.json` na pasta de dados do Electron.

O processo principal também mantém um único serviço de atualizações, com histórico durável, notificações, download verificado e instalação explícita para DEB/AppImage. Consulte [Atualizações](atualizacoes.md).
