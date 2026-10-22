# Instalação e atualização no macOS

[← Guia da documentação](guide.md)

**Não há instalador oficial para macOS nas releases atuais.** A distribuição
oficial é somente [Linux](instalacao-linux.md). O código mantém suporte a Intel e
Apple Silicon, mas o workflow de build/publicação dessa plataforma foi removido.

A distribuição com Developer ID e notarização exige participação paga no Apple
Developer Program e manutenção de certificados e credenciais. Esse custo fica
fora do escopo atual; não impede compilar o código localmente para desenvolvimento.

## Requisitos

- Um Mac da mesma arquitetura do alvo, Node.js 22.12 ou superior, npm e Git.
- Uma conta descartável para testes de instalação e Keychain.

Os testes anteriores nos runners macOS com assinatura ad-hoc são históricos. Não
comprovam uma distribuição notarizada nem validação contínua de Macs de usuário.
Veja a [validação multiplataforma](validacao-multiplataforma.md).

## Instalar

Gere o pacote local conforme [Gerar a partir do código](#gerar-a-partir-do-código).
Use `life-board-<versão>-mac-arm64.dmg` em Apple Silicon ou
`life-board-<versão>-mac-x64.dmg` em Intel, na pasta de saída do respectivo build.
Abra o DMG, arraste **Life Board** para **Applications**, ejete o DMG e abra o app.

Esses builds de desenvolvimento não têm Developer ID nem notarização. A assinatura
ad-hoc usada nos testes não equivale à aprovação da Apple, e o Gatekeeper pode
bloquear a execução. Não há pacote oficial notarizado para baixar nem garantia de
instalação sem avisos. Teste somente builds próprios em contas descartáveis.
Os requisitos para uma futura distribuição ficam em
[Assinatura](multiplataforma.md#assinatura).

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

A implementação do atualizador macOS permanece no código, mas as releases
oficiais não publicam ZIPs nem o feed `latest-mac.yml`. Portanto, **não há
atualizações oficiais pelo aplicativo no macOS**. Builds ad-hoc não validam o
fluxo de atualização assinado de produção.

Para atualizar um build local, compile novamente, feche o app pelo menu (**Sair**)
e substitua o aplicativo usando o novo DMG. Preserve um backup dos dados e do
ambiente de teste. Consulte [Atualizações](atualizacoes.md) para feeds controlados.

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
