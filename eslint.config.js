import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs["flat/recommended"],
  {
    ignores: [".svelte-kit/**", ".vercel/**", "build/**", "dist/**", "node_modules/**"]
  },
  {
    files: ["**/*.svelte"],
    rules: {
      "svelte/no-navigation-without-resolve": "off"
    },
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  }
);
