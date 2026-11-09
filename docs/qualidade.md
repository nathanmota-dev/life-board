# Qualidade

[← Guia da documentação](guide.md)

Todo pull request passa por workflows independentes. O `PR Validation` reconcilia a
última execução de cada um e mantém **um único comentário** no PR, com o status
`PR Validation` no commit.

| Workflow | O que verifica |
| --- | --- |
| Frontend CI | auditoria, lint, typecheck, testes e cobertura do `web/` |
| Rust CI | formatação, Clippy e testes em Linux, Windows e macOS (somente com `Cargo.toml`) |
| Electron E2E | suíte Playwright contra o app real |
| PR Quality Gate | auditorias, cobertura e métricas de qualidade |
| Performance | microbenchmarks com limite de 20% de perda |

## Execução local

```sh
npm ci
npm run test:quality
npm run test:coverage:ci
node scripts/quality-gate.js
mkdir -p reports/benchmarks
npm run benchmark:ci
node scripts/benchmark-gate.js
```

Os resultados ficam em `reports/quality-gate.md` e `reports/performance.md`. Nos dois
gates, o código de saída `0` indica aprovação, `1` regressão e `2` entrada ausente ou
inválida.

## Regras do quality gate

Os pacotes medidos são `api`, `desktop` e `web`.

- **Cobertura:** linhas, statements, funções e branches não podem cair mais de 0,1 pp
  por pacote nem no total. A `api` também precisa de pelo menos 80%.
- **Linhas alteradas:** ao menos 80% das linhas executáveis adicionadas ou alteradas
  precisam estar cobertas.
- **Duplicação (JSCPD):** a porcentagem e o número de fragmentos não podem subir.
- **Lint:** zero erros e avisos (ESLint e, para Rust, Clippy).
- **Tamanho:** nenhum arquivo de produção acima de 350 linhas e nenhuma função acima
  de 100. A regra é absoluta: não há dívida tolerada.
- **Marcadores proibidos:** `.only`, `.skip` incondicional, `#[ignore]`, `todo!()` e
  `unimplemented!()`.

## Referência de comparação

No CI, a referência é o commit em que o PR vai entrar, medido no mesmo runner com os
scripts daquele commit. Assim, o piso sobe a cada melhoria e um PR não consegue
enfraquecer a própria comparação. `scripts/baseline.json` e
`scripts/benchmark-baseline.json` só são usados quando a base ainda não tem o gate.

Para gerar uma nova referência manualmente (bloqueado com `CI=true`):

```sh
node scripts/quality-gate.js --update-baseline
node scripts/benchmark-gate.js --update-baseline
```

## API em Rust

Com `Cargo.toml` na raiz e `src-tauri/crates/api/src`, o pacote `api` passa a ser
medido em Rust:

- `npm run test:coverage:ci` precisa gravar `coverage/api/coverage.json`
  (`cargo llvm-cov --json`) e `coverage/api/lcov.info`.
- Statements são as regiões do LLVM. Branches aparecem como `n/a`, porque o Rust
  estável não mede branches.
- O tamanho das funções vem do lint `clippy::too_many_lines` (limite em `clippy.toml`).
- `npm run benchmark:api` precisa gravar `reports/benchmarks/api.json`;
  `scripts/run-rust-benchmark.js` converte o resultado do Criterion para esse formato.

Quando a linguagem de um pacote muda entre a base e o PR, as comparações daquele
pacote e os totais são ignorados. Continuam valendo o piso de 80% e os limites
absolutos.

## Performance

O workflow executa somente os benchmarks das áreas alteradas e compara a vazão com a
base. Perda acima de 20%, resultado inválido ou remoção de um benchmark existente
bloqueiam o PR. Um benchmark novo só gera aviso.

## Política protegida

Os arquivos de `scripts/protected-paths.json` definem as regras acima e estão listados
no [`AGENTS.md`](../AGENTS.md). Para alterá-los, o PR precisa vir de uma branch `ci/`
do próprio repositório e ter o label `validation-infrastructure-approved`.

A exceção temporária para `refactor/rewrite-rust-app` em `scripts/pr-validation.js`
deve ser removida depois que a reescrita entrar na `main`.
