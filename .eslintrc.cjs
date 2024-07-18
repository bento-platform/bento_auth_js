module.exports = {
    extends: [
        "eslint:recommended",
        "plugin:react/recommended",
        "plugin:react-hooks/recommended",
        "plugin:@typescript-eslint/recommended",
    ],
    parser: "@typescript-eslint/parser",
    plugins: [
        "react",
        "@typescript-eslint"
    ],
    root: true,
    rules: {
        "semi": [2, "always"],
        "max-len": ["error", { code: 120 }],
    },
    settings: {
        "react": {
            "version": ">=16.0.0"
        }
    }
};
