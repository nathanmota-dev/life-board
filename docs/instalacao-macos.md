# Instalação e atualização no macOS

[← Guia da documentação](guide.md)

O Life Board para **macOS** é distribuído nas
[releases do GitHub](https://github.com/nathanmota-dev/life-board/releases/latest),
a partir da primeira release multiplataforma. A 1.0.0 é só para Linux. Há um
pacote para cada processador:

| Mac | Instalação | Atualização |
| --- | --- | --- |
| Apple Silicon (M1 ou posterior) | `life-board-<versão>-mac-arm64.dmg` | `life-board-<versão>-mac-arm64.zip` |
| Intel | `life-board-<versão>-mac-x64.dmg` | `life-board-<versão>-mac-x64.zip` |

Para saber qual é o seu, abra **Menu Apple → Sobre Este Mac**: "Chip Apple M…" é
Apple Silicon; "Processador Intel…" é Intel. Não há binário universal. O ZIP é
usado pelo próprio app nas atualizações; para instalar, baixe o DMG.

## Requisitos

- macOS 12 ou superior (requisito do Electron 44).
- Não é preciso instalar Node.js, npm ou Git.

A validação nativa feita até agora foi no macOS 15.7.9 dos runners do GitHub,
em Intel e Apple Silicon, com builds ad-hoc. Macs reais e builds notarizados ainda
não foram testados; veja a [validação multiplataforma](validacao-multiplataforma.md).

## Instalar

1. Baixe o DMG do seu processador e, se quiser, confira o SHA-256 com o
   `SHA256SUMS.txt` da mesma release:

   ```bash
   shasum -a 256 life-board-<versão>-mac-arm64.dmg
   ```

2. Abra o DMG e arraste **Life Board** para **Applications**.
3. Ejete o DMG e abra **Life Board** pela pasta Aplicativos ou pelo Launchpad.

Releases de produção são assinadas com Developer ID e notarizadas pela Apple. Na
primeira abertura, o macOS confirma que o app foi baixado da internet; escolha
**Abrir**. Para conferir a assinatura:

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Life Board.app"
spctl --assess --type execute --verbose=2 "/Applications/Life Board.app"
```

O `spctl` deve mostrar `accepted` e `source=Notarized Developer ID`.

Builds de branch e de desenvolvimento têm só assinatura **ad-hoc** e não são
notarizados. O Gatekeeper os bloqueia quando baixados, e o updater não os instala.
Servem só para testes em contas descartáveis; não remova a quarentena de apps de
origem desconhecida.

## Uso no macOS

- **Dock e barra de menus:** fechar a janela mantém o app ativo quando o segundo
  plano ou o pomodoro está ligado; clicar no ícone do Dock reabre a janela. O ícone
  da barra de menus abre o menu com as ações e **Sair**.
- **Notificações:** o macOS pede permissão na primeira notificação. Para mudar
  depois, use **Ajustes do Sistema → Notificações → Life Board**.
- **Iniciar com o sistema:** ativado em **Configurações** do app, que registra um
  item de login. O macOS 13 ou superior pode pedir aprovação em
  **Ajustes do Sistema → Geral → Itens de Início**.
- **Captura rápida:** `Cmd+Shift+Espaço`. Se outro app já usa esse atalho, o
  Life Board continua funcionando sem ele.

## Atualizações

**Configurações → Atualizações** verifica a release mais recente, baixa o ZIP do
mesmo processador, confere a assinatura e pede confirmação antes de instalar.
Depois de **Instalar e reiniciar**, o app fecha uma vez e abre na versão nova. Em
um Apple Silicon, o app baixa o pacote arm64 mesmo se estiver rodando pelo Rosetta.
Detalhes em [Atualizações](atualizacoes.md).

O app precisa estar em uma pasta onde seu usuário possa escrever, como
`/Applications` em uma conta de administrador. Se a atualização pelo app falhar,
feche o Life Board pelo menu (**Sair**), baixe o DMG mais novo e substitua o app em
Aplicativos. Os dados são mantidos.

## Dados do usuário

Os dados ficam em `~/Library/Application Support/life-board-app`: banco
`life-board.db`, uploads, `secret.key.enc` e preferências. Se você escolheu outra
pasta para os uploads em **Configurações → Arquivos**, inclua-a nos backups.

A chave de `secret.key.enc` fica no Keychain, em um item terminado em
`Safe Storage`. Não apague esse item. Copiar a pasta de dados para outro Mac ou
outro sistema preserva tarefas e uploads, mas o token do GitHub precisa ser
conectado de novo.

## Desinstalar

Feche o app pelo menu (**Sair**) e mova **Life Board** de Aplicativos para o Lixo.
A pasta de dados e o item do Keychain não são apagados; remova-os manualmente se
não precisar mais deles.

## Gerar a partir do código

Em um Mac do mesmo processador do alvo, com Node.js 22.12 ou superior, npm e Git:

```bash
npm ci
npm run package:mac:arm64   # Apple Silicon, em release/mac-arm64/
npm run package:mac:x64     # Intel, em release/mac-x64/
```

Sem certificado, o resultado não é assinado. Veja [Desenvolvimento](desenvolvimento.md)
para gerar um build ad-hoc e rodar o smoke, e
[Empacotamento multiplataforma](multiplataforma.md#build-macos-x64-e-arm64) para a
assinatura e a notarização de produção.
