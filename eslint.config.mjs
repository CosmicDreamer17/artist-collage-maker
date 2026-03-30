import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import importPlugin from "eslint-plugin-import";

export default [
  {
    ignores: ["**/.next/**", "**/dist/**", "**/node_modules/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "import/no-extraneous-dependencies": ["error", { 
        "devDependencies": [
          "**/*.test.ts", 
          "**/*.test.tsx", 
          "scripts/**", 
          "**/dev.ts", 
          "**/drizzle.config.ts",
          "**/next.config.mjs",
          "**/*.config.*"
        ] 
      }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];
