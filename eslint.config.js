import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs["flat/recommended"],
  {
    ignores: [
      ".playwright-mcp/**",
      ".svelte-kit/**",
      ".vercel/**",
      "build/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["**/*.svelte"],
    rules: {
      "svelte/no-navigation-without-resolve": "off",
    },
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
);
