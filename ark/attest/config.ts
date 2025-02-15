import { ensureDir, fromCwd } from "@ark/fs"
import {
	isArray,
	liftArray,
	tryParseNumber,
	type autocomplete
} from "@ark/util"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import type * as prettier from "prettier"
import type ts from "typescript"
import {
	findAttestTypeScriptVersions,
	type TsVersionData
} from "./tsVersioning.ts"

export type TsVersionAliases = autocomplete<"*"> | string[]

export type BenchErrorConfig = "runtime" | "types" | boolean

type BaseAttestConfig = {
	tsconfig: string | null | undefined
	compilerOptions: ts.CompilerOptions
	updateSnapshots: boolean
	/** A string or list of strings representing the TypeScript version aliases to run.
	 *
	 * Aliases must be specified as a package.json dependency or devDependency beginning with "typescript".
	 * Alternate aliases can be specified using the "npm:" prefix:
	 * ```json
	 * 		"typescript": "latest",
	 * 		"typescript-next: "npm:typescript@next",
	 * 		"typescript-1": "npm:typescript@5.2"
	 * 		"typescript-2": "npm:typescript@5.1"
	 * ```
	 *
	 * "*" can be pased to run all discovered versions beginning with "typescript".
	 */
	tsVersions: TsVersionAliases | TsVersionData[]
	skipTypes: boolean
	skipInlineInstantiations: boolean
	attestAliases: string[]
	benchPercentThreshold: number
	benchErrorOnThresholdExceeded: BenchErrorConfig
	filter: string | undefined
	testDeclarationAliases: string[]
	formatCmd: string
	shouldFormat: boolean
	/**
	 *  Provided options will override the following defaults.
	 *  Any options not listed will fallback to Prettier's default value.
	 *
	 * {
	 *	 semi: false,
	 *	 printWidth: 60,
	 *	 trailingComma: "none",
	 * }
	 */
	typeToStringFormat: prettier.Options
}

export type AttestConfig = Partial<BaseAttestConfig>

export const getDefaultAttestConfig = (): BaseAttestConfig => ({
	tsconfig:
		existsSync(fromCwd("tsconfig.json")) ? fromCwd("tsconfig.json") : undefined,
	compilerOptions: {},
	attestAliases: ["attest", "attestInternal"],
	updateSnapshots: false,
	skipTypes: false,
	skipInlineInstantiations: false,
	tsVersions: "default",
	benchPercentThreshold: 20,
	benchErrorOnThresholdExceeded: true,
	filter: undefined,
	testDeclarationAliases: ["bench", "it", "test"],
	formatCmd: `npm exec --no -- prettier --write`,
	shouldFormat: true,
	typeToStringFormat: {}
})

const flagAliases: { [k in keyof AttestConfig]?: string[] } = {
	updateSnapshots: ["u", "update"]
}

const findParamIndex = (flagOrAlias: string) =>
	process.argv.findIndex(
		arg => arg === `-${flagOrAlias}` || arg === `--${flagOrAlias}`
	)

const hasFlag = (flag: keyof AttestConfig) =>
	findParamIndex(flag) !== -1 ||
	flagAliases[flag]?.some(alias => findParamIndex(alias) !== -1)

const getParamValue = (param: keyof AttestConfig) => {
	let paramIndex = findParamIndex(param)
	if (paramIndex === -1) {
		if (!flagAliases[param]) return

		for (let i = 0; i < flagAliases[param].length && paramIndex === -1; i++)
			paramIndex = findParamIndex(flagAliases[param][i])

		if (paramIndex === -1) return
	}

	const raw = process.argv[paramIndex + 1]
	if (raw === "true") return true

	if (raw === "false") return false

	if (raw === "null") return null

	if (param === "benchPercentThreshold")
		return tryParseNumber(raw, { errorOnFail: true })

	if (param === "tsVersions" || param === "attestAliases") return raw.split(",")

	if (param === "typeToStringFormat" || param === "compilerOptions")
		return JSON.parse(raw)

	return raw
}

export const attestEnvPrefix = "ATTEST_"

const addEnvConfig = (config: BaseAttestConfig) => {
	Object.entries(process.env as Record<string, string>).forEach(([k, v]) => {
		if (k.startsWith(attestEnvPrefix)) {
			const optionName = k.slice(attestEnvPrefix.length)
			if (optionName === "CONFIG") Object.assign(config, JSON.parse(v))
			else (config as any)[optionName] = JSON.parse(v)
		}
	})
	let k: keyof BaseAttestConfig
	for (k in config) {
		if (config[k] === false) config[k] = hasFlag(k) as never
		else {
			const value = getParamValue(k)
			if (value !== undefined) config[k] = value as never
		}
	}
	return config
}

export interface ParsedAttestConfig extends Readonly<BaseAttestConfig> {
	cacheDir: string
	assertionCacheDir: string
	defaultAssertionCachePath: string
	tsVersions: TsVersionData[]
}

const parseConfig = (): ParsedAttestConfig => {
	const baseConfig = addEnvConfig(getDefaultAttestConfig())
	const cacheDir = resolve(".attest")
	const assertionCacheDir = join(cacheDir, "assertions")
	const defaultAssertionCachePath = join(assertionCacheDir, "typescript.json")

	return Object.assign(baseConfig, {
		cacheDir,
		assertionCacheDir,
		defaultAssertionCachePath,
		tsVersions:
			baseConfig.skipTypes ? []
			: isTsVersionAliases(baseConfig.tsVersions) ?
				parseTsVersions(baseConfig.tsVersions)
			:	baseConfig.tsVersions
	})
}

const isTsVersionAliases = (
	v: AttestConfig["tsVersions"]
): v is TsVersionAliases =>
	typeof v === "string" || (isArray(v) && typeof v[0] === "string")

const parseTsVersions = (aliases: TsVersionAliases): TsVersionData[] => {
	const versions = findAttestTypeScriptVersions()
	if (aliases === "*" || (isArray(aliases) && aliases[0] === "*"))
		return versions

	return liftArray(aliases).map(alias => {
		const matching = versions.find(v => v.alias === alias)
		if (!matching) {
			throw new Error(
				`Specified TypeScript version ${alias} does not exist.` +
					` It should probably be specified in package.json like:
"@ark/attest-ts-${alias}": "npm:typescript@latest"`
			)
		}
		return matching
	})
}

let cachedConfig: ParsedAttestConfig | undefined

export const getConfig = (): ParsedAttestConfig => parseConfig()

export const ensureCacheDirs = (): void => {
	cachedConfig ??= getConfig()
	ensureDir(cachedConfig.cacheDir)
	ensureDir(cachedConfig.assertionCacheDir)
}
