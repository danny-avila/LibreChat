module.exports = {
    "env": {
        "browser": true,
        "es2021": true,
        "node": true,
        "commonjs": true,
        "es6": true,
    },
    "extends": [
        "eslint:recommended",
        "plugin:react/recommended",
        "plugin:react-hooks/recommended"
    ],
    "overrides": [
    ],
    "parserOptions": {
        "ecmaFeatures": {
            "jsx": true
        },
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "plugins": [
        "react"
    ],
    "rules": {
        'react/prop-types': ['off'],
    }
}
