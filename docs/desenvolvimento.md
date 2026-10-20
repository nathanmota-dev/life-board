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
de contexto continua habilitado. O [atalho Linux](instalacao-linux.md) também usa
essa opção, como o atalho gerado no AppImage.

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

`npm run package` gera AppImage e DEB Linux com metadados de atualização. Para testar instalação real com duas versões e um feed local, consulte [Atualizações](atualizacoes.md).
