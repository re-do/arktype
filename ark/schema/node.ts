import {
	Callable,
	appendUnique,
	flatMorph,
	includes,
	isArray,
	isEmptyObject,
	stringifyPath,
	throwError,
	throwInternalError,
	type Dict,
	type GuardablePredicate,
	type JsonStructure,
	type Key,
	type array,
	type conform,
	type listable,
	type mutable
} from "@ark/util"
import type { BaseConstraint } from "./constraint.ts"
import type {
	Inner,
	NormalizedSchema,
	mutableInnerOfKind,
	nodeOfKind,
	reducibleKindOf
} from "./kinds.ts"
import type { BaseParseOptions } from "./parse.ts"
import type { Morph } from "./roots/morph.ts"
import type { BaseRoot } from "./roots/root.ts"
import type { UnionNode } from "./roots/union.ts"
import type { Unit } from "./roots/unit.ts"
import type { BaseScope } from "./scope.ts"
import type { NodeCompiler } from "./shared/compile.ts"
import type {
	BaseMeta,
	BaseNodeDeclaration,
	MetaSchema,
	attachmentsOf
} from "./shared/declare.ts"
import type { ArkErrors } from "./shared/errors.ts"
import {
	basisKinds,
	constraintKinds,
	precedenceOfKind,
	refinementKinds,
	rootKinds,
	structuralKinds,
	type BasisKind,
	type NodeKind,
	type OpenNodeKind,
	type RefinementKind,
	type StructuralKind,
	type UnknownAttachments
} from "./shared/implement.ts"
import { $ark } from "./shared/registry.ts"
import {
	Traversal,
	type TraverseAllows,
	type TraverseApply
} from "./shared/traversal.ts"
import { isNode, type arkKind } from "./shared/utils.ts"
import type { UndeclaredKeyHandling } from "./structure/structure.ts"

export abstract class BaseNode<
	/** uses -ignore rather than -expect-error because this is not an error in .d.ts
	 * @ts-ignore allow instantiation assignment to the base type */
	out d extends BaseNodeDeclaration = BaseNodeDeclaration
> extends Callable<
	(
		data: d["prerequisite"],
		ctx?: Traversal,
		onFail?: ArkErrors.Handler | null
	) => unknown,
	attachmentsOf<d>
> {
	attachments: UnknownAttachments
	$: BaseScope
	onFail: ArkErrors.Handler | null
	includesTransform: boolean

	// if a predicate accepts exactly one arg, we can safely skip passing context
	// technically, a predicate could be written like `(data, ...[ctx]) => ctx.mustBe("malicious")`
	// that would break here, but it feels like a pathological case and is better to let people optimize
	includesContextualPredicate: boolean
	isCyclic: boolean
	allowsRequiresContext: boolean
	rootApplyStrategy:
		| "allows"
		| "contextual"
		| "optimistic"
		| "branchedOptimistic"
	contextFreeMorph: ((data: unknown) => unknown) | undefined
	rootApply: (data: unknown, onFail: ArkErrors.Handler | null) => unknown

	referencesById: Record<string, BaseNode>
	shallowReferences: BaseNode[]
	flatRefs: FlatRef[]
	flatMorphs: FlatRef<Morph.Node>[]
	allows: (data: d["prerequisite"]) => boolean

	get shallowMorphs(): array<Morph> {
		return []
	}

	constructor(attachments: UnknownAttachments, $: BaseScope) {
		super(
			(
				data: any,
				pipedFromCtx?: Traversal | undefined,
				onFail: ArkErrors.Handler | null = this.onFail
			) => {
				if (pipedFromCtx) {
					this.traverseApply(data, pipedFromCtx)
					return pipedFromCtx.hasError() ?
							pipedFromCtx.errors
						:	pipedFromCtx.data
				}

				return this.rootApply(data, onFail)
			},
			{ attach: attachments as never }
		)
		this.attachments = attachments
		this.$ = $
		this.onFail = this.meta.onFail ?? this.$.resolvedConfig.onFail

		this.includesTransform =
			this.hasKind("morph") ||
			(this.hasKind("structure") && this.structuralMorph !== undefined)

		// if a predicate accepts exactly one arg, we can safely skip passing context
		// technically, a predicate could be written like `(data, ...[ctx]) => ctx.mustBe("malicious")`
		// that would break here, but it feels like a pathological case and is better to let people optimize
		this.includesContextualPredicate =
			this.hasKind("predicate") && this.inner.predicate.length !== 1

		this.isCyclic = this.kind === "alias"
		this.referencesById = { [this.id]: this }

		this.shallowReferences =
			this.hasKind("structure") ?
				[this as BaseNode, ...(this.children as never)]
			:	this.children.reduce<BaseNode[]>(
					(acc, child) => appendUniqueNodes(acc, child.shallowReferences),
					[this]
				)

		const isStructural = this.isStructural()

		this.flatRefs = []
		this.flatMorphs = []

		for (let i = 0; i < this.children.length; i++) {
			this.includesTransform ||= this.children[i].includesTransform
			this.includesContextualPredicate ||=
				this.children[i].includesContextualPredicate
			this.isCyclic ||= this.children[i].isCyclic

			if (!isStructural) {
				const childFlatRefs = this.children[i].flatRefs
				for (let j = 0; j < childFlatRefs.length; j++) {
					const childRef = childFlatRefs[j]
					if (
						!this.flatRefs.some(existing =>
							flatRefsAreEqual(existing, childRef)
						)
					) {
						this.flatRefs.push(childRef)
						for (const branch of childRef.node.branches) {
							if (branch.hasKind("morph")) {
								this.flatMorphs.push({
									path: childRef.path,
									propString: childRef.propString,
									node: branch
								})
							}
						}
					}
				}
			}

			Object.assign(this.referencesById, this.children[i].referencesById)
		}

		this.flatRefs.sort((l, r) =>
			l.path.length > r.path.length ? 1
			: l.path.length < r.path.length ? -1
			: l.propString > r.propString ? 1
			: l.propString < r.propString ? -1
			: l.node.expression < r.node.expression ? -1
			: 1
		)

		this.allowsRequiresContext =
			this.includesContextualPredicate || this.isCyclic
		this.rootApplyStrategy =
			!this.allowsRequiresContext && this.flatMorphs.length === 0 ?
				this.shallowMorphs.length === 0 ? "allows"
				: this.shallowMorphs.every(morph => morph.length === 1) ?
					this.hasKind("union") ?
						// multiple morphs not yet supported for optimistic compilation
						this.branches.some(branch => branch.shallowMorphs.length > 1) ?
							"contextual"
						:	"branchedOptimistic"
					: this.shallowMorphs.length > 1 ? "contextual"
					: "optimistic"
				:	"contextual"
			:	"contextual"

		this.rootApply = this.createRootApply()
		this.allows =
			this.allowsRequiresContext ?
				data =>
					this.traverseAllows(
						data as never,
						new Traversal(data, this.$.resolvedConfig)
					)
			:	data => (this.traverseAllows as any)(data)
	}

	protected createRootApply(): this["rootApply"] {
		switch (this.rootApplyStrategy) {
			case "allows":
				return (data, onFail) => {
					if (this.allows(data)) return data

					const ctx = new Traversal(data, this.$.resolvedConfig)
					this.traverseApply(data, ctx)
					return ctx.finalize(onFail)
				}

			case "contextual":
				return (data, onFail) => {
					const ctx = new Traversal(data, this.$.resolvedConfig)
					this.traverseApply(data, ctx)
					return ctx.finalize(onFail)
				}

			case "optimistic":
				this.contextFreeMorph = this.shallowMorphs[0] as never
				return (data, onFail) => {
					if (this.allows(data)) return this.contextFreeMorph!(data)

					const ctx = new Traversal(data, this.$.resolvedConfig)
					this.traverseApply(data, ctx)
					return ctx.finalize(onFail)
				}
			case "branchedOptimistic":
				return (this as {} as UnionNode).createBranchedOptimisticRootApply()
			default:
				this.rootApplyStrategy satisfies never
				return throwInternalError(
					`Unexpected rootApplyStrategy ${this.rootApplyStrategy}`
				)
		}
	}

	withMeta(
		meta: ArkEnv.meta | ((currentMeta: ArkEnv.meta) => ArkEnv.meta)
	): this {
		return this.$.node(this.kind, {
			...this.inner,
			meta: typeof meta === "function" ? meta({ ...this.meta }) : meta
		}) as never
	}

	abstract traverseAllows: TraverseAllows<d["prerequisite"]>
	abstract traverseApply: TraverseApply<d["prerequisite"]>
	abstract expression: string
	abstract compile(js: NodeCompiler): void

	readonly compiledMeta: string = JSON.stringify(this.metaJson)

	protected cacheGetter<name extends keyof this>(
		name: name,
		value: this[name]
	): this[name] {
		Object.defineProperty(this, name, { value })
		return value
	}

	get description(): string {
		return this.cacheGetter(
			"description",
			this.meta?.description ??
				this.$.resolvedConfig[this.kind].description(this as never)
		)
	}

	// we don't cache this currently since it can be updated once a scope finishes
	// resolving cyclic references, although it may be possible to ensure it is cached safely
	get references(): BaseNode[] {
		return Object.values(this.referencesById)
	}

	readonly precedence: number = precedenceOfKind(this.kind)
	precompilation: string | undefined

	// defined as an arrow function since it is often detached, e.g. when passing to tRPC
	// otherwise, would run into issues with this binding
	assert = (data: d["prerequisite"], pipedFromCtx?: Traversal): unknown =>
		this(data, pipedFromCtx, errors => errors.throw())

	traverse(
		data: d["prerequisite"],
		pipedFromCtx?: Traversal
	): ArkErrors | {} | null | undefined {
		return this(data, pipedFromCtx, null)
	}

	get in(): this extends { [arkKind]: "root" } ? BaseRoot : BaseNode {
		return this.cacheGetter("in", this.getIo("in")) as never
	}

	get out(): this extends { [arkKind]: "root" } ? BaseRoot : BaseNode {
		return this.cacheGetter("out", this.getIo("out")) as never
	}

	// Should be refactored to use transform
	// https://github.com/arktypeio/arktype/issues/1020
	getIo(ioKind: "in" | "out"): BaseNode {
		if (!this.includesTransform) return this as never

		const ioInner: Record<any, unknown> = {}
		for (const [k, v] of this.innerEntries) {
			const keySchemaImplementation = this.impl.keys[k]

			if (keySchemaImplementation.reduceIo)
				keySchemaImplementation.reduceIo(ioKind, ioInner, v)
			else if (keySchemaImplementation.child) {
				const childValue = v as listable<BaseNode>

				ioInner[k] =
					isArray(childValue) ?
						childValue.map(child => child[ioKind])
					:	childValue[ioKind]
			} else ioInner[k] = v
		}

		return this.$.node(this.kind, ioInner)
	}

	toJSON(): JsonStructure {
		return this.json
	}

	toString(): string {
		return `Type<${this.expression}>`
	}

	equals(r: unknown): boolean {
		const rNode: BaseNode = isNode(r) ? r : this.$.parseDefinition(r)
		return this.innerHash === rNode.innerHash
	}

	ifEquals(r: unknown): BaseNode | undefined {
		return this.equals(r) ? this : undefined
	}

	hasKind<kind extends NodeKind>(kind: kind): this is nodeOfKind<kind> {
		return this.kind === (kind as never)
	}

	assertHasKind<kind extends NodeKind>(kind: kind): nodeOfKind<kind> {
		if (this.kind !== kind)
			throwError(`${this.kind} node was not of asserted kind ${kind}`)
		return this as never
	}

	hasKindIn<kinds extends NodeKind[]>(
		...kinds: kinds
	): this is nodeOfKind<kinds[number]> {
		return kinds.includes(this.kind)
	}

	assertHasKindIn<kinds extends NodeKind[]>(
		...kinds: kinds
	): nodeOfKind<kinds[number]> {
		if (!includes(kinds, this.kind))
			throwError(`${this.kind} node was not one of asserted kinds ${kinds}`)
		return this as never
	}

	isBasis(): this is nodeOfKind<BasisKind> {
		return includes(basisKinds, this.kind)
	}

	isConstraint(): this is BaseConstraint {
		return includes(constraintKinds, this.kind)
	}

	isStructural(): this is nodeOfKind<StructuralKind> {
		return includes(structuralKinds, this.kind)
	}

	isRefinement(): this is nodeOfKind<RefinementKind> {
		return includes(refinementKinds, this.kind)
	}

	isRoot(): this is BaseRoot {
		return includes(rootKinds, this.kind)
	}

	isUnknown(): boolean {
		return this.hasKind("intersection") && this.children.length === 0
	}

	isNever(): boolean {
		return this.hasKind("union") && this.children.length === 0
	}

	hasUnit<value>(value: unknown): this is Unit.Node & { unit: value } {
		return this.hasKind("unit") && this.allows(value)
	}

	hasOpenIntersection(): this is nodeOfKind<OpenNodeKind> {
		return this.impl.intersectionIsOpen as never
	}

	get nestableExpression(): string {
		return this.expression
	}

	firstReference<narrowed>(
		filter: GuardablePredicate<BaseNode, conform<narrowed, BaseNode>>
	): narrowed | undefined {
		return this.references.find(n => n !== this && filter(n)) as never
	}

	firstReferenceOrThrow<narrowed extends BaseNode>(
		filter: GuardablePredicate<BaseNode, narrowed>
	): narrowed {
		return (
			this.firstReference(filter) ??
			throwError(`${this.id} had no references matching predicate ${filter}`)
		)
	}

	firstReferenceOfKind<kind extends NodeKind>(
		kind: kind
	): nodeOfKind<kind> | undefined {
		return this.firstReference(node => node.hasKind(kind))
	}

	firstReferenceOfKindOrThrow<kind extends NodeKind>(
		kind: kind
	): nodeOfKind<kind> {
		return (
			this.firstReference(node => node.kind === kind) ??
			throwError(`${this.id} had no ${kind} references`)
		)
	}

	transform<mapper extends DeepNodeTransformation>(
		mapper: mapper,
		opts?: DeepNodeTransformOptions
	):
		| nodeOfKind<reducibleKindOf<this["kind"]>>
		| Extract<ReturnType<mapper>, null> {
		return this._transform(mapper, {
			...opts,
			seen: {},
			path: [],
			parseOptions: {
				prereduced: opts?.prereduced ?? false
			},
			undeclaredKeyHandling: undefined
		}) as never
	}

	protected _transform(
		mapper: DeepNodeTransformation,
		ctx: DeepNodeTransformContext
	): BaseNode | null {
		const $ = ctx.bindScope ?? this.$
		if (ctx.seen[this.id])
			// Cyclic handling needs to be made more robust
			// https://github.com/arktypeio/arktype/issues/944
			return this.$.lazilyResolve(ctx.seen[this.id]! as never)
		if (ctx.shouldTransform?.(this as never, ctx) === false) return this

		let transformedNode: BaseRoot | undefined

		ctx.seen[this.id] = () => transformedNode

		if (
			this.hasKind("structure") &&
			this.undeclared !== ctx.undeclaredKeyHandling
		) {
			ctx = {
				...ctx,
				undeclaredKeyHandling: this.undeclared
			}
		}

		const innerWithTransformedChildren = flatMorph(
			this.inner as Dict,
			(k, v) => {
				if (!this.impl.keys[k].child) return [k, v]
				const children = v as listable<BaseNode>
				if (!isArray(children)) {
					const transformed = children._transform(mapper, ctx)
					return transformed ? [k, transformed] : []
				}
				// if the value was previously explicitly set to an empty list,
				// (e.g. branches for `never`), ensure it is not pruned
				if (children.length === 0) return [k, v]
				const transformed = children.flatMap(n => {
					const transformedChild = n._transform(mapper, ctx)
					return transformedChild ?? []
				})
				return transformed.length ? [k, transformed] : []
			}
		)

		delete ctx.seen[this.id]

		const innerWithMeta = Object.assign(innerWithTransformedChildren, {
			meta: this.meta
		})

		const transformedInner = mapper(this.kind, innerWithMeta, ctx)

		if (transformedInner === null) return null

		if (isNode(transformedInner))
			return (transformedNode = transformedInner as never)

		const transformedKeys = Object.keys(transformedInner)

		const hasNoTypedKeys =
			transformedKeys.length === 0 ||
			(transformedKeys.length === 1 && transformedKeys[0] === "meta")

		if (
			hasNoTypedKeys &&
			// if inner was previously an empty object (e.g. unknown) ensure it is not pruned
			!isEmptyObject(this.inner)
		)
			return null

		if (
			(this.kind === "required" ||
				this.kind === "optional" ||
				this.kind === "index") &&
			!("value" in transformedInner)
		) {
			return ctx.undeclaredKeyHandling ?
					({ ...transformedInner, value: $ark.intrinsic.unknown } as never)
				:	null
		}

		if (this.kind === "morph") {
			;(transformedInner as mutableInnerOfKind<"morph">).in ??= $ark.intrinsic
				.unknown as never
		}

		return (transformedNode = $.node(
			this.kind,
			transformedInner,
			ctx.parseOptions
		) as never)
	}

	configureShallowDescendants(meta: MetaSchema): this {
		const newMeta = typeof meta === "string" ? { description: meta } : meta
		return this.$.finalize(
			this.transform(
				(kind, inner) => ({ ...inner, meta: { ...inner.meta, ...newMeta } }),
				{
					shouldTransform: node => node.kind !== "structure"
				}
			) as never
		)
	}
}

/** a literal key (named property) or a node (index signatures) representing part of a type structure */
export type KeyOrKeyNode = Key | BaseRoot

export type GettableKeyOrNode = KeyOrKeyNode | number

export type FlatRef<root extends BaseRoot = BaseRoot> = {
	path: array<KeyOrKeyNode>
	node: root
	propString: string
}

export const typePathToPropString = (path: array<KeyOrKeyNode>): string =>
	stringifyPath(path, {
		stringifyNonKey: node => node.expression
	})

export const flatRef = <node extends BaseRoot>(
	path: array<KeyOrKeyNode>,
	node: node
): FlatRef<node> => ({
	path,
	node,
	propString: typePathToPropString(path)
})

export const flatRefsAreEqual = (l: FlatRef, r: FlatRef): boolean =>
	l.propString === r.propString && l.node.equals(r.node)

export const appendUniqueFlatRefs = <node extends BaseRoot>(
	existing: FlatRef<node>[] | undefined,
	refs: listable<FlatRef<node>>
): FlatRef<node>[] =>
	appendUnique(existing, refs, {
		isEqual: flatRefsAreEqual
	})

export const appendUniqueNodes = <node extends BaseNode>(
	existing: node[] | undefined,
	refs: listable<node>
): node[] =>
	appendUnique(existing, refs, {
		isEqual: (l, r) => l.equals(r)
	})

export type DeepNodeTransformOptions = {
	shouldTransform?: ShouldTransformFn
	bindScope?: BaseScope
	prereduced?: boolean
}

export type ShouldTransformFn = (
	node: BaseNode,
	ctx: DeepNodeTransformContext
) => boolean

export interface DeepNodeTransformContext extends DeepNodeTransformOptions {
	path: mutable<array<KeyOrKeyNode>>
	seen: { [originalId: string]: (() => BaseNode | undefined) | undefined }
	parseOptions: BaseParseOptions
	undeclaredKeyHandling: UndeclaredKeyHandling | undefined
}

export type DeepNodeTransformation = <kind extends NodeKind>(
	kind: kind,
	innerWithMeta: Inner<kind> & { meta: BaseMeta },
	ctx: DeepNodeTransformContext
) => NormalizedSchema<kind> | null
