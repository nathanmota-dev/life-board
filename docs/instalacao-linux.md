# Instalação e atualização no Linux

[← Guia da documentação](guide.md)

As versões estáveis são publicadas nas
[releases do GitHub](https://github.com/nathanmota-dev/life-board/releases/latest)
para **Linux x64**, em dois formatos com o mesmo app e a mesma pasta de dados:

| Formato | Arquivo | Instalação |
| --- | --- | --- |
| DEB (recomendado) | `life-board_<versão>_amd64.deb` | Sistema, com `sudo apt` |
| AppImage | `life-board-<versão>-x86_64.AppImage` | Usuário atual, sem `sudo`; requer FUSE |

Não há pacotes ARM, Snap, Flatpak ou RPM publicados.

## Requisitos

- Debian, Ubuntu ou derivado x64. A instalação e a abertura do pacote foram
  verificadas no Ubuntu 22.04, 24.04 e 26.04 e no Debian 12 e 13.
- Um chaveiro do sistema desbloqueado na sessão, como o GNOME Keyring ou o KWallet.
  O app não abre sem ele, porque a chave que protege as credenciais fica no chaveiro.
  O DEB depende de `libsecret-1-0` e recomenda `gnome-keyring` ou KWallet, mas
  a biblioteca sozinha não fornece um chaveiro desbloqueado.
- Para instalar atualizações do DEB pelo app, um agente de autorização do PolicyKit
  na sessão (os desktops GNOME e KDE já incluem). O DEB depende de `pkexec`.

## Instalar o DEB

Baixe o `.deb` da release e instale na pasta do download. O nome deve ser igual ao
do arquivo baixado:

```bash
sudo apt install ./life-board_1.0.0_amd64.deb
```

O `./` é necessário: ele indica um arquivo local e faz o APT instalar também as
dependências. O pacote se chama `life-board` e instala:

- o app em `/opt/Life Board/`, com o comando `life-board-app` em `/usr/bin`;
- o atalho `/usr/share/applications/life-board-app.desktop` e o ícone `life-board-app`;
- um perfil do AppArmor para o sandbox do Chromium no Ubuntu 24.04 ou superior.

Abra **Life Board** pelo menu de aplicativos. Para remover, use
`sudo apt remove life-board`; os dados do usuário não são apagados.

Baixar o DEB **não** cadastra um repositório APT. Por isso,
`sudo apt install life-board` (pelo nome do pacote) e as atualizações automáticas
do `apt upgrade` não funcionam; isso exigiria um repositório publicado e configurado
à parte.

## Usar o AppImage

O AppImage roda sem instalação e requer FUSE (no Ubuntu 22.04 ou superior, o
pacote `libfuse2`/`libfuse2t64`). Para manter atualizações e atalhos estáveis,
guarde-o em um caminho fixo com permissão de escrita, por exemplo:

```bash
install -Dm755 life-board-1.0.0-x86_64.AppImage "$HOME/.local/opt/life-board/life-board.AppImage"
"$HOME/.local/opt/life-board/life-board.AppImage" --no-sandbox
```

O AppImage não cria atalho no menu. Para criar um, siga
[Instalar a partir do código](#instalar-a-partir-do-código), usando o arquivo baixado.

## Atualizações

Nas duas instalações, **Configurações → Atualizações** verifica as releases públicas,
baixa o pacote do mesmo formato e arquitetura e pede confirmação para instalar.
O DEB pede autenticação de administrador pelo PolicyKit; o AppImage substitui o
arquivo no mesmo caminho. Nenhum token é necessário. Detalhes em
[Atualizações](atualizacoes.md).

Se a atualização pelo app falhar, baixe o pacote mais novo da release e instale
manualmente: `sudo apt install ./life-board_<versão>_amd64.deb` substitui a versão
instalada, mantendo os dados.

A versão multiplataforma mantém o pacote `life-board`, os nomes dos arquivos, o
feed `latest-linux.yml` e a pasta de dados da 1.0.0, então uma instalação 1.0.0
atualiza pelo app como antes. Antes de atualizar, faça uma cópia da pasta de dados
(veja abaixo). Se a versão nova não abrir, reinstale o DEB anterior da página de
releases com `sudo apt install --allow-downgrades ./life-board_<versão anterior>_amd64.deb`;
as migrations já aplicadas pela versão nova continuam no banco, então restaure
também a cópia dos dados. A situação dos testes de upgrade está na
[validação multiplataforma](validacao-multiplataforma.md).

## Dados do usuário

Os dois formatos usam a mesma pasta de dados, `~/.config/life-board-app/`: banco
`life-board.db`, uploads, chave criptografada `secret.key.enc` e preferências.
Se você escolheu outra pasta para os uploads em Configurações > Arquivos, eles
ficam em `<pasta>/life-board-app/uploads`. Inclua essa pasta nos seus backups.
A chave só pode ser aberta pelo chaveiro da sessão em que foi criada. As migrations
pendentes rodam na abertura de uma versão nova.

## Migrar do AppImage manual para o DEB

Quem seguiu a instalação manual anterior tem o AppImage em
`~/.local/opt/life-board/life-board.AppImage` e um atalho de usuário com o mesmo
nome do atalho do DEB. O atalho de usuário tem prioridade sobre o do sistema e
continuaria abrindo o AppImage. Nenhum arquivo é apagado automaticamente.

1. Feche o Life Board pela bandeja (**Sair**), não só a janela.
2. Faça uma cópia dos dados:

   ```bash
   cp -a "$HOME/.config/life-board-app" "$HOME/life-board-backup-$(date +%F)"
   ```

3. Instale o DEB: `sudo apt install ./life-board_1.0.0_amd64.deb`.
4. Remova o atalho e os ícones de usuário criados pela instalação manual, para que
   o menu use o atalho do DEB:

   ```bash
   rm -f "$HOME/.local/share/applications/life-board-app.desktop" \
     "$HOME/.local/share/icons/hicolor/1024x1024/apps/life-board-app.png" \
     "$HOME/.local/share/icons/hicolor/scalable/apps/life-board-app.svg"
   update-desktop-database "$HOME/.local/share/applications"
   gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor"
   ```

5. Abra **Life Board** pelo menu e confirme que tarefas, uploads, integrações e
   preferências continuam lá. **Configurações → Atualizações** deve mostrar o formato DEB.
6. Se a inicialização com o sistema estiver ativa, desative e ative de novo em
   **Configurações**. Isso regrava `~/.config/autostart/dev.nathanmota.lifeboard.desktop`
   apontando para `/opt/Life Board/life-board-app`. Confira com:

   ```bash
   grep '^Exec=' "$HOME/.config/autostart/dev.nathanmota.lifeboard.desktop"
   ```

7. Depois de confirmar que tudo funciona, remova o AppImage antigo se quiser:
   `rm "$HOME/.local/opt/life-board/life-board.AppImage"`. Guarde a cópia dos
   dados até ter certeza de que não precisa dela.

Para voltar ao AppImage, remova o DEB, restaure o AppImage e o atalho de usuário;
a pasta de dados é a mesma.

## Instalar a partir do código

Para desenvolvimento ou para gerar um build local, use Node.js 22.12 ou superior,
npm e Git. Veja também [Desenvolvimento](desenvolvimento.md).

```bash
git clone https://github.com/nathanmota-dev/life-board.git
cd life-board
npm ci
npm run package:linux
```

O comando gera `release/life-board_<versão>_amd64.deb`,
`release/life-board-<versão>-x86_64.AppImage` e `release/latest-linux.yml`. O DEB
local é instalado como o da release. Para instalar o AppImage local com um atalho
de usuário (requer `desktop-file-validate`, `update-desktop-database`,
`gtk-update-icon-cache` e `gio`):

```bash
life_board_version=$(node -p "require('./package.json').version")
install -Dm755 "release/life-board-${life_board_version}-x86_64.AppImage" \
  "$HOME/.local/opt/life-board/life-board.AppImage"

install -Dm644 desktop/resources/icon.png \
  "$HOME/.local/share/icons/hicolor/1024x1024/apps/life-board-app.png"
install -Dm644 desktop/resources/icon.svg \
  "$HOME/.local/share/icons/hicolor/scalable/apps/life-board-app.svg"

mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/life-board-app.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Life Board
Comment=Personal tasks, goals, calendar and habit tracking
Exec="$HOME/.local/opt/life-board/life-board.AppImage" --no-sandbox %U
TryExec=$HOME/.local/opt/life-board/life-board.AppImage
Icon=life-board-app
Terminal=false
Categories=Office;
Keywords=habits;tasks;goals;calendar;
StartupNotify=true
StartupWMClass=life-board-app
X-AppImage-Name=Life Board
EOF

desktop-file-validate "$HOME/.local/share/applications/life-board-app.desktop"
update-desktop-database "$HOME/.local/share/applications"
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor"
gio launch "$HOME/.local/share/applications/life-board-app.desktop"
```

Não instale o DEB e esse atalho de usuário ao mesmo tempo: o atalho de usuário
esconde o do DEB. Os formatos de ícone usados no empacotamento ficam em
`desktop/resources/`: SVG de origem, PNG para Linux, ICO para Windows e ICNS
para macOS.
