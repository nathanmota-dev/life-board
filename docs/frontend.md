# Frontend

[← Guia da documentação](guide.md)

## Organização

Cada rota de `web/src/routes/` é uma view curta que monta componentes de
`web/src/components/<módulo>/`. O resto fica separado:

- `web/src/types/`: tipos do domínio e das props dos componentes (nada de tipos nas views).
- `web/src/services/`: chamadas HTTP por módulo, todas via `api-client.ts`.
- `web/src/hooks/queries/`: hooks do TanStack Query; mutations invalidam o cache do módulo.
- `web/src/lib/`: funções puras reaproveitáveis (datas, adaptador do calendário, hábitos…).
- `web/src/components/shared/`: peças comuns (stat card, badges, estados vazios, dialogs).

A cor de destaque (Settings → General) muda `--brand` no `:root`; botões, anéis
de foco e gráficos (`--chart-1…5`) derivam dela. O padrão é `#FF892B`.
O token do GitHub é configurado em Settings → GitHub e alimenta o gráfico de
contribuições do Dashboard pela rota `/api/github/contributions`.
A conta do Google é conectada em Settings → Google Agenda (`components/settings/google-*.tsx`);
enquanto o login está aberto no navegador, o status é consultado a cada 2 segundos.
Com a conta conectada, **Sincronizar agora** importa os eventos e recarrega o
calendário e as estatísticas; o calendário aberto consulta o status a cada 60
segundos para mostrar o que a sincronização em segundo plano trouxe. Eventos
importados (`source: "google"`) são editáveis como os locais; o código do
calendarcn em `components/calendarcn/` ganhou um `externalLink` nos detalhes
("Abrir no Google Agenda"), uma marca "Ainda não sincronizado" (`unsyncedLabel`,
enquanto `syncState` estiver preenchido) e a dica "As alterações valem só para esta
ocorrência." (`detailHint`, para ocorrências de eventos recorrentes). Enquanto há
mudança pendente, a lista de eventos é recarregada a cada 3 segundos.
Veja [Google Agenda](google-agenda.md).

## Páginas

A tela **Páginas** (`/pages` e `/pages/$pageId`, `routes/pages.tsx` e
`components/pages/`) tem a árvore de pastas e páginas à esquerda e a página
selecionada à direita, como o explorador de arquivos do Obsidian. A árvore
(`page-tree.tsx`) fica montada ao trocar de página; abaixo do breakpoint `md` ela
passa para um `Sheet`. As pastas abertas ficam em `localStorage`
(`life-board:pages-expanded`, sempre dentro de `try/catch`), e abrir uma página
expande as pastas acima dela.

- **Leitura é o padrão.** A página abre renderizada (`page-reader.tsx`, com
  `react-markdown` e `remark-gfm`: tabelas, listas de tarefas, tachado e links
  automáticos). O botão **Editar** (ou `Ctrl+E`) abre o editor; **Concluir** (ou
  `Esc`, quando não há texto selecionado) volta à leitura.
- **HTML nunca vira marcação.** O leitor não usa `rehype-raw`, então `<script>`,
  `<img onerror>` e qualquer HTML cru aparecem como texto. Isso mantém o conteúdo
  de uma nota, que pode vir de uma pasta importada, sem executar nada. Links não
  navegam (o `app:open-external` só aceita GitHub e Google), imagens `http(s)`
  carregam e caminhos relativos ou `file:` mostram o texto alternativo.
- **Edição.** `page-editor.tsx` reúne o editor formatado, o markdown puro, a
  alternância entre os dois e o aviso de origem (`roundTripsCleanly`): uma página
  que o editor formatado reescreveria abre como markdown. O salvamento é o mesmo
  de Arquivos, extraído em `hooks/use-autosaved-text.ts`: depois de uma pausa na
  digitação, com `Ctrl+S` e ao sair da página ou trocar de página.
- **Mover.** Arrastar com `@dnd-kit` (para uma pasta ou para a área da árvore, que
  é a raiz) ou **Mover para…** no menu, que abre o diálogo com as pastas. A regra
  que recusa mover para si mesmo, para um descendente ou para a pasta atual está em
  `lib/pages.ts` e vale antes de chamar a API.
- **Importar e baixar.** **Importar .md** e **Importar pasta** enviam os arquivos
  um a um para `POST /pages/import`, com `folderPath` vindo de `webkitRelativePath`;
  só `.md` e `.markdown` entram. **Baixar .md** salva `<título>.md` com o conteúdo
  como está guardado.

Arquivos não cria nem formata mais documentos `.md`: um `.md` enviado para lá abre
no editor de texto simples, como um `.txt`.

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

## Calendário

A rota `/calendar` usa o [calendarcn](https://calendarcn.xyz/docs), instalado pelo
registry do shadcn em `web/src/components/calendarcn/`. O código é nosso para editar,
como os componentes de `components/ui/`, mas fica isolado nessa pasta para não
sobrescrever os nossos `lib/utils.ts`, `hooks/use-now.ts` e `components/ui/`.

- `lib/calendar.ts` converte os eventos da API em eventos do calendarcn e de volta,
  incluindo as cores (hex na API, nomes como `orange` no calendarcn).
- `lib/calendar-sync.ts` salva as edições em segundo plano: eventos novos ganham um id
  no cliente, mapeado para o id da API, e edições seguidas (como o título digitado)
  são agrupadas antes do `PATCH`.
- `hooks/use-calendar-board.ts` carrega o intervalo visível e liga os callbacks do
  provider (`onEventCreate`, `onEventUpdate`, `onEventDelete`).
- Os textos usam `t()` de `components/calendarcn/lib/translate.ts`, com as chaves em
  `calendarcn.*` dos dicionários; um teste confere que toda chave usada existe em PT e EN.
- O painel de detalhes mostra só os campos que a API guarda (cor, título, horário, dia
  inteiro, local e descrição). Recorrência, participantes, fusos e lembretes foram
  removidos até o backend suportá-los.

Para trazer uma versão nova, aponte temporariamente os aliases do `web/components.json`
para a pasta (`components`, `ui`, `lib`, `hooks` e `utils` em `@/components/calendarcn/...`),
adicione o registry `"@calendarcn": "https://calendarcn.xyz/r/{name}.json"`, rode
`npx shadcn@latest add @calendarcn/calendar --dry-run --cwd web` e compare com
`--diff` antes de aplicar. Depois restaure os aliases e reaplique as nossas mudanças
(traduções com `t()`, campos removidos do painel e trechos marcados com `Life Board:`).

## Componentes do shadcn/ui

Para adicionar componentes do shadcn, execute na raiz:

```bash
npx shadcn@latest add button --cwd web
```

A aba Atualizações em Configurações usa `useAppUpdates` e uma assinatura compartilhada do snapshot do processo principal. A indicação no cabeçalho e `/settings?tab=updates` mantêm a descoberta acessível fora da aba. Tipos ficam em `web/src/types/updates.ts`; detalhes em [Atualizações](atualizacoes.md).
