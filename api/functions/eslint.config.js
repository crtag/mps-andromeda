const { defineConfig } = require("eslint/config");
const globals = require("globals");
const js = require("@eslint/js");
const stylistic = require("@stylistic/eslint-plugin");

module.exports = defineConfig([
    {
    // Apply to all JavaScript files
        files: ["**/*.js"],
        plugins: {
            "@stylistic": stylistic,
        },
        languageOptions: {
            globals: {
                ...globals.node,
            },
            ecmaVersion: 2020,
            sourceType: "module",
        },
        rules: {
            ...js.configs.recommended.rules, // Include eslint:recommended rules
            "@stylistic/quotes": ["warn", "double", { allowTemplateLiterals: "always" }],
            "@stylistic/indent": ["warn", 4],
            "@stylistic/max-len": ["error", { code: 120 }],
            "no-restricted-globals": ["error", "name", "length"],
            "prefer-arrow-callback": "error",
        },
    },
    {
    // Apply to test files
        files: ["**/*.spec.*", "**/*.test.*"],
        languageOptions: {
            globals: {
                ...globals.jest,
            },
        },
    },
]);