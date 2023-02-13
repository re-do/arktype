import { shell } from "../runtime/api.ts"
import { repoDirs } from "./common.ts"

export const testBuild = (outDir: string) => {
    shell(`node ./dev/attest/cli.js --skipTypes --cmd mocha`, {
        cwd: outDir
    })
}
testBuild(repoDirs.mjsOut)
testBuild(repoDirs.cjsOut)
