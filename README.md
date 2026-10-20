<p align="center">
  <img src="desktop/resources/icon.svg" alt="Símbolo do Life Board" width="88" height="88" />
</p>

<h1 align="center">Life Board</h1>

<p align="center">Um painel pessoal para organizar sua vida em um só lugar.</p>

O Life Board é um aplicativo desktop que reúne o que você precisa acompanhar no
dia a dia: tarefas, projetos, compromissos, metas e hábitos. A ideia é ter uma
visão da sua rotina e do seu progresso sem precisar espalhar tudo em várias
ferramentas.

Com ele, você pode:

- Organizar tarefas e projetos pessoais.
- Planejar eventos e compromissos no calendário.
- Acompanhar metas e seus marcos de progresso.
- Registrar hábitos e rotinas.
- Acompanhar issues e pull requests do GitHub.

A interface está disponível em português e inglês, com temas e cor de destaque
personalizáveis. Seus dados ficam armazenados localmente no computador.

## Instalação

Para executar a partir do código-fonte, você precisa de **Node.js 22.12 ou
superior**, **npm** e **Git**:

```bash
git clone https://github.com/nathanmota-dev/life-board.git
cd life-board
npm ci
npm run dev
```

Para gerar um instalador, execute na pasta do projeto:

```bash
npm run package
```

O pacote fica em `release/`, no formato do sistema em que foi gerado:
**AppImage** no Linux, **NSIS** no Windows e **DMG** no macOS.

No Linux, é necessário suporte a FUSE e um chaveiro do sistema compatível com
libsecret ou KWallet. Veja o [guia de instalação e atualização no Linux](docs/instalacao-linux.md)
para instalar o AppImage e adicionar o Life Board ao menu de aplicativos.

Os detalhes de arquitetura, frontend, backend e desenvolvimento estão na
[documentação técnica](docs/guide.md).
