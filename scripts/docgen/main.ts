import { existsSync, readdirSync, statSync } from "node:fs"
import { basename, join } from "node:path"
import { stdout } from "node:process"
import { Project } from "ts-morph"
import { extractApi } from "./api/extractApi.js"
import { writeApi } from "./api/writeApi.js"
import { mapDir } from "./mapDir.js"
import type {
    SnippetsByPath,
    SnippetTransformToggles
} from "./snippets/extractSnippets.js"
import { extractSnippets } from "./snippets/extractSnippets.js"
import { updateSnippetReferences } from "./snippets/writeSnippets.js"
import { fromHere, shell } from "@arktype/node"

export type DocGenConfig = {
    apis: DocGenApiConfig[]
    snippets: DocGenSnippetsConfig
    mappedDirs: DocGenMappedDirsConfig[]
}

export type DocGenApiConfig = {
    packageRoot: string
    outDir: string
}

export type DocGenSnippetsConfig = {
    universalTransforms: SnippetTransformToggles
}

export type DocGenMappedDirsConfig = {
    sources: string[]
    targets: string[]
    transformOutputPaths?: (path: string) => string
    transformContents?: (content: string) => string
}

const createConfig = <Config extends DocGenConfig>(config: Config) => config

const repoRoot = fromHere("..", "..")
const packagesDir = join(repoRoot, "@arktype")
const packageRoots = {
    arktype: join(packagesDir, "io"),
    assert: join(packagesDir, "assert"),
    tools: join(packagesDir, "tools"),
    node: join(packagesDir, "node")
}

const arktypeIoDocsDir = join(repoRoot, "arktype.io", "docs")

const dirs = {
    repoRoot,
    packagesDir,
    packageRoots,
    arktypeIoDocsDir
}

export const config = createConfig({
    dirs,
    apis: [
        {
            packageRoot: dirs.packageRoots.arktype,
            outDir: join(arktypeIoDocsDir, "api")
        }
    ],
    snippets: {
        universalTransforms: {
            imports: true
        }
    },
    mappedDirs: [
        {
            sources: [
                join(dirs.packageRoots.arktype, "src", "__snippets__"),
                join(arktypeIoDocsDir, "demos", "layout")
            ],
            targets: [join(arktypeIoDocsDir, "demos", "generated")],
            transformOutputPaths: (path) => {
                let outputFileName = basename(path)
                if (!outputFileName.endsWith(".ts")) {
                    outputFileName = outputFileName + ".ts"
                }
                return outputFileName
            },
            transformContents: (content) => {
                let transformed = content
                transformed = transformed.replaceAll(".js", "")
                return `export default \`${transformed.replaceAll(
                    /`|\${/g,
                    "\\$&"
                )}\``
            }
        },
        {
            sources: [join(repoRoot, ".vscode")],
            targets: Object.values(dirs.packageRoots).map((packageRoot) =>
                join(packageRoot, ".vscode")
            ),
            transformContents: (content) => {
                const transformedConfig = {
                    "THIS FILE IS AUTOGENERATED":
                        "Update '.vscode' in the repo root then run 'pnpm docgen'",
                    ...JSON.parse(content),
                    // Relative to package, TS lib will be in node_modules up two directories
                    "typescript.tsdk": "../../node_modules/typescript/lib"
                }
                return JSON.stringify(transformedConfig)
            }
        }
    ]
})

export const docgen = () => {
    console.group(`Generating docs...✍️`)
    const project = getProject()
    updateApiDocs(project)
    const snippets = getSnippetsAndUpdateReferences(project)
    mapDirs(snippets)
    console.log(`Enjoy your new docs! 📚`)
    console.groupEnd()
}

const getProject = () => {
    stdout.write("Extracting metadata...")
    const project = new Project({
        tsConfigFilePath: join(
            config.dirs.repoRoot,
            "tsconfig.references.json"
        ),
        skipAddingFilesFromTsConfig: true
    })
    stdout.write("✅\n")
    return project
}

const updateApiDocs = (project: Project) => {
    stdout.write("Updating api docs...")
    for (const api of config.apis) {
        const data = extractApi(project, api.packageRoot)
        writeApi(api, data)
    }
    stdout.write("✅\n")
}

const getSnippetsAndUpdateReferences = (project: Project) => {
    stdout.write("Updating snippets...")
    const sourceControlPaths = shell("git ls-files", { stdio: "pipe" })
        .toString()
        .split("\n")
        .filter(
            (path) =>
                existsSync(path) &&
                statSync(path).isFile() &&
                !path.startsWith(join("scripts", "docgen"))
        )
    const snippets = extractSnippets(sourceControlPaths, project)
    updateSnippetReferences(snippets)
    stdout.write("✅\n")
    return snippets
}

export const mapDirs = (snippets: SnippetsByPath) => {
    stdout.write("Mapping dirs...")
    for (const mapConfig of config.mappedDirs) {
        mapDir(snippets, mapConfig)
    }
    stdout.write("✅\n")
}
