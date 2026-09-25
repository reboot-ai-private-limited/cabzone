/**
 * Shared ESLint config for the React packages (apps/web).
 */
module.exports = {
  extends: [
    require.resolve('./eslint.base.cjs'),
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier',
  ],
  plugins: ['react', 'react-hooks', 'jsx-a11y'],
  settings: { react: { version: 'detect' } },
  parserOptions: { ecmaFeatures: { jsx: true } },
  env: { browser: true, node: true, es2022: true },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react/no-array-index-key': 'error',
    'react-hooks/exhaustive-deps': 'error',
    'jsx-a11y/no-autofocus': 'off',
  },
};
