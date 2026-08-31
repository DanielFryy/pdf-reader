import { includeIgnoreFile } from "@eslint/compat";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import pluginNext from "@next/eslint-plugin-next";
import pluginImport from "eslint-plugin-import";
import pluginJsxA11y from "eslint-plugin-jsx-a11y";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { config as baseConfig } from "./base.js";

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const _gitignorePath = path.resolve(_dirname, "../../.gitignore");

const setAssetsImportRule = patterns => {
  return patterns.map(pattern => ({
    pattern,
    patternOptions: { matchBase: true },
    group: "object"
  }));
};

/**
 * A custom ESLint configuration for libraries that use Next.js.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const nextJsConfig = [
  ...baseConfig,
  js.configs.recommended,
  eslintConfigPrettier,
  includeIgnoreFile(_gitignorePath),
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: { process: "readonly" },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        tsconfig: ["./tsconfig.json"]
      }
    },
    plugins: {
      "@next/next": pluginNext,
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      import: pluginImport,
      "jsx-a11y": pluginJsxA11y
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json"]
        }
      },
      "import/ignore": ["vscode"],
      "import/core-modules": ["vscode"]
    },
    rules: {
      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "none",
          ignoreRestSiblings: true,
          caughtErrors: "none",
          destructuredArrayIgnorePattern: "^_",
          argsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-empty-object-type": "off",

      // Import rules
      "import/no-duplicates": "off",
      "no-extra-boolean-cast": "off",
      "import/order": [
        "error",
        {
          groups: [["builtin", "external"], ["internal", "parent", "sibling", "index"], ["object"]],
          pathGroups: [
            ...setAssetsImportRule([
              "*.svg",
              "*.svg?inline",
              "*.svg?url",
              "*.png",
              "*.jpg",
              "*.jpeg",
              "*.gif",
              "*.webp",
              "*.avif",
              "*.json",
              "*.md",
              "*.txt",
              "*.tif",
              "*.tiff",
              "*.woff",
              "*.woff2"
            ])
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: false }
        }
      ],

      // React Hooks rules
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",

      // Next.js rules
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
      "@next/next/no-img-element": "error",

      // JSX A11y rules
      ...pluginJsxA11y.configs.recommended.rules,

      // Other React rules
      "react/react-in-jsx-scope": "off"
    }
  }
];
