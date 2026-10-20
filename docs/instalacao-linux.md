# Instalação e atualização no Linux

[← Guia da documentação](guide.md)

O AppImage pode ser instalado para o usuário atual, sem `sudo`. O processo é
manual: `git pull` atualiza o código, e `npm run package` gera o pacote, mas nenhum
dos dois substitui automaticamente o app instalado.

Na instalação local, o pacote gerado fica em `release/` no repositório.
Uma cópia executável fica em `~/.local/opt/life-board/life-board.AppImage`.
O atalho fica em `~/.local/share/applications/life-board-app.desktop` e os ícones
em `~/.local/share/icons/hicolor/`.

## Primeira instalação

Execute na raiz do repositório, com Node.js e npm instalados. É necessário
suporte a FUSE para abrir o AppImage e os utilitários `desktop-file-validate`,
`update-desktop-database`, `gtk-update-icon-cache` e `gio` para a integração
com o menu. Instale esses requisitos pelo gerenciador de pacotes da sua
distribuição antes de continuar. O app também exige um chaveiro do sistema
compatível com libsecret ou KWallet para proteger credenciais.

```bash
npm ci
npm run package

life_board_version=$(node -p "require('./package.json').version")
install -Dm755 "release/Life Board-${life_board_version}.AppImage" \
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

Depois disso, o app também aparece como **Life Board** no menu de aplicativos.

## Atualizar depois de uma feature

Depois que o PR for integrado à `main`, feche o Life Board e execute na raiz
do repositório, com o diretório de trabalho limpo. Use `&&` entre as etapas para
interromper a atualização caso algum comando falhe:

```bash
git switch main &&
git pull --ff-only &&
npm ci &&
npm run package &&
life_board_version=$(node -p "require('./package.json').version") &&
install -Dm755 "release/Life Board-${life_board_version}.AppImage" \
  "$HOME/.local/opt/life-board/life-board.AppImage.new" &&
mv -f "$HOME/.local/opt/life-board/life-board.AppImage.new" \
  "$HOME/.local/opt/life-board/life-board.AppImage" &&
gio launch "$HOME/.local/share/applications/life-board-app.desktop"
```

A substituição troca somente o executável. O banco, os uploads e as preferências
continuam na pasta de dados do Electron, separada do AppImage; as migrations
pendentes rodam na abertura. O nome do pacote é obtido do `package.json`, então
os comandos também funcionam quando a versão mudar.

Se o ícone mudar, repita os comandos de instalação dos ícones e atualização do
cache da primeira instalação. Os formatos nativos usados no empacotamento ficam
em `desktop/resources/`: SVG de origem, PNG para Linux, ICO para Windows e ICNS
para macOS.
