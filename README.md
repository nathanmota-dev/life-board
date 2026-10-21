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

O Life Board é distribuído para **Linux x64** pelas
[releases do GitHub](https://github.com/nathanmota-dev/life-board/releases/latest).
Baixe o
[`life-board_1.0.0_amd64.deb`](https://github.com/nathanmota-dev/life-board/releases/download/v1.0.0/life-board_1.0.0_amd64.deb)
e instale com o APT, na pasta do download:

```bash
sudo apt install ./life-board_1.0.0_amd64.deb
```

Depois, abra **Life Board** pelo menu de aplicativos. Não é preciso instalar
Node.js, npm ou Git. Novas versões aparecem em **Configurações → Atualizações**.

O pacote foi testado no Ubuntu 22.04, 24.04 e 26.04 e no Debian 12 e 13. O app
exige um chaveiro do sistema desbloqueado (GNOME Keyring ou KWallet) para proteger
credenciais. Também há um
[AppImage](https://github.com/nathanmota-dev/life-board/releases/download/v1.0.0/life-board-1.0.0-x86_64.AppImage),
que dispensa instalação, mas requer FUSE. O DEB baixado não cadastra um repositório
APT: `sudo apt install life-board`, pelo nome do pacote, não funciona.

Veja o [guia de instalação no Linux](docs/instalacao-linux.md) para o AppImage,
a migração de uma instalação manual, atualizações e execução a partir do código.

Os detalhes de arquitetura, frontend, backend e desenvolvimento estão na
[documentação técnica](docs/guide.md).
