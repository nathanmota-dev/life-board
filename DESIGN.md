# Life Board: design system

Este documento descreve o visual do app Life Board, extraído do código atual
(`web/src/index.css`, `web/src/components/ui/` e `web/src/components/shared/`).
Ele serve de referência para criar a landing page com a mesma identidade do app.

Todos os valores vêm do código. Quando um valor é derivado (como um `color-mix`),
o hex aproximado aparece com `≈`.

## 1. Personalidade

- **Calmo e neutro.** Superfícies brancas ou quase pretas, cinzas sem matiz e uma
  única cor de destaque. A cor aparece só onde importa: ação principal, ícone,
  progresso, item "próximo".
- **Denso, mas arejado.** Texto pequeno (`text-sm` é o padrão), muito espaço em volta
  e divisões feitas por bordas finas, não por fundos coloridos.
- **Cantos generosos.** Cards e painéis com `rounded-2xl`; controles com `rounded-md`
  ou `rounded-lg`.
- **Sombras quase invisíveis.** `shadow-xs` é o padrão; sombras maiores só em
  elementos flutuantes (menus, diálogos, card sendo arrastado).
- **Ícones de traço fino.** Lucide com `strokeWidth` 1.7.
- **Personalizável.** O usuário escolhe a cor de destaque, e tudo (botões, anel de
  foco, gráficos) muda junto. Na LP isso vira argumento de venda: dá para mostrar o
  mesmo componente em mais de uma cor.

## 2. Marca

| Item | Valor |
| --- | --- |
| Nome | **Life Board** (no app aparece como `LifeBoard` na sidebar) |
| Slogan atual | "Um painel pessoal para organizar sua vida em um só lugar." |
| Cor da marca | `#FF892B` (laranja) |
| Símbolo | Ícone `LayoutDashboard` (Lucide) branco, traço 2.2, sobre um quadrado laranja com cantos arredondados (`rx` 24 em 96, 25%) |
| Arquivos | `desktop/resources/icon.svg`, `web/src/public/logo.png`, `web/src/public/logo.ico` |
| Vídeo de demonstração | `web/src/public/life-board-demo.mp4` |

Na sidebar, o símbolo aparece em tamanho pequeno: `size-6`, `rounded-md`,
`bg-primary`, ícone `size-3.5`, ao lado do nome em `text-sm font-medium`.

## 3. Cores

### 3.1 Cor de destaque (accent)

A cor de destaque fica em `--brand`. A cor do texto sobre ela (`--brand-foreground`)
é calculada: branco, a não ser que a cor seja muito clara (luminância > 0.45),
caso em que o texto passa a ser `#161616`.

Cores predefinidas em Configurações (`web/src/lib/accent.ts`):

| Preset | Hex |
| --- | --- |
| Laranja (padrão) | `#FF892B` |
| Rosa | `#F43F5E` |
| Violeta | `#8B5CF6` |
| Azul | `#3B82F6` |
| Verde | `#10B981` |
| Grafite | `#171717` |

Escala derivada da cor de destaque, usada em gráficos (`--chart-1` a `--chart-5`).
Cada passo mistura a cor com o fundo em oklab:

| Token | Fórmula | Claro (≈) | Escuro (≈) |
| --- | --- | --- | --- |
| `chart-1` | `brand` | `#FF892B` | `#FF892B` |
| `chart-2` | 72% brand + fundo | `#FFAC74` | `#B7672D` |
| `chart-3` | 50% | `#FFC6A0` | `#814D29` |
| `chart-4` | 32% | `#FFDBC3` | `#583924` |
| `chart-5` | 16% | `#FFEDE1` | `#36271E` |

O anel de foco (`--ring`) é a cor de destaque com 60% de opacidade, aplicado com
50% de opacidade extra (`ring-ring/50`) e 3px de largura.

Tons de destaque usados com frequência:

| Uso | Classe |
| --- | --- |
| Fundo de ícone ou emoji (quadrado do hábito) | `bg-primary/10` |
| Item destacado ("próximo evento") | `bg-primary/5` + `border-primary/40` |
| Etiqueta de contagem regressiva | `bg-primary/10 text-primary` |
| Trilho de progresso | `bg-primary/20` (barra) ou `text-primary/15` (anel) |
| Hover de botão principal | `bg-primary/90` |

### 3.2 Neutros: tema claro

| Token | Valor | Hex (≈) | Uso |
| --- | --- | --- | --- |
| `background` | `oklch(1 0 0)` | `#FFFFFF` | Fundo da página |
| `foreground` | `oklch(0.145 0 0)` | `#0A0A0A` | Texto principal |
| `card` / `popover` | `oklch(1 0 0)` | `#FFFFFF` | Cards, menus |
| `secondary` / `muted` / `accent` | `oklch(0.97 0 0)` | `#F5F5F5` | Fundos sutis, hover, trilho de abas |
| `secondary-foreground` / `accent-foreground` | `oklch(0.205 0 0)` | `#171717` | Texto sobre fundos sutis |
| `muted-foreground` | `oklch(0.556 0 0)` | `#737373` | Texto secundário, ícones de painel |
| `border` / `input` | `#E4E4E7` | `#E4E4E7` | Todas as bordas |
| `sidebar-accent` | `#F0F0F1` | `#F0F0F1` | Item ativo da sidebar |
| `destructive` | `oklch(0.577 0.245 27.325)` | `#E7000B` | Erro, excluir |

### 3.3 Neutros: tema escuro

O tema escuro usa hex diretos, sem preto puro:

| Token | Hex | Uso |
| --- | --- | --- |
| `background` / `sidebar` | `#161616` | Fundo da página |
| `card` / `popover` | `#1C1C1C` | Cards, menus (um degrau acima do fundo) |
| `secondary` / `muted` / `accent` | `#262626` | Fundos sutis, hover |
| `foreground` | `#F5F5F5` | Texto principal |
| `muted-foreground` | `#A3A3A3` | Texto secundário |
| `border` | `#303030` | Bordas |
| `input` | `#363636` | Borda de campos; fundo de campo em `input/30` |
| `destructive` | `oklch(0.704 0.191 22.216)` (≈ `#FF6467`) | Erro |

### 3.4 Cores semânticas

| Token | Hex | Uso |
| --- | --- | --- |
| `success` | `#10B981` | Concluído, meta atingida |
| `warning` | `#F59E0B` | Atenção, risco |
| `info` | igual a `brand` | Informação |
| `destructive` | ver acima | Erro, perigo |

### 3.5 Cores de eventos (calendário)

Cada cor tem três tons: texto, borda e fundo.

| Cor | Claro (texto / borda / fundo) | Escuro (texto e borda / fundo) |
| --- | --- | --- |
| Vermelho | `#B23E31` / `#EE000E` / `#FFE1D4` | `#D85140` / `#6C2920` |
| Laranja | `#AD4517` / `#FE7132` / `#FFE3C8` | `#E07040` / `#5F3524` |
| Amarelo | `#855100` / `#F2B827` / `#FFF0BE` | `#D4A83A` / `#4E3F1B` |
| Verde | `#027B27` / `#49CA81` / `#DEFFE3` | `#52B577` / `#2D4935` |
| Azul | `#006CBF` / `#32A5E5` / `#E2F9FF` | `#4895C8` / `#2F4656` |
| Roxo | `#7733D2` / `#9950FF` / `#FEECFF` | `#8A5AD6` / `#483A63` |
| Cinza | `#5F6061` / `#B3B4B4` / `#F6F4F3` | `#A0A0A0` / `#424242` |

Na LP, essas cores servem para ilustrações de calendário ou para diferenciar os
módulos. Para destaque, a cor continua sendo a do accent.

## 4. Tipografia

- **Família:** fonte do sistema: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
  O app não carrega webfont. Na LP, use a mesma pilha ou, se quiser algo mais
  marcante nos títulos, uma sans geométrica neutra (por exemplo Inter ou Geist)
  que não destoe dos prints.
- **Mono:** `font-mono` só em código e atalhos.
- **Números:** `tabular-nums` em contadores, horários e porcentagens.

Escala usada no app (contagem de usos no código entre parênteses):

| Classe | Tamanho | Uso |
| --- | --- | --- |
| `text-xxs` | 10px | Calendário, `kbd` de atalho |
| `text-[11px]` | 11px | Tags `#tag` |
| `text-xs` (163) | 12px | Dicas, metadados, badges, botão `xs` |
| `text-sm` (236) | 14px | **Padrão do app:** corpo, botões, menus |
| `text-base` (13) | 16px | Título de painel/seção, valor de stat card |
| `text-lg` (9) | 18px | Título de página (`font-semibold tracking-tight`), título de diálogo |
| `text-xl`–`text-3xl` | 20–30px | Raro: números grandes, títulos de Markdown |

Pesos: `font-medium` (500) é o principal, inclusive em botões e títulos de painel.
`font-semibold` (600) fica para títulos de página e valores. `font-bold` quase não
aparece. Títulos usam `tracking-tight`.

O app é compacto. **A LP pode e deve usar tamanhos maiores** (hero em 48–64px,
seções em 30–36px), mantendo os pesos (600 nos títulos, 500 nos rótulos) e o
`tracking-tight`.

## 5. Espaçamento, raios e sombras

### Espaçamento

Escala do Tailwind (unidade de 4px). Valores recorrentes:

- Gap entre ícone e texto: `gap-1.5`–`gap-2` (6–8px).
- Gap entre cards em grade: `gap-3` (12px).
- Padding de card: `p-4` (16px); painel: `px-5 pb-5`, cabeçalho `py-3`, altura mínima 56px.
- Padding horizontal de página: `px-6` (24px); seções com `py-5`.
- Cabeçalho do app: 52px de altura (`h-13`).

### Raio

Base: `--radius: 0.625rem` (10px).

| Classe | Valor | Uso |
| --- | --- | --- |
| `rounded-sm` | 6px | Itens internos de menu |
| `rounded-md` | 8px | **Botões, inputs, badges retangulares, menus, tooltips** |
| `rounded-lg` | 10px | Itens da sidebar, trilho de abas, diálogos |
| `rounded-xl` | 14px | Card base (shadcn), itens de timeline, quadrado de emoji |
| `rounded-2xl` | 16px | **Painéis, stat cards, cards de meta e notas, estado vazio** |
| `rounded-full` | — | Badges em pílula, switch, barra de progresso, anel de hábito, pontos de status |

### Sombra

| Classe | Uso |
| --- | --- |
| `shadow-xs` | **Padrão:** painéis, cards, botão outline, campos |
| `shadow-sm` | Aba ativa, card shadcn |
| `shadow-md` | Menus suspensos; hover de nota |
| `shadow-lg` | Diálogos, card sendo arrastado |

## 6. Ícones

- Biblioteca: **Lucide** (`lucide-react`).
- Tamanho padrão: `size-4` (16px); `size-3.5` em botões compactos e busca; `size-6`
  em estados vazios e no anel de hábito.
- Traço: `strokeWidth={1.7}` na navegação e em painéis; 1.8 em stat cards; 2.2 no
  símbolo da marca.
- Cor: `text-muted-foreground` por padrão; `text-primary` em stat cards e quando o
  ícone é o destaque do bloco.

Ícone de cada módulo (para cards de funcionalidade na LP):

| Módulo | Ícone Lucide |
| --- | --- |
| Dashboard | `Home` (marca: `LayoutDashboard`) |
| Inbox | `Inbox` |
| Atividade | `Activity` |
| Tags | `Tags` |
| Pensamentos | `Lightbulb` |
| Tarefas | `ListTodo` |
| Calendário | `CalendarDays` |
| Metas | `Target` |
| Projetos | `Rocket` |
| Hábitos | `ListChecks` |
| Humor | `Smile` |
| Pomodoro | `Timer` |
| GitHub | `GitPullRequest` |
| Páginas | `NotebookText` |
| Arquivos | `FolderKanban` |
| Configurações | `Settings` |

## 7. Componentes

Os componentes de base são do **shadcn/ui** (estilo `new-york`, cor base `neutral`)
sobre Radix UI. As classes abaixo podem ser copiadas para a LP.

### 7.1 Botão

Base: `inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all`,
ícone `size-4`, desabilitado com `opacity-50`, foco com
`focus-visible:ring-[3px] focus-visible:ring-ring/50`.

| Variante | Classes | Uso |
| --- | --- | --- |
| `default` | `bg-primary text-primary-foreground hover:bg-primary/90` | Ação principal (Baixar, Criar) |
| `outline` | `border bg-background shadow-xs hover:bg-accent` · escuro: `bg-input/30 border-input hover:bg-input/50` | Ação secundária (Ver no GitHub) |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` | Ação neutra |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` | Ações de linha, ícones |
| `destructive` | `bg-destructive text-white hover:bg-destructive/90` · escuro: `bg-destructive/60` | Excluir |
| `link` | `text-primary underline-offset-4 hover:underline` | Link em texto |

| Tamanho | Altura | Padding |
| --- | --- | --- |
| `xs` | 24px | `px-2`, `text-xs`, ícone 12px |
| `sm` | 32px | `px-3` |
| `default` | 36px | `px-4` (`px-3` com ícone) |
| `lg` | 40px | `px-6` (`px-4` com ícone) |
| `icon` / `icon-sm` / `icon-lg` | 36 / 32 / 40px | quadrado |

Na LP, o CTA principal pode crescer (altura 44–48px, `px-6`, `text-base`), mantendo
`rounded-md`/`rounded-lg`, `font-medium` e o hover em `primary/90`.

### 7.2 Badge

- **Badge (pílula):** `rounded-full border border-transparent px-2 py-0.5 text-xs font-medium`,
  variantes iguais às do botão (`default`, `secondary`, `outline`, `destructive`).
- **Status (`Status`):** badge `outline` com `rounded-md bg-muted/30 font-normal`.
- **StatusBadge (com ponto):** `h-6 rounded-md border bg-background px-2 text-xs font-medium`
  com ponto `size-1.5 rounded-full` à esquerda. O texto e o ponto usam o mesmo tom:
  `success`, `warning`, `info`, `danger`, `neutral` ou `brand`.
- **Tag:** `rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground`, texto `#tag`.
- **Etiqueta de destaque:** `rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary`
  (como o "em 15 min" do próximo evento).

### 7.3 Painel (`Panel`)

O bloco principal do dashboard:

```html
<div class="flex flex-col rounded-2xl border bg-card shadow-xs">
  <div class="flex min-h-14 items-center justify-between gap-3 px-5 py-3">
    <h2 class="flex items-center gap-2 text-base font-medium">
      <!-- ícone size-4 text-muted-foreground stroke 1.7 --> Título
    </h2>
    <!-- ação: botão ghost sm -->
  </div>
  <div class="flex-1 px-5 pb-5"><!-- conteúdo --></div>
</div>
```

O título e o conteúdo não têm borda entre si; o espaço já separa os dois.

### 7.4 Stat card

```html
<div class="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs">
  <div class="flex items-center gap-2 text-sm text-muted-foreground">
    <!-- ícone size-4 text-primary stroke 1.8 --> Tarefas de hoje
  </div>
  <div>
    <p class="text-base font-semibold tabular-nums">5 tarefas</p>
    <p class="mt-0.5 text-xs text-muted-foreground">Planejadas ou com prazo</p>
  </div>
</div>
```

No dashboard aparecem em grade de 4 colunas: `grid gap-3 sm:grid-cols-2 xl:grid-cols-4`.

### 7.5 Card clicável (meta, nota)

- Meta: `flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-xs hover:bg-muted/30`.
- Nota (estilo Keep): `rounded-2xl border bg-card px-3 pt-3 pb-1.5 shadow-xs hover:shadow-md`;
  as ações só aparecem no hover ou foco.

### 7.6 Linha de timeline (evento)

`flex items-start gap-3 rounded-xl border border-l-[3px] px-3 py-2 hover:bg-muted/60`,
com a borda esquerda na cor do evento. Horário em coluna de 64px (`text-xs tabular-nums`),
título em `text-sm font-medium`.

- Passado: `opacity-55` e título riscado.
- Próximo: `border-primary/40 bg-primary/5` e etiqueta de contagem regressiva.

### 7.7 Linha de hábito

Quadrado de emoji `size-10 rounded-xl bg-primary/10 text-xl` + nome (`text-sm font-medium`)
+ progresso (`text-xs text-muted-foreground tabular-nums`) + dica em `text-xs text-primary`
+ **anel de progresso segmentado**: botão redondo de 80px com segmentos em SVG
(traço 5, trilho `primary/15`, preenchimento `primary`) e ícone `Plus` ou `Check` no
centro. O anel é um bom elemento visual para a LP.

### 7.8 Campos

- **Input:** `h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs`,
  placeholder `text-muted-foreground`, escuro `bg-input/30`, foco com anel de 3px.
- **Busca:** input `h-8 pl-8 text-sm` com ícone `Search` 14px à esquerda.
- **Busca da sidebar (paleta de comandos):** botão outline `h-8 rounded-lg px-2.5 text-xs text-muted-foreground`
  com `kbd` à direita (`rounded border px-1 text-[10px]`) mostrando `Ctrl K`.

### 7.9 Seleção e alternância

- **Segmented control (filtros):** trilho `rounded-lg bg-muted p-0.5 gap-0.5`; opção
  `h-7 rounded-md px-3 text-sm text-muted-foreground`; ativa
  `bg-background font-medium text-foreground shadow-xs`; contagem opcional em `text-xs`.
- **Tabs:** trilho `h-9 rounded-lg bg-muted p-1`; aba `rounded-md px-4 py-1 text-sm font-medium`;
  ativa `bg-background text-foreground shadow-sm`.
- **Switch:** `h-5 w-9 rounded-full`, ligado `bg-primary`, desligado `bg-input`,
  botão `size-4 rounded-full bg-background`.
- **Checkbox:** `size-4 rounded-[4px] border border-input`, marcado `bg-primary border-primary`
  com `Check` 14px.
- **Barra de progresso:** `h-2 rounded-full bg-primary/20` com preenchimento `bg-primary`.

### 7.10 Elementos flutuantes

- **Menu suspenso / popover:** `rounded-md border bg-popover p-1 shadow-md`, entrada com
  `fade-in zoom-in-95` e leve deslize.
- **Diálogo:** `rounded-lg border bg-background p-6 shadow-lg max-w-lg`, overlay `bg-black/50`,
  título `text-lg font-semibold`, descrição `text-sm text-muted-foreground`.
- **Tooltip:** invertido: `rounded-md bg-foreground px-3 py-1.5 text-xs text-background`, com seta.
- **Toast (Sonner):** canto inferior direito.

### 7.11 Estado vazio

`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center`,
ícone `size-6 text-muted-foreground`, título `text-sm font-medium`, descrição
`text-sm text-muted-foreground max-w-sm`, ação opcional embaixo.

## 8. Layout do app

- **Sidebar** (variante `inset`, recolhe para ícones): fundo igual ao da página, logo + nome,
  botão de busca, lista de módulos e Configurações no rodapé, separado por `border-t`.
  Itens `h-8 rounded-lg text-sm font-normal`, ícone 16px com traço 1.7; ativo com
  `bg-sidebar-accent`, sem barra colorida.
- **Área de conteúdo:** um painel "inset" com `border shadow-xs` ao lado da sidebar.
- **Cabeçalho:** 52px, `border-b`, breadcrumb à esquerda e alternância de tema à direita.
- **Página:** cabeçalho com título `text-lg font-semibold tracking-tight` + descrição
  `text-sm text-muted-foreground`, ações à direita, e o conteúdo dividido em faixas por `border-b`.
- **Dashboard:** stat cards no topo; painel do GitHub fixo logo abaixo; widgets em grade de
  2 colunas que se esticam até a altura do vizinho, e um widget sozinho ocupa a linha toda.

## 9. Movimento

- Transições curtas (`transition-colors`, `transition-all`, cerca de 150–200ms).
- Flutuantes entram com `fade-in` + `zoom-in-95`.
- Hover em cards: só fundo (`muted/30`) ou sombra (`shadow-md`), nunca deslocamento.
- Respeita `prefers-reduced-motion`.

## 10. Acessibilidade

- Foco visível em tudo: anel de 3px na cor de destaque com transparência, ou `outline-2 outline-ring`.
- Contraste do texto sobre a cor de destaque calculado automaticamente (branco ou `#161616`).
- Interface em **português e inglês**.
- Temas claro e escuro com o mesmo peso. A LP deve funcionar nos dois.

## 11. Aplicando na landing page

### Direção

- A landing page usa só o tema escuro (`#161616`), com o laranja `#FF892B` só nos CTAs,
  ícones de funcionalidades e detalhes de progresso. Nada de gradientes chamativos; para
  dar profundidade, use um brilho radial suave da cor de destaque atrás do vídeo. Uma
  grade fina (linhas brancas a 4% de opacidade, células de 64px) fica no fundo da página
  inteira, atrás dos cards, menos no rodapé, que tem fundo liso.
- Seções separadas só por espaço, sem linhas entre elas.
- Prints e o vídeo do app são o elemento principal. Apresente-os dentro de um "quadro"
  com `rounded-2xl border bg-card shadow-lg` (a única exceção à regra de sombras leves).
- Repita os componentes reais em vez de inventar novos: stat cards, anel de hábito,
  linha de timeline, StatusBadge e tags servem de ilustração.
- Mostre a troca de cor: o mesmo bloco nos presets de cor (laranja, rosa, violeta,
  azul, verde, grafite).

### Seções sugeridas

1. **Hero:** título à esquerda; texto, CTA principal "Baixar para Linux" (botão
   `default`) e secundário "Como instalar" (`outline`) à direita. Abaixo, o vídeo do app
   em loop, mais largo que o texto e cortado pela dobra da tela. O cabeçalho tem só o
   ícone do GitHub e a troca de idioma, sem botão de download.
2. **Tudo num só lugar:** grade de cards (`rounded-2xl border bg-card p-6 shadow-xs`)
   com o ícone Lucide solto, em `text-primary` e sem quadrado em volta, título
   `text-base font-medium` e descrição `text-sm text-muted-foreground`. Um card por
   módulo (Tarefas, Calendário com Google Agenda, Metas, Hábitos, GitHub, Páginas).
3. **Seu dia:** recorte do dashboard com timeline e hábitos.
4. **Do seu jeito:** temas claro/escuro, cores de destaque, PT/EN.
5. **Privado:** dados guardados localmente no computador (SQLite).
6. **CTA final + rodapé:** download (`.deb` e AppImage), versão atual, link do GitHub.

### Tokens prontos

```css
:root {
  --radius: 0.625rem;
  --brand: #ff892b;
  --brand-foreground: #ffffff;
  --background: #ffffff;
  --foreground: #0a0a0a;
  --card: #ffffff;
  --muted: #f5f5f5;
  --muted-foreground: #737373;
  --border: #e4e4e7;
  --success: #10b981;
  --warning: #f59e0b;
  --destructive: #e7000b;
  --ring: color-mix(in oklab, var(--brand) 60%, transparent);
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.dark {
  --background: #161616;
  --foreground: #f5f5f5;
  --card: #1c1c1c;
  --muted: #262626;
  --muted-foreground: #a3a3a3;
  --border: #303030;
  --input: #363636;
  --destructive: #ff6467;
}
```

Para Tailwind v4 com shadcn/ui, a forma mais fiel é copiar o bloco `@theme inline`,
`:root` e `.dark` de `web/src/index.css`.

### Faça / evite

| Faça | Evite |
| --- | --- |
| Uma cor de destaque por tela | Várias cores fortes competindo |
| Bordas de 1px para separar | Fundos coloridos em blocos grandes |
| `rounded-2xl` em cards, `rounded-md` em botões | Botões em pílula ou cards com cantos retos |
| `shadow-xs` e hover sutil | Sombras pesadas e cards que "pulam" no hover |
| Ícones Lucide com traço fino | Ícones preenchidos ou de outra biblioteca |
| Ícones soltos, só na cor de destaque | Quadrados ou círculos coloridos em volta do ícone |
| Espaço entre as seções | Linhas horizontais separando seções |
| Prints reais do app | Mockups genéricos que não parecem o produto |
