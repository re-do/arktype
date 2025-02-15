import {
	flatMorph,
	printable,
	throwParseError,
	type Entry,
	type Json,
	type JsonStructure,
	type KeySet,
	type arrayIndexOf,
	type entryOf,
	type keySetOf,
	type listable,
	type requireKeys,
	type show
} from "@ark/util"
import type { NodeConfig, ResolvedUnknownNodeConfig } from "../config.ts"
import type { Declaration, Inner, errorContext, nodeOfKind } from "../kinds.ts"
import type { BaseNode } from "../node.ts"
import type { NodeId, NodeParseContext } from "../parse.ts"
import type {
	BaseRoot,
	schemaKindOrRightOf,
	schemaKindRightOf
} from "../roots/root.ts"
import type { BaseScope, ResolvedScopeConfig } from "../scope.ts"
import type { Structure } from "../structure/structure.ts"
import { compileSerializedValue } from "./compile.ts"
import type {
	BaseErrorContext,
	BaseMeta,
	BaseNodeDeclaration,
	BaseNormalizedSchema
} from "./declare.ts"
import type { Disjoint } from "./disjoint.ts"
import { isNode, type makeRootAndArrayPropertiesMutable } from "./utils.ts"

export const basisKinds = ["unit", "proto", "domain"] as const

export type BasisKind = (typeof basisKinds)[number]

export const structuralKinds = [
	"required",
	"optional",
	"index",
	"sequence"
] as const

export type StructuralKind = (typeof structuralKinds)[number]

export type RangeKind = Exclude<BoundKind, "exactLength">

export type BoundKind = Exclude<RefinementKind, "pattern" | "divisor">

export const refinementKinds = [
	"pattern",
	"divisor",
	"exactLength",
	"max",
	"min",
	"maxLength",
	"minLength",
	"before",
	"after"
] as const

export type RefinementKind = (typeof refinementKinds)[number]

type orderedConstraintKinds = [
	...typeof refinementKinds,
	...typeof structuralKinds,
	"structure",
	"predicate"
]

export const constraintKinds: orderedConstraintKinds = [
	...refinementKinds,
	...structuralKinds,
	"structure",
	"predicate"
]

export type ConstraintKind = (typeof constraintKinds)[number]

export const rootKinds = [
	"alias",
	"union",
	"morph",
	"unit",
	"intersection",
	"proto",
	"domain"
] as const

export type RootKind = (typeof rootKinds)[number]

export type NodeKind = RootKind | ConstraintKind

type orderedNodeKinds = [...typeof rootKinds, ...typeof constraintKinds]

export const nodeKinds: orderedNodeKinds = [...rootKinds, ...constraintKinds]

export type OpenNodeKind = {
	[k in NodeKind]: Declaration<k>["intersectionIsOpen"] extends true ? k : never
}[NodeKind]

export type ClosedNodeKind = Exclude<NodeKind, OpenNodeKind>

export type PrimitiveKind = RefinementKind | BasisKind | "predicate"

export type CompositeKind = Exclude<NodeKind, PrimitiveKind>

export type OrderedNodeKinds = typeof nodeKinds

export const constraintKeys: KeySet<ConstraintKind> = flatMorph(
	constraintKinds,
	(i, kind) => [kind, 1] as const
)

export const structureKeys: keySetOf<Structure.Inner> = flatMorph(
	[...structuralKinds, "undeclared"],
	(i, k) => [k, 1] as const
)

type RightsByKind = accumulateRightKinds<OrderedNodeKinds, {}>

export type kindOrRightOf<kind extends NodeKind> = kind | kindRightOf<kind>

export type kindLeftOf<kind extends NodeKind> = Exclude<
	NodeKind,
	kindOrRightOf<kind>
>

export type kindOrLeftOf<kind extends NodeKind> = kind | kindLeftOf<kind>

type accumulateRightKinds<remaining extends readonly NodeKind[], result> =
	remaining extends (
		readonly [infer head extends NodeKind, ...infer tail extends NodeKind[]]
	) ?
		accumulateRightKinds<tail, result & { [k in head]: tail[number] }>
	:	result

export interface InternalIntersectionOptions {
	pipe: boolean
}

export interface IntersectionContext extends InternalIntersectionOptions {
	$: BaseScope
	invert: boolean
}

export type ConstraintIntersection<
	lKind extends ConstraintKind,
	rKind extends kindOrRightOf<lKind>
> = (
	l: nodeOfKind<lKind>,
	r: nodeOfKind<rKind>,
	ctx: IntersectionContext
) => BaseNode | Disjoint | null

export type ConstraintIntersectionMap<kind extends ConstraintKind> = show<
	{
		[_ in kind]: ConstraintIntersection<kind, kind>
	} & {
		[rKind in kindRightOf<kind>]?: ConstraintIntersection<kind, rKind>
	}
>

export type RootIntersection<
	lKind extends RootKind,
	rKind extends schemaKindOrRightOf<lKind>
> = (
	l: nodeOfKind<lKind>,
	r: nodeOfKind<rKind>,
	ctx: IntersectionContext
) => BaseRoot | Disjoint

export type TypeIntersectionMap<kind extends RootKind> = {
	[rKind in schemaKindOrRightOf<kind>]: RootIntersection<kind, rKind>
}

export type IntersectionMap<kind extends NodeKind> =
	kind extends RootKind ? TypeIntersectionMap<kind>
	:	ConstraintIntersectionMap<kind & ConstraintKind>

export type UnknownIntersectionMap = {
	[k in NodeKind]?: (
		l: BaseNode,
		r: BaseNode,
		ctx: IntersectionContext
	) => UnknownIntersectionResult
}

export type UnknownIntersectionResult = BaseNode | Disjoint | null

type PrecedenceByKind = {
	[i in arrayIndexOf<OrderedNodeKinds> as OrderedNodeKinds[i]]: i
}

export const precedenceByKind: PrecedenceByKind = flatMorph(
	nodeKinds,
	(i, kind) => [kind, i] as entryOf<PrecedenceByKind>
)

export const isNodeKind = (value: unknown): value is NodeKind =>
	typeof value === "string" && value in precedenceByKind

export function assertNodeKind<kind extends NodeKind>(
	value: BaseNode,
	kind: kind
): asserts value is nodeOfKind<kind> {
	const valueIsNode = isNode(value)
	if (!valueIsNode || value.kind !== kind) {
		throwParseError(
			`Expected node of kind ${kind} (was ${
				valueIsNode ? `${value.kind} node` : printable(value)
			})`
		)
	}
}

export type precedenceOfKind<kind extends NodeKind> = PrecedenceByKind[kind]

export const precedenceOfKind = <kind extends NodeKind>(
	kind: kind
): precedenceOfKind<kind> => precedenceByKind[kind]

export type kindRightOf<kind extends NodeKind> = RightsByKind[kind]

export const schemaKindsRightOf = <kind extends RootKind>(
	kind: kind
): schemaKindRightOf<kind>[] =>
	rootKinds.slice(precedenceOfKind(kind) + 1) as never

export const unionChildKinds = [
	...schemaKindsRightOf("union"),
	"alias"
] as const

export type UnionChildKind = (typeof unionChildKinds)[number]

export const morphChildKinds = [
	...schemaKindsRightOf("morph"),
	"alias"
] as const

export type MorphChildKind = (typeof morphChildKinds)[number]

export type keySchemaDefinitions<d extends BaseNodeDeclaration> = {
	[k in keyRequiringSchemaDefinition<d>]: NodeKeyImplementation<d, k>
}

type keyRequiringSchemaDefinition<d extends BaseNodeDeclaration> = Exclude<
	keyof d["normalizedSchema"],
	keyof BaseNormalizedSchema
>

export const defaultValueSerializer = (v: unknown): Json => {
	if (typeof v === "string" || typeof v === "boolean" || v === null) return v

	if (typeof v === "number") {
		if (Number.isNaN(v)) return "NaN"
		if (v === Number.POSITIVE_INFINITY) return "Infinity"
		if (v === Number.NEGATIVE_INFINITY) return "-Infinity"
		return v
	}

	return compileSerializedValue(v)
}

export type NodeKeyImplementation<
	d extends BaseNodeDeclaration,
	k extends keyof d["normalizedSchema"],
	instantiated = k extends keyof d["inner"] ? Exclude<d["inner"][k], undefined>
	:	never
> = requireKeys<
	{
		preserveUndefined?: true
		child?: boolean | ((value: instantiated) => BaseNode[])
		serialize?: (schema: instantiated) => Json
		reduceIo?: (
			ioKind: "in" | "out",
			inner: makeRootAndArrayPropertiesMutable<d["inner"]>,
			value: d["inner"][k]
		) => void
		parse?: (
			schema: Exclude<d["normalizedSchema"][k], undefined>,
			ctx: NodeParseContext<d["kind"]>
		) => instantiated | undefined
	},
	// require parse if we can't guarantee the schema value will be valid on inner
	| (d["normalizedSchema"][k] extends instantiated | undefined ? never
	  :	"parse")
	// require keys containing children specify it, although it can be false in cases like
	// declaredOut where we don't want to treat the node as a child
	| ([instantiated] extends [listable<BaseNode>] ? "child" : never)
>

interface CommonNodeImplementationInput<d extends BaseNodeDeclaration> {
	kind: d["kind"]
	keys: keySchemaDefinitions<d>
	normalize: (schema: d["schema"], $: BaseScope) => d["normalizedSchema"]
	applyConfig?: (
		schema: d["normalizedSchema"],
		config: ResolvedScopeConfig
	) => d["normalizedSchema"]
	hasAssociatedError: d["errorContext"] extends null ? false : true
	finalizeInnerJson?: (json: {
		[k in keyof d["inner"]]: Json
	}) => JsonStructure
	collapsibleKey?: keyof d["inner"]
	reduce?: (
		inner: d["inner"],
		$: BaseScope
	) => nodeOfKind<d["reducibleTo"]> | Disjoint | undefined
	obviatesBasisDescription?: d["kind"] extends RefinementKind ? true : never
}

export interface UnknownNodeImplementation
	extends CommonNodeImplementationInput<BaseNodeDeclaration> {
	defaults: ResolvedUnknownNodeConfig
	intersectionIsOpen: boolean
	intersections: UnknownIntersectionMap
	keys: Record<string, NodeKeyImplementation<any, any>>
}

export const compileObjectLiteral = (ctx: object): string => {
	let result = "{ "
	for (const [k, v] of Object.entries(ctx))
		result += `${k}: ${compileSerializedValue(v)}, `
	return result + " }"
}

export type nodeImplementationOf<d extends BaseNodeDeclaration> =
	nodeImplementationInputOf<d> & {
		intersections: IntersectionMap<d["kind"]>
		intersectionIsOpen: d["intersectionIsOpen"]
		defaults: Required<NodeConfig<d["kind"]>>
	}

export type nodeImplementationInputOf<d extends BaseNodeDeclaration> =
	CommonNodeImplementationInput<d> & {
		intersections: IntersectionMap<d["kind"]>
		defaults: nodeSchemaaultsImplementationInputFor<d["kind"]>
	} & (d["intersectionIsOpen"] extends true ? { intersectionIsOpen: true }
		:	{}) &
		// if the node is declared as reducible to a kind other than its own,
		// there must be a reduce implementation
		(d["reducibleTo"] extends d["kind"] ? {} : { reduce: {} })

type nodeSchemaaultsImplementationInputFor<kind extends NodeKind> = requireKeys<
	NodeConfig<kind>,
	| "description"
	// if the node's error context is distinct from its inner definition, ensure it is implemented.
	// this occurs for nodes like `union` where the error that occurs is not 1:1 with the existing node,
	// but rather a single failed condition for each branch.
	| (Inner<kind> extends (
			Omit<errorContext<kind>, keyof BaseErrorContext | "description">
	  ) ?
			never
	  :	"expected" & keyof NodeConfig<kind>)
>

export type DescriptionWriter<kind extends NodeKind = NodeKind> = (
	node: nodeOfKind<kind>
) => string

export interface UnknownAttachments {
	readonly kind: NodeKind
	readonly impl: UnknownNodeImplementation
	readonly id: NodeId

	readonly inner: Record<string, any>
	readonly innerEntries: readonly Entry<string>[]
	readonly innerJson: object
	readonly innerHash: string

	readonly meta: BaseMeta
	readonly metaJson: object

	readonly json: object
	readonly hash: string
	readonly collapsibleJson: Json
	readonly children: BaseNode[]
}

export interface NarrowedAttachments<d extends BaseNodeDeclaration>
	extends UnknownAttachments {
	kind: d["kind"]
	inner: d["inner"]
	json: JsonStructure
	innerJson: JsonStructure
	collapsibleJson: Json
	children: nodeOfKind<d["childKind"]>[]
}

export const implementNode = <d extends BaseNodeDeclaration = never>(
	_: nodeImplementationInputOf<d>
): nodeImplementationOf<d> => {
	const implementation: UnknownNodeImplementation = _ as never
	if (implementation.hasAssociatedError) {
		implementation.defaults.expected ??= ctx =>
			"description" in ctx ?
				(ctx.description as string)
			:	implementation.defaults.description(ctx as never)
		implementation.defaults.actual ??= data => printable(data)
		implementation.defaults.problem ??= ctx =>
			`must be ${ctx.expected}${ctx.actual ? ` (was ${ctx.actual})` : ""}`
		implementation.defaults.message ??= ctx => {
			if (ctx.path.length === 0) return ctx.problem
			const problemWithLocation = `${ctx.propString} ${ctx.problem}`
			if (problemWithLocation[0] === "[") {
				// clarify paths like [1], [0][1], and ["key!"] that could be confusing
				return `value at ${problemWithLocation}`
			}
			return problemWithLocation
		}
	}
	return implementation as never
}
