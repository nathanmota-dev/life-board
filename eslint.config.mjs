import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/coverage/**', 'web/src/routeTree.gen.ts'] },
  {
    files: ['**/*.{ts,tsx,mts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // Existing code uses explicit any at integration boundaries; typecheck
      // remains responsible for type compatibility.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
  { files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-this-alias': 'off' } },
)
