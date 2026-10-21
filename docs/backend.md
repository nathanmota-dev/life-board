# Backend

[← Guia da documentação](guide.md)

A API fica em `api/` (workspace npm) e segue uma MVC reduzida:

- `src/dto/`: schemas Zod de body, query e params de cada módulo.
- `src/controllers/`: rotas Fastify; validam a entrada com o DTO e chamam o service.
- `src/services/`: regras de negócio e acesso ao banco com Drizzle.
- `src/db/schema/`: tabelas SQLite; `api/drizzle/` guarda as migrations geradas.
- `src/plugins/`: tratamento de erros e o hook de autenticação.

Módulos: tasks, thoughts, links, goals (com milestones), calendar, mood,
habits, stats, github e file-boards. Todas as rotas usam o prefixo `/api`.

O banco `life-board.db` e os uploads ficam na pasta de dados do Electron
(`~/.config/life-board-app/` no Linux). As migrations rodam sempre que a API
inicia.

A pasta dos uploads pode ser trocada em Configurações > Arquivos
(`/api/settings/files`). A escolha fica na tabela `app_settings`, e os arquivos
vão para `<pasta>/life-board-app/uploads`. Ao trocar de pasta, a API copia todos
os arquivos para a nova, salva a escolha e só então apaga os antigos. Se alguma
cópia falhar, nada muda. Apagar um board ou um arquivo remove as linhas do banco
e os arquivos do disco de vez.

O token do GitHub é salvo cifrado com AES-256-GCM. A chave fica em
`secret.key.enc`, protegida pelo chaveiro do sistema via `safeStorage` do
Electron (libsecret/KWallet no Linux, Keychain no macOS, DPAPI no Windows). O
processo principal abre a chave e a envia ao backend pelo `parentPort`. No
Linux, o app não inicia sem um chaveiro de verdade, para não cair no modo
`basic_text`.

Ainda não há login. Só `/api/health` é pública; as demais rotas passam pelo
hook `authenticate` de `src/plugins/auth.ts`, que hoje libera tudo. Quando a
autenticação chegar, basta implementar esse hook.

O React recebe a URL da API com `window.desktop.getApiBaseUrl()`.

## Migrations

Para alterar o banco, edite `api/src/db/schema/` e gere uma migration:

```bash
npm run db:generate --workspace api
```
