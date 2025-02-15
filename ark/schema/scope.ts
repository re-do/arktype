import {
	ParseError,
	flatMorph,
	hasDomain,
	isArray,
	isThunk,
	printable,
	throwInternalError,
	throwParseError,
	type Dict,
	type Fn,
	type Hkt,
	type JsonStructure,
	type anyOrNever,
	type array,
	type conform,
	type flattenListable,
	type intersectUnion,
	type listable,
	type noSuggest,
	type satisfy,
	type show
} from "@ark/util"
import {
	mergeConfigs,
	type ArkSchemaConfig,
	type ResolvedConfig
} from "./config.ts"
import {
	GenericRoot,
	LazyGenericBody,
	type GenericRootParser
} from "./generic.ts"
import {
	nodeImplementationsByKind,
	type NodeSchema,
	type RootSchema,
	type nodeOfKind,
	type reducibleKindOf
} from "./kinds.ts"
import {
	RootModule,
	bindModule,
	type InternalModule,
	type PreparsedNodeResolution,
	type SchemaModule,
	type instantiateRoot
} from "./module.ts"
import type { BaseNode } from "./node.ts"
import {
	nodesByRegisteredId,
	parseNode,
	registerNodeId,
	schemaKindOf,
	withId,
	type AttachedParseContext,
	type BaseParseContext,
	type BaseParseContextInput,
	type BaseParseOptions,
	type NodeId,
	type NodeParseContext,
	type NodeParseContextInput
} from "./parse.ts"
import { Alias } from "./roots/alias.ts"
import type { BaseRoot } from "./roots/root.ts"
import type { UnionNode } from "./roots/union.ts"
import { CompiledFunction, NodeCompiler } from "./shared/compile.ts"
import type { NodeKind, RootKind } from "./shared/implement.ts"
import { $ark } from "./shared/registry.ts"
import {
	Traversal,
	type TraverseAllows,
	type TraverseApply
} from "./shared/traversal.ts"
import { arkKind, hasArkKind, isNode } from "./shared/utils.ts"

export type InternalResolutions = Record<string, InternalResolution | undefined>

export type exportedNameOf<$> = Exclude<keyof $ & string, PrivateDeclaration>

export type resolvableReferenceIn<$> = {
	[k in keyof $]: k extends string ?
		k extends PrivateDeclaration<infer alias> ? alias
		: // technically, root subtypes are resolvable, but there's never a good
		// reason to use them over the base alias
		k extends noSuggest | "root" ? never
		: k
	:	never
}[keyof $]

export type resolveReference<reference extends resolvableReferenceIn<$>, $> =
	reference extends keyof $ ? $[reference] : $[`#${reference}` & keyof $]

export type flatResolutionsOf<$> = show<
	intersectUnion<
		resolvableReferenceIn<$> extends infer k ?
			k extends keyof $ & string ?
				resolutionsOfReference<k, $[k]>
			:	unknown
		:	unknown
	>
>

type resolutionsOfReference<k extends string, v> =
	[v] extends [{ [arkKind]: "module" }] ?
		[v] extends [anyOrNever] ?
			{ [_ in k]: v }
		:	prefixKeys<flatResolutionsOf<v>, k> & {
				[innerKey in keyof v as innerKey extends "root" ? k
				:	never]: v[innerKey]
			}
	:	{ [_ in k]: v }

type prefixKeys<o, prefix extends string> = {
	[k in keyof o & string as `${prefix}.${k}`]: o[k]
} & unknown

export type PrivateDeclaration<key extends string = string> = `#${key}`

export type InternalResolution = BaseRoot | GenericRoot | InternalModule

export type toInternalScope<$> = BaseScope<{
	[k in keyof $]: $[k] extends { [arkKind]: infer kind } ?
		[$[k]] extends [anyOrNever] ? BaseRoot
		: kind extends "generic" ? GenericRoot
		: kind extends "module" ? InternalModule
		: never
	:	BaseRoot
}>

type CachedResolution = NodeId | BaseRoot | GenericRoot

const schemaBranchesOf = (schema: object) =>
	isArray(schema) ? schema
	: "branches" in schema && isArray(schema.branches) ? schema.branches
	: undefined

const throwMismatchedNodeRootError = (expected: NodeKind, actual: NodeKind) =>
	throwParseError(
		`Node of kind ${actual} is not valid as a ${expected} definition`
	)

export const writeDuplicateAliasError = <alias extends string>(
	alias: alias
): writeDuplicateAliasError<alias> =>
	`#${alias} duplicates public alias ${alias}`

export type writeDuplicateAliasError<alias extends string> =
	`#${alias} duplicates public alias ${alias}`

export type AliasDefEntry = [name: string, defValue: unknown]

const scopesByName: Record<string, BaseScope | undefined> = {}

export type GlobalOnlyConfigOptionName = satisfy<
	keyof ArkSchemaConfig,
	"dateAllowsInvalid" | "numberAllowsNaN" | "onUndeclaredKey"
>

export interface ScopeOnlyConfigOptions {
	name?: string
	prereducedAliases?: boolean
}

export interface ArkSchemaScopeConfig
	extends Omit<ArkSchemaConfig, GlobalOnlyConfigOptionName>,
		ScopeOnlyConfigOptions {}

export interface ResolvedScopeConfig
	extends ResolvedConfig,
		ScopeOnlyConfigOptions {}

$ark.ambient ??= {} as never

let rawUnknownUnion: UnionNode | undefined

const precompile = (references: readonly BaseNode[]): void =>
	bindPrecompilation(references, writePrecompilation(references))

const bindPrecompilation = (
	references: readonly BaseNode[],
	precompilation: string
): void => {
	const compiledTraversals = instantiatePrecompilation(precompilation)
	for (const node of references) {
		if (node.precompilation) {
			// if node has already been bound to another scope or anonymous type, don't rebind it
			continue
		}
		node.traverseAllows =
			compiledTraversals[`${node.id}Allows`].bind(compiledTraversals)
		if (node.isRoot() && !node.allowsRequiresContext) {
			// if the reference doesn't require context, we can assign over
			// it directly to avoid having to initialize it
			node.allows = node.traverseAllows as never
		}
		node.traverseApply =
			compiledTraversals[`${node.id}Apply`].bind(compiledTraversals)

		if (compiledTraversals[`${node.id}Optimistic`]) {
			;(node as UnionNode).traverseOptimistic =
				compiledTraversals[`${node.id}Optimistic`].bind(compiledTraversals)
		}
		node.precompilation = precompilation
	}
}

const instantiatePrecompilation = (precompilation: string) =>
	new CompiledFunction().return(precompilation).compile<
		() => {
			[k: `${string}Allows`]: TraverseAllows
			[k: `${string}Apply`]: TraverseApply
			[k: `${string}Optimistic`]: (data: unknown) => unknown
		}
	>()()

const writePrecompilation = (references: readonly BaseNode[]) =>
	references.reduce((js, node) => {
		const allowsCompiler = new NodeCompiler({ kind: "Allows" }).indent()
		node.compile(allowsCompiler)
		const allowsJs = allowsCompiler.write(`${node.id}Allows`)

		const applyCompiler = new NodeCompiler({ kind: "Apply" }).indent()
		node.compile(applyCompiler)
		const applyJs = applyCompiler.write(`${node.id}Apply`)

		const result = `${js}${allowsJs},\n${applyJs},\n`

		if (!node.hasKind("union")) return result

		const optimisticCompiler = new NodeCompiler({
			kind: "Allows",
			optimistic: true
		}).indent()
		node.compile(optimisticCompiler)
		const optimisticJs = optimisticCompiler.write(`${node.id}Optimistic`)

		return `${result}${optimisticJs},\n`
	}, "{\n") + "}"

export abstract class BaseScope<$ extends {} = {}> {
	readonly config: ArkSchemaScopeConfig
	readonly resolvedConfig: ResolvedScopeConfig
	readonly name: string

	get [arkKind](): "scope" {
		return "scope"
	}

	readonly referencesById: { [id: string]: BaseNode } = {}
	references: readonly BaseNode[] = []
	readonly resolutions: {
		[alias: string]: CachedResolution | undefined
	} = {}

	exportedNames: string[] = []
	readonly aliases: Record<string, unknown> = {}
	protected resolved = false
	readonly nodesByHash: Record<string, BaseNode> = {}

	constructor(
		/** The set of names defined at the root-level of the scope mapped to their
		 * corresponding definitions.**/
		def: Record<string, unknown>,
		config?: ArkSchemaScopeConfig
	) {
		this.config = mergeConfigs($ark.config, config)
		this.resolvedConfig = mergeConfigs($ark.resolvedConfig, config)

		this.name =
			this.resolvedConfig.name ??
			`anonymousScope${Object.keys(scopesByName).length}`
		if (this.name in scopesByName)
			throwParseError(`A Scope already named ${this.name} already exists`)
		scopesByName[this.name] = this

		const aliasEntries = Object.entries(def).map(entry =>
			this.preparseOwnAliasEntry(...entry)
		)

		aliasEntries.forEach(([k, v]) => {
			let name = k
			if (k[0] === "#") {
				name = k.slice(1)
				if (name in this.aliases)
					throwParseError(writeDuplicateAliasError(name))
				this.aliases[name] = v
			} else {
				if (name in this.aliases) throwParseError(writeDuplicateAliasError(k))
				this.aliases[name] = v
				this.exportedNames.push(name)
			}
			if (
				!hasArkKind(v, "module") &&
				!hasArkKind(v, "generic") &&
				// TODO: proto thunk defs?
				!isThunk(v)
			) {
				const preparsed = this.preparseOwnDefinitionFormat(v, { alias: name })
				if (hasArkKind(preparsed, "root"))
					this.resolutions[name] = this.bindReference(preparsed)
				else this.resolutions[name] = this.createParseContext(preparsed).id
			}
		}) as never

		// reduce union of all possible values reduces to unknown
		rawUnknownUnion ??= this.node(
			"union",
			{
				branches: [
					"string",
					"number",
					"object",
					"bigint",
					"symbol",
					{ unit: true },
					{ unit: false },
					{ unit: undefined },
					{ unit: null }
				]
			},
			{ prereduced: true }
		)

		this.nodesByHash[rawUnknownUnion.hash] = this.node(
			"intersection",
			{},
			{ prereduced: true }
		)
	}

	protected cacheGetter<name extends keyof this>(
		name: name,
		value: this[name]
	): this[name] {
		Object.defineProperty(this, name, { value })
		return value
	}

	get internal(): this {
		return this
	}

	// json is populated when the scope is exported, so ensure it is populated
	// before allowing external access
	private _json: JsonStructure | undefined
	get json(): JsonStructure {
		if (!this._json) this.export()
		return this._json!
	}

	defineSchema<def extends RootSchema>(def: def): def {
		return def
	}

	generic: GenericRootParser = (...params) => {
		const $: BaseScope = this as never
		return (def: unknown, possibleHkt?: Hkt.constructor) =>
			new GenericRoot(
				params,
				possibleHkt ? new LazyGenericBody(def as Fn) : def,
				$,
				$,
				possibleHkt ?? null
			) as never
	}

	units = (values: array, opts?: BaseParseOptions): BaseRoot => {
		const uniqueValues: unknown[] = []
		for (const value of values)
			if (!uniqueValues.includes(value)) uniqueValues.push(value)

		const branches = uniqueValues.map(unit => this.node("unit", { unit }, opts))
		return this.node("union", branches, {
			...opts,
			prereduced: true
		})
	}

	protected lazyResolutions: Alias.Node[] = []
	lazilyResolve(resolve: () => BaseRoot, syntheticAlias?: string): Alias.Node {
		const node = this.node(
			"alias",
			{
				reference: syntheticAlias ?? "synthetic",
				resolve
			},
			{ prereduced: true }
		)
		if (!this.resolved) this.lazyResolutions.push(node)
		return node
	}

	schema: InternalSchemaParser = (schema, opts) =>
		this.finalize(this.parseSchema(schema, opts))

	parseSchema: InternalSchemaParser = (schema, opts) =>
		this.node(schemaKindOf(schema), schema, opts)

	protected preparseNode(
		kinds: NodeKind | listable<RootKind>,
		schema: unknown,
		opts: BaseParseOptions
	): BaseNode | NodeParseContextInput {
		let kind: NodeKind =
			typeof kinds === "string" ? kinds : schemaKindOf(schema, kinds)

		if (isNode(schema) && schema.kind === kind) return schema

		if (kind === "alias" && !opts?.prereduced) {
			const { reference } = Alias.implementation.normalize(
				schema as never,
				this
			)
			if (reference.startsWith("$")) {
				const resolution = this.resolveRoot(reference.slice(1))
				schema = resolution
				kind = resolution.kind
			}
		} else if (kind === "union" && hasDomain(schema, "object")) {
			const branches = schemaBranchesOf(schema)
			if (branches?.length === 1) {
				schema = branches[0]
				kind = schemaKindOf(schema)
			}
		}

		if (isNode(schema) && schema.kind === kind) return schema

		const impl = nodeImplementationsByKind[kind]
		const normalizedSchema = impl.normalize?.(schema, this) ?? schema

		// check again after normalization in case a node is a valid collapsed
		// schema for the kind (e.g. sequence can collapse to element accepting a Node')
		if (isNode(normalizedSchema)) {
			return normalizedSchema.kind === kind ?
					normalizedSchema
				:	throwMismatchedNodeRootError(kind, normalizedSchema.kind)
		}

		return {
			...opts,
			$: this,
			kind,
			def: normalizedSchema,
			prefix: opts.alias ?? kind
		}
	}

	bindReference<reference extends BaseNode | GenericRoot>(
		reference: reference
	): reference {
		let bound: reference

		if (isNode(reference)) {
			bound =
				reference.$ === this ?
					reference
				:	new (reference.constructor as any)(reference.attachments, this)
		} else {
			bound =
				reference.$ === this ?
					reference
				:	(new GenericRoot(
						reference.params as never,
						reference.bodyDef,
						reference.$,
						this as never,
						reference.hkt
					) as never)
		}

		if (!this.resolved) {
			// we're still parsing the scope itself, so defer compilation but
			// add the node as a reference
			Object.assign(this.referencesById, bound.referencesById)
		}

		return bound as never
	}

	resolveRoot(name: string): BaseRoot {
		return (
			this.maybeResolveRoot(name) ??
			throwParseError(writeUnresolvableMessage(name))
		)
	}

	maybeResolveRoot(name: string): BaseRoot | undefined {
		const result = this.maybeResolve(name)
		if (hasArkKind(result, "generic")) return
		return result
	}

	/** If name is a valid reference to a submodule alias, return its resolution  */
	protected maybeResolveSubalias(
		name: string
	): BaseRoot | GenericRoot | undefined {
		return (
			maybeResolveSubalias(this.aliases, name) ??
			maybeResolveSubalias(this.ambient, name)
		)
	}

	get ambient(): InternalModule {
		return $ark.ambient as never
	}

	maybeResolve(name: string): Exclude<CachedResolution, string> | undefined {
		const cached = this.resolutions[name]
		if (cached) {
			if (typeof cached !== "string") return this.bindReference(cached)

			const v = nodesByRegisteredId[cached]
			if (hasArkKind(v, "root")) return (this.resolutions[name] = v)
			if (hasArkKind(v, "context")) {
				if (v.phase === "resolving") {
					return this.node(
						"alias",
						{ reference: `$${name}` },
						{ prereduced: true }
					)
				}
				if (v.phase === "resolved") {
					return throwInternalError(
						`Unexpected resolved context for was uncached by its scope: ${printable(v)}`
					)
				}
				v.phase = "resolving"
				const node = this.bindReference(this.parseOwnDefinitionFormat(v.def, v))
				v.phase = "resolved"
				nodesByRegisteredId[node.id] = node
				nodesByRegisteredId[v.id] = node
				return (this.resolutions[name] = node)
			}
			return throwInternalError(
				`Unexpected nodesById entry for ${cached}: ${printable(v)}`
			)
		}
		let def: unknown = this.aliases[name] ?? this.ambient?.[name]

		if (!def) return this.maybeResolveSubalias(name)

		def = this.normalizeRootScopeValue(def)

		if (hasArkKind(def, "generic"))
			return (this.resolutions[name] = this.bindReference(def))

		if (hasArkKind(def, "module")) {
			if (def.root)
				return (this.resolutions[name] = this.bindReference(def.root))
			else return throwParseError(writeMissingSubmoduleAccessMessage(name))
		}

		return (this.resolutions[name] = this.parse(def, {
			alias: name
		}))
	}

	protected createParseContext<input extends BaseParseContextInput>(
		input: input
	): input & AttachedParseContext {
		const id = input.id ?? registerNodeId(input.prefix)
		return (nodesByRegisteredId[id] = Object.assign(input, {
			[arkKind]: "context" as const,
			$: this as never,
			id,
			phase: "unresolved" as const
		}))
	}

	traversal(root: unknown): Traversal {
		return new Traversal(root, this.resolvedConfig)
	}

	import(): SchemaModule<{
		[k in exportedNameOf<$> as PrivateDeclaration<k>]: $[k]
	}>
	import<names extends exportedNameOf<$>[]>(
		...names: names
	): SchemaModule<
		{
			[k in names[number] as PrivateDeclaration<k>]: $[k]
		} & unknown
	>
	import(...names: string[]): SchemaModule {
		return new RootModule(
			flatMorph(this.export(...(names as never)) as any, (alias, value) => [
				`#${alias}`,
				value
			]) as never
		) as never
	}

	precompilation: string | undefined

	private _exportedResolutions: InternalResolutions | undefined
	private _exports: RootExportCache | undefined
	export(): SchemaModule<{ [k in exportedNameOf<$>]: $[k] }>
	export<names extends exportedNameOf<$>[]>(
		...names: names
	): SchemaModule<
		{
			[k in names[number]]: $[k]
		} & unknown
	>
	export(...names: string[]): SchemaModule {
		if (!this._exports) {
			this._exports = {}
			for (const name of this.exportedNames) {
				const def = this.aliases[name]
				this._exports[name] =
					hasArkKind(def, "module") ?
						bindModule(def, this)
					:	bootstrapAliasReferences(this.maybeResolve(name)!)
			}

			this.lazyResolutions.forEach(node => node.resolution)

			this._exportedResolutions = resolutionsOfModule(this, this._exports)

			this._json = resolutionsToJson(this._exportedResolutions)
			Object.assign(this.resolutions, this._exportedResolutions)

			this.references = Object.values(this.referencesById)
			if (!this.resolvedConfig.jitless) {
				this.precompilation = writePrecompilation(this.references)
				bindPrecompilation(this.references, this.precompilation)
			}
			this.resolved = true
		}
		const namesToExport = names.length ? names : this.exportedNames
		return new RootModule(
			flatMorph(namesToExport, (_, name) => [
				name,
				this._exports![name]
			]) as never
		) as never
	}

	resolve<name extends exportedNameOf<$>>(
		name: name
	): instantiateRoot<$[name]> {
		return this.export()[name as never]
	}

	node = <
		kinds extends NodeKind | array<RootKind>,
		prereduced extends boolean = false
	>(
		kinds: kinds,
		nodeSchema: NodeSchema<flattenListable<kinds>>,
		opts = {} as BaseParseOptions<prereduced>
	): nodeOfKind<
		prereduced extends true ? flattenListable<kinds>
		:	reducibleKindOf<flattenListable<kinds>>
	> => {
		const ctxOrNode = this.preparseNode(kinds, nodeSchema, opts)

		if (isNode(ctxOrNode)) return this.bindReference(ctxOrNode) as never

		const ctx = this.createParseContext(ctxOrNode)

		const node = parseNode(ctx)

		const bound = this.bindReference(node)

		return (nodesByRegisteredId[ctx.id] = bound) as never
	}

	parse = (def: unknown, opts: BaseParseOptions = {}): BaseRoot =>
		this.finalize(this.parseDefinition(def, opts))

	parseDefinition(def: unknown, opts: BaseParseOptions = {}): BaseRoot {
		if (hasArkKind(def, "root")) return this.bindReference(def)

		const ctxInputOrNode = this.preparseOwnDefinitionFormat(def, opts)
		if (hasArkKind(ctxInputOrNode, "root"))
			return this.bindReference(ctxInputOrNode)

		const ctx = this.createParseContext(ctxInputOrNode)
		nodesByRegisteredId[ctx.id] = ctx
		let node = this.bindReference(this.parseOwnDefinitionFormat(def, ctx))

		// if the node is recursive e.g. { box: "this" }, we need to make sure it
		// has the original id from context so that its references compile correctly
		if (node.isCyclic) node = withId(node, ctx.id)

		nodesByRegisteredId[ctx.id] = node

		return node
	}

	finalize<node extends BaseRoot>(node: node): node {
		bootstrapAliasReferences(node)
		if (!node.precompilation && !this.resolvedConfig.jitless)
			precompile(node.references)
		return node
	}

	protected abstract preparseOwnDefinitionFormat(
		def: unknown,
		opts: BaseParseOptions
	): BaseRoot | BaseParseContextInput

	abstract parseOwnDefinitionFormat(
		def: unknown,
		ctx: BaseParseContext
	): BaseRoot

	protected abstract preparseOwnAliasEntry(k: string, v: unknown): AliasDefEntry

	protected abstract normalizeRootScopeValue(resolution: unknown): unknown
}

export class SchemaScope<$ extends {} = {}> extends BaseScope<$> {
	parseOwnDefinitionFormat(def: unknown, ctx: NodeParseContext): BaseRoot {
		return parseNode(ctx) as never
	}

	protected preparseOwnDefinitionFormat(
		schema: RootSchema,
		opts: BaseParseOptions
	): BaseRoot | NodeParseContextInput {
		return this.preparseNode(schemaKindOf(schema), schema, opts) as never
	}

	protected preparseOwnAliasEntry(k: string, v: unknown): AliasDefEntry {
		return [k, v]
	}

	protected normalizeRootScopeValue(v: unknown): unknown {
		return v
	}
}

const bootstrapAliasReferences = (resolution: BaseRoot | GenericRoot) => {
	resolution.references
		.filter(node => node.hasKind("alias"))
		.forEach(aliasNode => {
			Object.assign(
				aliasNode.referencesById,
				aliasNode.resolution.referencesById
			)
			resolution.references.forEach(ref => {
				if (aliasNode.id in ref.referencesById)
					Object.assign(ref.referencesById, aliasNode.referencesById)
			})
		})
	return resolution
}

const resolutionsToJson = (resolutions: InternalResolutions): JsonStructure =>
	flatMorph(resolutions, (k, v) => [
		k,
		hasArkKind(v, "root") || hasArkKind(v, "generic") ? v.json
		: hasArkKind(v, "module") ? resolutionsToJson(v)
		: throwInternalError(`Unexpected resolution ${printable(v)}`)
	])

const maybeResolveSubalias = (
	base: Dict,
	name: string
): BaseRoot | GenericRoot | undefined => {
	const dotIndex = name.indexOf(".")
	if (dotIndex === -1) return

	const dotPrefix = name.slice(0, dotIndex)
	const prefixSchema = base[dotPrefix]
	// if the name includes ".", but the prefix is not an alias, it
	// might be something like a decimal literal, so just fall through to return
	if (prefixSchema === undefined) return
	if (!hasArkKind(prefixSchema, "module"))
		return throwParseError(writeNonSubmoduleDotMessage(dotPrefix))

	const subalias = name.slice(dotIndex + 1)
	const resolution = prefixSchema[subalias]

	if (resolution === undefined)
		return maybeResolveSubalias(prefixSchema, subalias)

	if (hasArkKind(resolution, "root") || hasArkKind(resolution, "generic"))
		return resolution

	if (hasArkKind(resolution, "module")) {
		return (
			resolution.root ??
			throwParseError(writeMissingSubmoduleAccessMessage(name))
		)
	}

	throwInternalError(
		`Unexpected resolution for alias '${name}': ${printable(resolution)}`
	)
}

type instantiateAliases<aliases> = {
	[k in keyof aliases]: aliases[k] extends InternalResolution ? aliases[k]
	:	BaseRoot
} & unknown

export type SchemaScopeParser = <const aliases>(
	aliases: {
		[k in keyof aliases]: conform<
			aliases[k],
			RootSchema | PreparsedNodeResolution
		>
	},
	config?: ArkSchemaScopeConfig
) => BaseScope<instantiateAliases<aliases>>

export const schemaScope: SchemaScopeParser = (aliases, config) =>
	new SchemaScope(aliases, config)

export type InternalSchemaParser = (
	schema: RootSchema,
	opts?: BaseParseOptions
) => BaseRoot

export const rootSchemaScope: SchemaScope = new SchemaScope({})

export const parseAsSchema = (
	def: unknown,
	opts?: BaseParseOptions
): BaseRoot | ParseError => {
	try {
		return rootSchema(def as RootSchema, opts) as never
	} catch (e) {
		if (e instanceof ParseError) return e
		throw e
	}
}

export type RootExportCache = Record<
	string,
	BaseRoot | GenericRoot | RootModule | undefined
>

const resolutionsOfModule = ($: BaseScope, typeSet: RootExportCache) => {
	const result: InternalResolutions = {}
	for (const k in typeSet) {
		const v = typeSet[k]
		if (hasArkKind(v, "module")) {
			const innerResolutions = resolutionsOfModule($, v as never)
			const prefixedResolutions = flatMorph(
				innerResolutions,
				(innerK, innerV) => [`${k}.${innerK}`, innerV]
			)
			Object.assign(result, prefixedResolutions)
		} else if (hasArkKind(v, "root") || hasArkKind(v, "generic")) result[k] = v
		else throwInternalError(`Unexpected scope resolution ${printable(v)}`)
	}
	return result
}

export const writeUnresolvableMessage = <token extends string>(
	token: token
): writeUnresolvableMessage<token> => `'${token}' is unresolvable`

export type writeUnresolvableMessage<token extends string> =
	`'${token}' is unresolvable`

export const writeNonSubmoduleDotMessage = <name extends string>(
	name: name
): writeNonSubmoduleDotMessage<name> =>
	`'${name}' must reference a module to be accessed using dot syntax`

export type writeNonSubmoduleDotMessage<name extends string> =
	`'${name}' must reference a module to be accessed using dot syntax`

export const writeMissingSubmoduleAccessMessage = <name extends string>(
	name: name
): writeMissingSubmoduleAccessMessage<name> =>
	`Reference to submodule '${name}' must specify an alias`

export type writeMissingSubmoduleAccessMessage<name extends string> =
	`Reference to submodule '${name}' must specify an alias`

// ensure the scope is resolved so JIT will be applied to future types
rootSchemaScope.export()

export const rootSchema: BaseScope["schema"] = rootSchemaScope.schema
export const node: BaseScope["node"] = rootSchemaScope.node
export const defineSchema: BaseScope["defineSchema"] =
	rootSchemaScope.defineSchema
export const genericNode: BaseScope["generic"] = rootSchemaScope.generic
