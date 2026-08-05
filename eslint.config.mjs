import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tsParser from "@typescript-eslint/parser";

/**
 * ESLint 10 + eslint-config-next stopgap until eslint-plugin-react ships
 * official ESLint 10 support (jsx-eslint/eslint-plugin-react#3979) and
 * eslint-config-next wires it through (vercel/next.js#89764).
 *
 * 1. Pin `settings.react.version` so eslint-plugin-react skips
 *    `context.getFilename()` auto-detection (removed in ESLint 10).
 * 2. Parse JS/MJS/CJS/JSX with @typescript-eslint/parser — Next's bundled
 *    Babel parser lacks ESLint 10's `ScopeManager#addGlobals`.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    settings: {
      react: {
        version: "19",
      },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client and vendored shadcn UI primitives.
    "src/lib/prisma/generated/**",
    "src/components/ui/**",
  ]),
]);

export default eslintConfig;
