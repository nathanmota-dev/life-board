# Frontend

[← Guia da documentação](guide.md)

## Organização

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

## Componentes do shadcn/ui

Para adicionar componentes do shadcn, execute na raiz:

```bash
npx shadcn@latest add button --cwd web
```
