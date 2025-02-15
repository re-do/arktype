import {
	entriesOf,
	flatMorph,
	hasDomain,
	isArray,
	isEmptyObject,
	printable,
	throwInternalError,
	throwParseError,
	unset,
	type Brand,
	type dict,
	type Json,
	type listable,
	type PartialRecord
} from "@ark/util"
import {
	nodeClassesByKind,
	nodeImplementationsByKind,
	type NormalizedSchema
} from "./kinds.ts"
import type { BaseNode } from "./node.ts"
import type { BaseRoot } from "./roots/root.ts"
import type { BaseScope } from "./scope.ts"
import type { BaseMeta, MetaSchema } from "./shared/declare.ts"
import { Disjoint } from "./shared/disjoint.ts"
import {
	constraintKeys,
	defaultValueSerializer,
	isNodeKind,
	precedenceOfKind,
	type NodeKind,
	type RootKind,
	type UnknownAttachments
} from "./shared/implement.ts"
import { $ark } from "./shared/registry.ts"
import { hasArkKind, isNode, type arkKind } from "./shared/utils.ts"

export type ContextualArgs = Record<string, BaseRoot | NodeId>

export type BaseParseOptions<prereduced extends boolean = boolean> = {
	alias?: string
	prereduced?: prereduced
	args?: ContextualArgs
	id?: NodeId
}

export interface BaseParseContextInput extends BaseParseOptions {
	prefix: string
	def: unknown
}

export interface AttachedParseContext {
	[arkKind]: "context"
	$: BaseScope
	id: NodeId
	phase: "unresolved" | "resolving" | "resolved"
}

export interface BaseParseContext
	extends BaseParseContextInput,
		AttachedParseContext {
	id: NodeId
}

export interface NodeParseContextInput<kind extends NodeKind = NodeKind>
	extends BaseParseContextInput {
	kind: kind
	def: NormalizedSchema<kind>
}

export interface NodeParseContext<kind extends NodeKind = NodeKind>
	extends NodeParseContextInput<kind>,
		AttachedParseContext {
	id: NodeId
}

export const schemaKindOf = <kind extends RootKind = RootKind>(
	schema: unknown,
	allowedKinds?: readonly kind[]
): kind => {
	const kind = discriminateRootKind(schema)
	if (allowedKinds && !allowedKinds.includes(kind as never)) {
		return throwParseError(
			`Root of kind ${kind} should be one of ${allowedKinds}`
		)
	}
	return kind as never
}

const discriminateRootKind = (schema: unknown): RootKind => {
	if (hasArkKind(schema, "root")) return schema.kind
	if (typeof schema === "string") return schema[0] === "$" ? "alias" : "domain"
	if (typeof schema === "function") return "proto"

	// throw at end of function
	if (typeof schema !== "object" || schema === null)
		return throwParseError(writeInvalidSchemaMessage(schema))

	if ("morphs" in schema) return "morph"

	if ("branches" in schema || isArray(schema)) return "union"

	if ("unit" in schema) return "unit"

	if ("reference" in schema) return "alias"

	const schemaKeys = Object.keys(schema)

	if (schemaKeys.length === 0 || schemaKeys.some(k => k in constraintKeys))
		return "intersection"
	if ("proto" in schema) return "proto"
	if ("domain" in schema) return "domain"

	return throwParseError(writeInvalidSchemaMessage(schema))
}

export const writeInvalidSchemaMessage = (schema: unknown): string =>
	`${printable(schema)} is not a valid type schema`

const nodeCountsByPrefix: PartialRecord<string, number> = {}

const serializeListableChild = (listableNode: listable<BaseNode>) =>
	isArray(listableNode) ?
		listableNode.map(node => node.collapsibleJson)
	:	listableNode.collapsibleJson

export type NodeId = Brand<string, "NodeId">

export type NodeResolver = (id: NodeId) => BaseNode

export const nodesByRegisteredId: Record<
	NodeId,
	BaseNode | BaseParseContext | undefined
> = {}

$ark.nodesByRegisteredId = nodesByRegisteredId

export const registerNodeId = (prefix: string): NodeId => {
	nodeCountsByPrefix[prefix] ??= 0
	return `${prefix}${++nodeCountsByPrefix[prefix]!}` as NodeId
}

export const parseNode = (ctx: NodeParseContext): BaseNode => {
	const impl = nodeImplementationsByKind[ctx.kind]
	const configuredSchema =
		impl.applyConfig?.(ctx.def, ctx.$.resolvedConfig) ?? ctx.def
	const inner: dict = {}
	const { meta: metaSchema, ...innerSchema } = configuredSchema as dict & {
		meta?: MetaSchema
	}

	const meta: BaseMeta & dict =
		metaSchema === undefined ? {}
		: typeof metaSchema === "string" ? { description: metaSchema }
		: (metaSchema as never)

	// ensure node entries are parsed in order of precedence, with non-children
	// parsed first
	const innerSchemaEntries = entriesOf(innerSchema)
		.sort(([lKey], [rKey]) =>
			isNodeKind(lKey) ?
				isNodeKind(rKey) ? precedenceOfKind(lKey) - precedenceOfKind(rKey)
				:	1
			: isNodeKind(rKey) ? -1
			: lKey < rKey ? -1
			: 1
		)
		.filter(([k, v]) => {
			// move meta. prefixed props to meta, overwriting existing nested
			// props of the same name if they exist
			if (k.startsWith("meta.")) {
				const metaKey = k.slice(5)
				meta[metaKey] = v
				return false
			}
			return true
		})

	for (const entry of innerSchemaEntries) {
		const k = entry[0]
		const keyImpl = impl.keys[k]
		if (!keyImpl)
			return throwParseError(`Key ${k} is not valid on ${ctx.kind} schema`)

		const v = keyImpl.parse ? keyImpl.parse(entry[1], ctx) : entry[1]
		if (v !== unset && (v !== undefined || keyImpl.preserveUndefined))
			inner[k] = v
	}

	if (impl.reduce && !ctx.prereduced) {
		const reduced = impl.reduce(inner, ctx.$)
		if (reduced) {
			if (reduced instanceof Disjoint) return reduced.throw()

			// we can't cache this reduction for now in case the reduction involved
			// impliedSiblings
			return withMeta(reduced, meta)
		}
	}

	const node = createNode({
		id: ctx.id,
		kind: ctx.kind,
		inner,
		meta,
		$: ctx.$
	})

	return node
}

export type CreateNodeInput = {
	id: NodeId
	kind: NodeKind
	inner: dict
	meta: BaseMeta
	$: BaseScope
	ignoreCache?: true
}

export const createNode = ({
	id,
	kind,
	inner,
	meta,
	$,
	ignoreCache
}: CreateNodeInput): BaseNode => {
	const impl = nodeImplementationsByKind[kind]
	const innerEntries = entriesOf(inner)
	const children: BaseNode[] = []
	let innerJson: dict = {}

	innerEntries.forEach(([k, v]) => {
		const keyImpl = impl.keys[k]
		const serialize =
			keyImpl.serialize ??
			(keyImpl.child ? serializeListableChild : defaultValueSerializer)

		innerJson[k] = serialize(v as never)

		if (keyImpl.child === true) {
			const listableNode = v as listable<BaseNode>
			if (isArray(listableNode)) children.push(...listableNode)
			else children.push(listableNode)
		} else if (typeof keyImpl.child === "function")
			children.push(...keyImpl.child(v as never))
	})

	if (impl.finalizeInnerJson)
		innerJson = impl.finalizeInnerJson(innerJson) as never

	let json = { ...innerJson }
	let metaJson: BaseMeta & dict = {}

	if (!isEmptyObject(meta)) {
		metaJson = flatMorph(meta, (k, v) => [
			k,
			k === "examples" ? v : defaultValueSerializer(v)
		]) as never
		json.meta = possiblyCollapse(metaJson, "description", true)
	}

	innerJson = possiblyCollapse(innerJson, impl.collapsibleKey, false)
	const innerHash = JSON.stringify({ kind, ...innerJson })

	json = possiblyCollapse(json, impl.collapsibleKey, false)
	const collapsibleJson = possiblyCollapse(json, impl.collapsibleKey, true)
	const hash = JSON.stringify({ kind, ...json })

	// we have to wait until after reduction to return a cached entry,
	// since reduction can add impliedSiblings
	if ($.nodesByHash[hash] && !ignoreCache) return $.nodesByHash[hash]

	const attachments: UnknownAttachments & dict = {
		id,
		kind,
		impl,
		inner,
		innerEntries,
		innerJson,
		innerHash,
		meta,
		metaJson,
		json,
		hash,
		collapsibleJson: collapsibleJson as Json,
		children
	}

	if (kind !== "intersection") {
		for (const k in inner)
			if (k !== "in" && k !== "out") attachments[k] = inner[k]
	}

	const node: BaseNode = new nodeClassesByKind[kind](attachments as never, $)

	return ($.nodesByHash[hash] = node)
}

export const withId = <node extends BaseNode>(node: node, id: NodeId): node => {
	if (node.id === id) return node
	if (isNode(nodesByRegisteredId[id]))
		throwInternalError(`Unexpected attempt to overwrite node id ${id}`)
	// have to ignore cache to force creation of new potentially cyclic id
	return createNode({
		id,
		kind: node.kind,
		inner: node.inner,
		meta: node.meta,
		$: node.$,
		ignoreCache: true
	}) as never
}

export const withMeta = <node extends BaseNode>(
	node: node,
	meta: ArkEnv.meta,
	id?: NodeId
): node => {
	if (id && isNode(nodesByRegisteredId[id]))
		throwInternalError(`Unexpected attempt to overwrite node id ${id}`)
	return createNode({
		id: id ?? registerNodeId(meta.alias ?? node.kind),
		kind: node.kind,
		inner: node.inner,
		meta,
		$: node.$
	}) as never
}

const possiblyCollapse = <allowPrimitive extends boolean>(
	json: dict,
	toKey: string | undefined,
	allowPrimitive: allowPrimitive
): [allowPrimitive] extends [false] ? dict : unknown => {
	const collapsibleKeys = Object.keys(json)
	if (collapsibleKeys.length === 1 && collapsibleKeys[0] === toKey) {
		const collapsed = json[toKey]

		if (allowPrimitive) return collapsed as never

		if (
			// if the collapsed value is still an object
			hasDomain(collapsed, "object") &&
			// and the JSON did not include any implied keys
			(Object.keys(collapsed).length === 1 || Array.isArray(collapsed))
		) {
			// we can replace it with its collapsed value
			return collapsed as never
		}
	}
	return json as never
}
