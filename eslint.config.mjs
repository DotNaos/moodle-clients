import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores([
        'node_modules/**',
        'dist/**',
        'build/**',
        '.next/**',
        '.expo/**',
        'ios/**',
        'android/**',
    ]),
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                ecmaFeatures: { jsx: true },
                sourceType: 'module',
            },
        },
        rules: {
            'max-lines': ['error', {
                max: 700,
                skipBlankLines: true,
                skipComments: true,
            }],
        },
    },
]);
