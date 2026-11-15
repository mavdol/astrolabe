import stylistic from "@stylistic/eslint-plugin";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const DECLARATIONS = ["const", "let", "var"];
const LOOPS = ["for", "while", "do"];
const BLOCKS = ["if", "switch", "try", ...LOOPS];

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    files: ["**/*.ts", "**/*.mjs", "**/*.js"],
    languageOptions: { parser: tseslint.parser, ecmaVersion: "latest", sourceType: "module" },
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: DECLARATIONS, next: "*" },
        { blankLine: "any", prev: DECLARATIONS, next: DECLARATIONS },
        { blankLine: "always", prev: "*", next: "return" },
        { blankLine: "always", prev: "*", next: BLOCKS },
        { blankLine: "always", prev: BLOCKS, next: "*" },
        { blankLine: "always", prev: "*", next: ["function", "class", "export"] },
        { blankLine: "any", prev: "export", next: "export" },
        { blankLine: "always", prev: "import", next: "*" },
        { blankLine: "any", prev: "import", next: "import" },
        { blankLine: "always", prev: "directive", next: "*" },
      ],
      "@stylistic/lines-between-class-members": ["error", "always", { exceptAfterSingleLine: true }],
      "@stylistic/no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0, maxBOF: 0 }],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "multi-line"],
    },
  },
  prettier,
];
