import type { Config } from "@jest/types"

export const getJestConfig = (): Config.InitialOptions => ({
    preset: "ts-jest/presets/default-esm",
    clearMocks: true,
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "mjs", "json"],
    testRegex: "/__tests__/.*\\.test\\.(j|t)sx?$",
    roots: ["<rootDir>/src"],
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1"
    },
    globals: {
        "ts-jest": {
            useESM: true
        }
    }
})
