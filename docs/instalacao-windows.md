# Instalação e atualização no Windows

[← Guia da documentação](guide.md)

O Life Board para **Windows x64** é distribuído como instalador NSIS nas
[releases do GitHub](https://github.com/nathanmota-dev/life-board/releases/latest),
a partir da primeira release multiplataforma. A 1.0.0 é só para Linux.

| Arquivo | Uso |
| --- | --- |
| `life-board-<versão>-win-x64.exe` | Instalação e atualização |

Não há versão ARM64, portátil ou da Microsoft Store.

## Requisitos

- Windows 10 ou 11 x64 (requisito do Electron 44).
- Uma conta de usuário comum. O instalador não pede privilégios de administrador.
- Não é preciso instalar Node.js, npm ou Git.

A validação nativa feita até agora foi no Windows Server 2022 (build 20348) dos
runners do GitHub. Windows 10 e 11 de usuário ainda não foram testados; veja a
[validação multiplataforma](validacao-multiplataforma.md).

## Instalar

1. Baixe `life-board-<versão>-win-x64.exe` da release e, se quiser, confira o
   SHA-256 com o `SHA256SUMS.txt` da mesma release:

   ```powershell
   Get-FileHash .\life-board-<versão>-win-x64.exe -Algorithm SHA256
   ```

2. Abra o instalador. Ele instala só para o usuário atual, em
   `%LOCALAPPDATA%\Programs\Life Board`, e cria os atalhos do menu Iniciar e da área
   de trabalho. O app não abre sozinho ao terminar.
3. Abra **Life Board** pelo menu Iniciar.

Releases de produção são assinadas com Authenticode. Antes de executar, confira
o editor em **Propriedades → Assinaturas digitais** ou com:

```powershell
Get-AuthenticodeSignature .\life-board-<versão>-win-x64.exe | Format-List Status, SignerCertificate
```

`Status` deve ser `Valid`. O SmartScreen ainda pode exibir um aviso para um
instalador assinado recém-publicado; nesse caso, use **Mais informações → Executar
assim mesmo** só se a assinatura e o checksum conferirem.

Builds de branch e de desenvolvimento **não são assinados** e não devem ser
distribuídos. Eles mostram "Editor desconhecido" no SmartScreen e servem só para
testes em contas descartáveis.

## Uso no Windows

- **Bandeja:** o ícone fica na área de notificação. Clicar abre o pomodoro; o menu
  do botão direito tem as demais ações e **Sair**.
- **Notificações:** dependem do atalho do menu Iniciar criado pelo instalador.
  Confira se as notificações do Life Board estão permitidas em
  **Configurações → Sistema → Notificações**.
- **Iniciar com o sistema:** ativado em **Configurações** do app. O Windows registra o
  executável instalado com `--hidden`; ele pode ser desativado também em
  **Gerenciador de Tarefas → Aplicativos de inicialização**.
- **Captura rápida:** `Ctrl+Shift+Espaço`. Se outro app já usa esse atalho, o
  Life Board continua funcionando sem ele.

## Atualizações

**Configurações → Atualizações** verifica a release mais recente, baixa o
instalador da mesma arquitetura e pede confirmação antes de instalar. O instalador
substitui a versão atual na mesma pasta e abre a versão nova. Nada é instalado
sem confirmação. Detalhes em [Atualizações](atualizacoes.md).

Se a atualização pelo app falhar, feche o Life Board pela bandeja (**Sair**) e
execute o instalador mais novo baixado da release. Ele mantém os dados.

## Dados do usuário

Os dados ficam em `%APPDATA%\life-board-app`: banco `life-board.db`, uploads,
`secret.key.enc` e preferências. Se você escolheu outra pasta para os uploads em
**Configurações → Arquivos**, inclua-a nos backups.

A chave de `secret.key.enc` é protegida pelo DPAPI da sua conta. Copiar essa pasta
para outra conta, outro computador ou outro sistema preserva tarefas e uploads, mas
o token do GitHub precisa ser conectado de novo.

Se o app avisar que não consegue ler os segredos salvos, **Redefinir chave**
mantém o banco e apaga só os segredos cifrados (hoje, o token do GitHub). Veja
[Chave dos segredos no Windows](multiplataforma.md#chave-dos-segredos-no-windows).

## Desinstalar

Use **Configurações → Aplicativos → Aplicativos instalados → Life Board →
Desinstalar**. A pasta `%APPDATA%\life-board-app` não é apagada; remova-a
manualmente se não precisar mais dos dados.

## Gerar a partir do código

Em uma máquina Windows x64 com Node.js 22.12 ou superior, npm e Git:

```powershell
npm ci
npm run package:win
```

O comando gera `release\life-board-<versão>-win-x64.exe` sem assinatura. Veja
[Desenvolvimento](desenvolvimento.md) para o smoke do app instalado e
[Empacotamento multiplataforma](multiplataforma.md#build-windows-x64) para a
assinatura de produção.
