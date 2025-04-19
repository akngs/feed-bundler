import { fixupConfigRules, fixupPluginRules } from "@eslint/compat"
import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"
import typescriptEslint from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import { defineConfig } from "eslint/config"
import _import from "eslint-plugin-import"
import globals from "globals"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default defineConfig([
  {
    extends: fixupConfigRules(
      compat.extends(
        "plugin:@typescript-eslint/recommended",
        "eslint:recommended",
        "plugin:import/typescript",
        "plugin:prettier/recommended",
      ),
    ),

    plugins: {
      "@typescript-eslint": fixupPluginRules(typescriptEslint),
      import: fixupPluginRules(_import),
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },

      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: "module",
    },

    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },

    rules: {
      semi: "off",
      "import/no-named-as-default-member": "off",
      "import/namespace": "off",

      "import/order": [
        "error",
        {
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },

          groups: ["index", "sibling", "parent", "internal", "external", "builtin", "object"],
        },
      ],

      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-var-requires": "off",

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "none",
        },
      ],

      "@typescript-eslint/no-inferrable-types": [
        "warn",
        {
          ignoreParameters: true,
        },
      ],

      "@typescript-eslint/no-explicit-any": "off",
    },
  },
])
