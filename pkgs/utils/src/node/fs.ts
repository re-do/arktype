import { readdirSync, lstatSync, ensureDirSync, chmodSync } from "fs-extra"
import { homedir } from "os"
import { join } from "path"
import { EXECUTABLE_SUFFIX } from "./os"

export const HOME = homedir()

export const fromDir = (dir: string) => (...pathSegments: string[]) =>
    join(dir, ...pathSegments)

export const fromHome = fromDir(HOME)

export const REDO_DIR = fromHome(".redo")

export const fromRedo = fromDir(REDO_DIR)

export const getRedoDir = () => ensureDirSync(REDO_DIR)

export const REDO_EXECUTABLE = fromRedo(`redo${EXECUTABLE_SUFFIX}`)

export const makeExecutable = (path: string) => chmodSync(path, "755")

export const walk = (dir: string): [string, any][] =>
    readdirSync(dir).map(item => [
        item,
        lstatSync(join(dir, item)).isDirectory() ? walk(join(dir, item)) : null
    ])

export const walkPaths = (dir: string): string[] =>
    readdirSync(dir).reduce((paths, item) => {
        const path = join(dir, item)
        return [
            ...paths,
            ...(lstatSync(path).isDirectory() ? walkPaths(path) : [path])
        ]
    }, [] as string[])
