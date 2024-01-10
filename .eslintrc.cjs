module.exports = {
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended'
    ],
    parser: '@typescript-eslint/parser',
    plugins: [
        'react',
        '@typescript-eslint'
    ],
    root: true,
    rules: {
        "semi": [2, "always"]
    },
    settings: {
        'react': {
            'version': '>=16.0.0'
        }
    }
}
