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

https://github.com/user-attachments/assets/8a594582-c3cb-48cb-9d78-9980d2551421

## Instalação

O Life Board é distribuído para **Linux x64** pelas
[releases do GitHub](https://github.com/nathanmota-dev/life-board/releases/latest).
Baixe o
[`life-board_1.1.2_amd64.deb`](https://github.com/nathanmota-dev/life-board/releases/download/v1.1.2/life-board_1.1.2_amd64.deb)
e instale com o APT, na pasta do download:

```bash
sudo apt install ./life-board_1.1.2_amd64.deb
```

Depois, abra **Life Board** pelo menu de aplicativos. Não é preciso instalar
Node.js, npm ou Git. Novas versões aparecem em **Configurações → Atualizações**.

O pacote foi testado no Ubuntu 22.04, 24.04 e 26.04 e no Debian 12 e 13. O app
exige um chaveiro do sistema desbloqueado (GNOME Keyring ou KWallet) para proteger
credenciais. Também há um
[AppImage](https://github.com/nathanmota-dev/life-board/releases/download/v1.1.2/life-board-1.1.2-x86_64.AppImage),
que dispensa instalação, mas requer FUSE. O DEB baixado não cadastra um repositório
APT: `sudo apt install life-board`, pelo nome do pacote, não funciona.

Veja o [guia de instalação no Linux](docs/instalacao-linux.md) para o AppImage,
a migração de uma instalação manual, atualizações e execução a partir do código.

### Windows e macOS

O código está adaptado para Windows x64 e macOS (Intel e Apple Silicon),
incluindo empacotamento, integração nativa e atualizações. **A distribuição oficial
é somente Linux x64 (DEB e AppImage).** Não há instaladores oficiais nem workflows
de build/release para Windows e macOS no momento.

A distribuição assinada para Windows exige um certificado/serviço de assinatura;
no macOS, exige adesão ao Apple Developer Program, certificado Developer ID e
notarização. Os custos e a manutenção dessas credenciais ficam fora do escopo
atual do projeto. Isso não impede executar ou compilar o código nesses sistemas.

Os guias de [Windows](docs/instalacao-windows.md) e
[macOS](docs/instalacao-macos.md) descrevem builds locais para desenvolvimento e
suas limitações. A [validação multiplataforma](docs/validacao-multiplataforma.md)
registra os testes históricos; ela não representa suporte oficial ou validação
contínua dessas plataformas.

Os detalhes de arquitetura, frontend, backend e desenvolvimento estão na
[documentação técnica](docs/guide.md).
