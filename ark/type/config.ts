import type { arkKind } from "@ark/schema"
import type { Ark } from "./keywords/keywords.ts"
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { configureSchema, type ArkSchemaConfig } from "@ark/schema/config"
import type { anyOrNever } from "@ark/util"

export type TypeMeta = Omit<ArkEnv.meta, "onFail">

export type TypeMetaInput = string | TypeMeta

export type KeywordConfig = {
	[k in keyof Ark.flat as parseConfigurableFlatAlias<
		k,
		Ark.flat[k]
	>]?: TypeMetaInput
}

type parseConfigurableFlatAlias<k extends string, v> =
	[v] extends [anyOrNever] ? k
	: v extends { [arkKind]: "generic" | "module" } ? never
	: k extends `${infer prefix}.root` ? prefix
	: k

export interface ArkConfig extends ArkSchemaConfig {
	keywords?: KeywordConfig
}

export const configure: <config extends ArkConfig>(config: config) => config =
	configureSchema as never

declare global {
	export interface ArkEnv {
		$(): Ark
	}
}

/**
 * This mirrors the global ArkEnv namespace as a local export. We use it instead
 * of the global internally due to a bug in twoslash that prevents `ark/docs`
 * from building if we refer to the global directly.
 *
 * If, in the future, docs can build while arktype refers to `ArkEnv.$` directly,
 * this can be removed.
 */
export declare namespace ArkAmbient {
	export type $ = ReturnType<ArkEnv["$"]>

	export type meta = ArkEnv.meta

	export type prototypes = ArkEnv.prototypes
}
