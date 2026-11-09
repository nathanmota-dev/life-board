# Backend

[← Guia da documentação](guide.md)

A API fica em `src-tauri/crates/api`, em Rust (axum + rusqlite), e segue uma MVC
reduzida. O contrato HTTP e o formato do banco estão em
[`CONTRACT.md`](../src-tauri/crates/api/CONTRACT.md).

- `src/dto/`: validação de body, query e params de cada módulo.
- `src/controllers/`: rotas; validam a entrada com o DTO e chamam o service.
- `src/services/`: regras de negócio e acesso ao banco.
- `src/db/schema/`: tabelas SQLite; `migrations/` guarda as migrations.
- `src/plugins/`: CORS e o hook de autenticação.

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
processo principal abre a chave e a envia ao backend por uma linha no stdin, nunca
por variável de ambiente ou argumento. No
Linux, o app não inicia sem um chaveiro de verdade, para não cair no modo
`basic_text`.

Ainda não há login. Só `/api/health` é pública; as demais rotas passam pelo
`Authenticator` de `src/plugins/auth.rs`, que hoje libera tudo. Quando a
autenticação chegar, basta implementar esse trait.

O React recebe a URL da API com `window.desktop.getApiBaseUrl()`.

## Migrations

As migrations ficam em `src-tauri/crates/api/migrations/` e são embutidas no
binário em tempo de compilação, na ordem de `meta/_journal.json`. Não há
`drizzle-kit`. Os snapshots de `meta/` antigos ficam só como histórico. O formato
de registro em `__drizzle_migrations` continua igual ao das versões em Node, para
os perfis existentes seguirem migrando.

Para alterar o banco:

1. Crie `migrations/<índice>_<nome>.sql`, com `--> statement-breakpoint` entre os
   comandos. Nunca edite uma migration já lançada: o hash do arquivo fica salvo no
   perfil do usuário.
2. Acrescente a entrada em `migrations/meta/_journal.json`, com o mesmo `tag`,
   o próximo `idx` e um `when` maior que o de todas as anteriores, em milissegundos.
   Só roda a migration cujo `when` é maior que o da última aplicada.
3. Ajuste as tabelas em `src/db/schema/`.
4. Adicione em `tests/suite/db/` um teste que abre um perfil existente, aplica a
   migration e confere que os dados antigos continuam lá, como em
   `goals_migration.rs`.

## Testes

`npm run test:rust` roda a suíte de `tests/suite`, traduzida dos testes da API Node.
Os testes golden comparam as respostas com as gravadas da API Node 1.1.2 em
`tests/fixtures/` (perfil `node-1.1.2.db`, respostas dos GETs, segredos selados
com uma chave de teste e a lista das rotas). Esses arquivos estão congelados: a
API Node não existe mais para regravá-los.

Comandos: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
`npm run test:rust` e `npm run test:coverage`.
