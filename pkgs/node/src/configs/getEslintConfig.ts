import deepmerge from "deepmerge"

export const getEslintConfig = (options: object = {}) =>
    deepmerge(
        {
            root: true,
            parser: "@typescript-eslint/parser",
            plugins: ["@typescript-eslint", "prefer-arrow"],
            extends: [
                "eslint:recommended",
                "plugin:@typescript-eslint/recommended",
                "plugin:@typescript-eslint/recommended-requiring-type-checking",
                "prettier"
            ],
            ignorePatterns: [
                "jest.config.js",
                "findUnused.cjs",
                ".eslintrc.cjs",
                "out",
                "coverage"
            ],
            rules: {
                "prefer-arrow/prefer-arrow-functions": [
                    "error",
                    {
                        disallowPrototype: true,
                        singleReturnOnly: false,
                        classPropertiesAllowed: false
                    }
                ],
                "prefer-arrow-callback": [
                    "error",
                    { allowNamedFunctions: true }
                ],
                "func-style": ["error", "expression"],
                "@typescript-eslint/ban-ts-comment": "off",
                "@typescript-eslint/ban-types": "off",
                "@typescript-eslint/no-explicit-any": "off",
                "@typescript-eslint/no-namespace": "off",
                "@typescript-eslint/no-unsafe-assignment": "off",
                "@typescript-eslint/no-unsafe-return": "off",
                "@typescript-eslint/no-unsafe-call": "off",
                "@typescript-eslint/no-unsafe-member-access": "off",
                "@typescript-eslint/no-unsafe-argument": "off",
                "@typescript-eslint/no-non-null-assertion": "off",
                "@typescript-eslint/restrict-template-expressions": "off"
            }
        },
        options
    )
