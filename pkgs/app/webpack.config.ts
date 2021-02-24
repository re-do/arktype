import { resolve } from "path"
import { makeConfig } from "@re-do/bundle"
import { isDev } from "@re-do/utils/dist/node"

const tsconfig = resolve(__dirname, "tsconfig.json")

const mainConfig = makeConfig({
    base: "main",
    entry: resolve(__dirname, "src", "main", "index.ts"),
    tsconfig
})

const rendererConfig = makeConfig(
    {
        base: "renderer",
        entry: resolve(__dirname, "src", "renderer", "index.tsx"),
        tsconfig
    },
    [{ output: { publicPath: "." } }]
)

const observerConfig = makeConfig({
    base: "injected",
    entry: resolve(__dirname, "src", "observer", "index.ts"),
    tsconfig
})

// renderer config is consumed through devServer during development
export default isDev()
    ? [mainConfig, observerConfig]
    : [mainConfig, rendererConfig, observerConfig]
