import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  { ignores: ['dist', 'public/legacy', 'coverage', 'test-results', 'playwright-report'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      // Solo las 2 reglas clásicas de react-hooks (llamadas condicionales,
      // deps de useEffect) -- el resto del preset "recommended" de v7 son
      // reglas orientadas al React Compiler (set-state-in-effect, refs,
      // purity...) que este proyecto no usa y que marcan como error
      // patrones ya usados a propósito acá (ver useArrastrePosicion.js,
      // BurbujaMensajes.jsx: mutar un ref durante el render es intencional).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
