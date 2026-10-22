# Instalação e atualização no Windows

[← Guia da documentação](guide.md)

**Não há instalador oficial para Windows nas releases atuais.** A distribuição
oficial é somente [Linux](instalacao-linux.md). O código mantém suporte a Windows
x64, mas o workflow de build/publicação dessa plataforma foi removido.

A assinatura pública do instalador exige certificado ou serviço de assinatura,
com custos e integração que não fazem parte do escopo atual. Não é uma licença
necessária para executar o código: você pode compilar localmente para uso e testes.

## Requisitos

- Windows x64, Node.js 22.12 ou superior, npm e Git para compilar.
- Uma conta descartável para testes de instalação; o aplicativo instalado usa uma
  conta comum, sem privilégios de administrador.

Os testes anteriores nos runners Windows são evidências históricas, não uma
validação contínua nem garantia de funcionamento em Windows 10/11 de usuário.
Veja a [validação multiplataforma](validacao-multiplataforma.md).

## Instalar

Primeiro gere seu próprio instalador conforme [Gerar a partir do código](#gerar-a-partir-do-código).
O arquivo local será `release\life-board-<versão>-win-x64.exe`.
Ele instala para o usuário atual em `%LOCALAPPDATA%\Programs\Life Board` e cria
atalhos no menu Iniciar e na área de trabalho. Abra o app pelo menu Iniciar.

O build local não tem assinatura de produção e pode aparecer como **Editor
desconhecido**. Não há certificado oficial ou checksum de release Windows para
conferir. Use apenas o pacote que você compilou e teste em uma conta descartável.
Os requisitos de uma futura distribuição assinada ficam em
[Assinatura](multiplataforma.md#assinatura).

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

A implementação do atualizador Windows permanece no código, mas as releases
oficiais não publicam o instalador nem o feed `latest.yml`. Portanto, **não há
atualizações oficiais pelo aplicativo no Windows**.

Para atualizar um build local, gere um novo instalador, feche o app pela bandeja
(**Sair**) e instale na mesma conta. Preserve um backup dos dados. Testes com feed
controlado são descritos em [Atualizações](atualizacoes.md).

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
