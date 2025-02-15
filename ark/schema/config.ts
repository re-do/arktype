import type { ArkRegistry, requireKeys, show } from "@ark/util"
import type { intrinsic } from "./intrinsic.ts"
import type { nodesByRegisteredId } from "./parse.ts"
import type {
	ActualConfig,
	ArkErrorCode,
	ArkErrors,
	ExpectedConfig,
	MessageConfig,
	ProblemConfig
} from "./shared/errors.ts"
import {
	isNodeKind,
	type DescriptionWriter,
	type NodeKind
} from "./shared/implement.ts"
import { $ark } from "./shared/registry.ts"
import type { UndeclaredKeyBehavior } from "./structure/structure.ts"

export interface ArkSchemaRegistry extends ArkRegistry {
	intrinsic: typeof intrinsic
	config: ArkSchemaConfig
	defaultConfig: ResolvedConfig
	resolvedConfig: ResolvedConfig
	nodesByRegisteredId: typeof nodesByRegisteredId
}

type nodeConfigForKind<kind extends NodeKind> = Readonly<
	show<
		{
			description?: DescriptionWriter<kind>
		} & (kind extends ArkErrorCode ?
			{
				expected?: ExpectedConfig<kind>
				actual?: ActualConfig<kind>
				problem?: ProblemConfig<kind>
				message?: MessageConfig<kind>
			}
		:	{})
	>
>

type NodeConfigsByKind = {
	[kind in NodeKind]: nodeConfigForKind<kind>
}

export type NodeConfig<kind extends NodeKind = NodeKind> =
	NodeConfigsByKind[kind]

export interface UnknownErrorConfigs {
	expected?: ExpectedConfig
	actual?: ActualConfig
	problem?: ProblemConfig
	message?: MessageConfig
}

interface UnknownNodeConfig extends UnknownErrorConfigs {
	description?: DescriptionWriter
}

export type ResolvedUnknownNodeConfig = requireKeys<
	UnknownNodeConfig,
	"description"
>

// $ark.config could already be set if it were imported previously from the
// dedicated config entrypoint, in which case we don't want to reinitialize it
$ark.config ??= {}

export const configureSchema = (config: ArkSchemaConfig): ArkSchemaConfig => {
	const result = Object.assign($ark.config, mergeConfigs($ark.config, config))

	$ark.resolvedConfig &&= mergeConfigs($ark.resolvedConfig, result)

	return result
}

export const mergeConfigs = <base extends ArkSchemaConfig>(
	base: base,
	extensions: ArkSchemaConfig | undefined
): base => {
	if (!extensions) return base
	const result: any = { ...base }
	let k: keyof ArkSchemaConfig
	for (k in extensions) {
		result[k] =
			isNodeKind(k) ?
				{
					...base[k],
					...extensions[k]
				}
			:	extensions[k]
	}
	return result
}

export type CloneImplementation = <original extends object>(
	original: original
) => original

export interface ArkSchemaConfig extends Partial<Readonly<NodeConfigsByKind>> {
	readonly jitless?: boolean
	readonly clone?: boolean | CloneImplementation
	readonly onUndeclaredKey?: UndeclaredKeyBehavior
	readonly numberAllowsNaN?: boolean
	readonly dateAllowsInvalid?: boolean
	readonly onFail?: ArkErrors.Handler | null
}

export type resolveConfig<config extends ArkSchemaConfig> = show<
	{
		[k in keyof ArkSchemaConfig]-?: k extends NodeKind ? Required<config[k]>
		: k extends "clone" ? CloneImplementation | false
		: config[k]
	} & Omit<config, keyof ArkSchemaConfig>
>

export type ResolvedConfig = resolveConfig<ArkSchemaConfig>
