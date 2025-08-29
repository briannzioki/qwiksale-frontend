// eslint.config.mjs
import js from '@eslint/js';
import next from 'eslint-config-next';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Ignore generated/build artifacts
  { ignores: ['.next/**', 'node_modules/**', 'dist/**', 'build/**'] },

  // Next.js base config
  ...next,

  // JS + TS recommended
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Global rules/plugins
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Keep hooks rules on
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Turn common “dev-time” noise into warnings
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': 'warn',
    },
  },

  // Allow Next’s triple-slash in the generated types file
  {
    files: ['next-env.d.ts'],
    rules: { '@typescript-eslint/triple-slash-reference': 'off' },
  },

  // Config & scripts: allow require(), relax strict TS rules
  {
    files: [
      '**/*.config.{js,cjs,ts,mjs}',
      'tailwind.config.js',
      'postcss.config.js',
      'prisma/**',
      'scripts/**',
      'seed.{js,ts}',
      'prisma/seed.{js,ts}',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'off',
    },
  },

  // Middleware or .d.ts convenience: don’t fail on “any”
  {
    files: ['middleware.ts', 'src/**/*.d.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
];
