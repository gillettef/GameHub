import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'server-dist', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // 엔진은 순수해야 한다 (CLAUDE.md 아키텍처 원칙)
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-dom', 'react/*', '../ui/*', '../app/*'] }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '엔진에서는 시드 RNG를 사용하세요.' },
        { object: 'Date', property: 'now', message: '엔진은 시간에 의존하지 않습니다.' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
    },
  },
)
