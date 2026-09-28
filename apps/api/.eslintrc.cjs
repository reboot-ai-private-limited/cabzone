const base = require('@Cabzone/config/eslint.base.cjs');

module.exports = {
  ...base,
  root: true,
  rules: {
    ...base.rules,
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "CallExpression[callee.object.name='logger'][arguments.0.type='TemplateLiteral'][arguments.0.expressions.length>0]",
        message:
          'Log messages must be static — pino redaction cannot see inside a string. ' +
          "Put the value in the object argument: logger.info({ signal }, 'signal received').",
      },
      {
        selector:
          "CallExpression[callee.object.name='logger'][arguments.0.type='BinaryExpression'][arguments.0.operator='+']",
        message:
          'Log messages must be static — pino redaction cannot see inside a string. ' +
          'Put the value in the object argument.',
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@/modules/*/domain/*',
              '@/modules/*/application/*',
              '@/modules/*/infrastructure/*',
              '@/modules/*/interface/*',
              '@/modules/*/*.container*',
            ],
            message:
              "A module's internals are private. Import its '<name>.public.js' contract instead.",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['src/container.ts', 'src/app.ts', 'src/server.ts', 'src/worker.ts'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
};
