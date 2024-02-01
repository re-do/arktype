import {
	DynamicBase,
	capitalize,
	includes,
	isArray,
	map,
	printable,
	throwInternalError,
	type Constructor,
	type Dict,
	type Entry,
	type Json,
	type JsonData,
	type entriesOf,
	type listable
} from "@arktype/util"
import type { DomainNode } from "./bases/domain.js"
import type { ProtoNode } from "./bases/proto.js"
import type { UnitNode } from "./bases/unit.js"
import type {
	Declaration,
	Inner,
	Schema,
	hasOpenIntersection,
	ioKindOf,
	reducibleKindOf
} from "./kinds.js"
import type { IndexNode } from "./props/index.js"
import type { OptionalNode } from "./props/optional.js"
import type { RequiredNode } from "./props/required.js"
import type { SequenceNode } from "./props/sequence.js"
import type {
	AfterNode,
	BeforeNode,
	MaxLengthNode,
	MaxNode,
	MinLengthNode,
	MinNode
} from "./refinements/bounds.js"
import type { DivisorNode } from "./refinements/divisor.js"
import type { PatternNode } from "./refinements/pattern.js"
import type { PredicateNode } from "./refinements/predicate.js"
import type { ScopeNode } from "./scope.js"
import type {
	IntersectionInner,
	IntersectionNode
} from "./sets/intersection.js"
import type { MorphNode, distill, extractIn, extractOut } from "./sets/morph.js"
import type { UnionNode } from "./sets/union.js"
import type { CompilationContext } from "./shared/compile.js"
import type {
	BaseNodeDeclaration,
	attachmentsOf,
	ownIntersectionAlternateResult,
	ownIntersectionResult
} from "./shared/declare.js"
import { Disjoint } from "./shared/disjoint.js"
import {
	basisKinds,
	constraintKinds,
	precedenceOfKind,
	refinementKinds,
	setKinds,
	typeKinds,
	type BasisKind,
	type ConstraintKind,
	type NodeKind,
	type RefinementKind,
	type SetKind,
	type TypeKind,
	type UnknownNodeImplementation,
	type nodeImplementationInputOf,
	type nodeImplementationOf
} from "./shared/implement.js"
import { leftOperandOf, type intersectionOf } from "./shared/intersect.js"
import {
	TraversalContext,
	type TraverseAllows,
	type TraverseApply
} from "./traversal/context.js"
import type { ArkResult } from "./traversal/errors.js"

export interface BaseAttachments {
	alias?: string
	readonly kind: NodeKind
	readonly name: string
	readonly inner: Record<string, any>
	readonly entries: readonly Entry[]
	readonly json: Json
	readonly typeJson: Json
	readonly collapsibleJson: JsonData
	readonly children: Node[]
	readonly innerId: string
	readonly typeId: string
	readonly $: ScopeNode
}

export interface NarrowedAttachments<d extends BaseNodeDeclaration>
	extends BaseAttachments {
	kind: d["kind"]
	inner: d["inner"]
	entries: entriesOf<d["inner"]>
	children: Node<d["childKind"]>[]
}

export type NodeSubclass<d extends BaseNodeDeclaration = BaseNodeDeclaration> =
	{
		readonly implementation: nodeImplementationOf<d>
	}

export const isNode = (value: unknown): value is Node =>
	value instanceof BaseNode

export type UnknownNode = BaseNode<
	any,
	BaseNodeDeclaration,
	NodeSubclass<BaseNodeDeclaration>
>

type kindOf<self> = self extends Constructor<{
	kind: infer kind extends NodeKind
}>
	? kind
	: never

type declarationOf<self> = Declaration<kindOf<self>>

export abstract class BaseNode<
	t,
	d extends BaseNodeDeclaration,
	// subclass doesn't affect the class's type, but rather is used to validate
	// the correct implementation of the static implementation
	subclass extends NodeSubclass<d>
> extends DynamicBase<attachmentsOf<d>> {
	protected static implement<self>(
		this: self,
		implementation: nodeImplementationInputOf<declarationOf<self>>
	): nodeImplementationOf<declarationOf<self>>
	protected static implement(_: never): any {
		const implementation: UnknownNodeImplementation = _
		if (implementation.hasAssociatedError) {
			implementation.defaults.expected ??= (ctx) =>
				"description" in ctx
					? (ctx.description as string)
					: implementation.defaults.description(ctx)
			implementation.defaults.actual ??= (data) => printable(data)
			implementation.defaults.problem ??= (ctx) =>
				`must be ${ctx.expected}${ctx.actual ? ` (was ${ctx.actual})` : ""}`
			implementation.defaults.message ??= (ctx) =>
				ctx.path.length === 0
					? capitalize(ctx.problem)
					: ctx.path.length === 1 && typeof ctx.path[0] === "number"
					? `Item at index ${ctx.path[0]} ${ctx.problem}`
					: `${ctx.path} ${ctx.problem}`
		}
		return implementation
	}

	private readonly impl: UnknownNodeImplementation = (this.constructor as any)
		.implementation

	readonly includesMorph: boolean =
		this.kind === "morph" || this.children.some((child) => child.includesMorph)
	readonly includesContextDependentPredicate: boolean =
		// if a predicate accepts exactly one arg, we can safely skip passing context
		(this.hasKind("predicate") && this.inner.predicate.length !== 1) ||
		this.children.some((child) => child.includesContextDependentPredicate)
	readonly referencesByName: Record<string, Node> = this.children.reduce(
		(result, child) => Object.assign(result, child.contributesReferencesByName),
		{}
	)
	readonly references: readonly Node[] = Object.values(this.referencesByName)
	readonly contributesReferencesByName: Record<string, Node>
	readonly contributesReferences: readonly Node[]
	readonly precedence = precedenceOfKind(this.kind)
	// use declare here to ensure description from attachments isn't overwritten
	declare readonly description: string

	constructor(attachments: BaseAttachments) {
		super(attachments as never)
		this.contributesReferencesByName =
			this.name in this.referencesByName
				? this.referencesByName
				: { ...this.referencesByName, [this.name]: this as never }
		this.contributesReferences = Object.values(this.contributesReferencesByName)
		this.description ??= this.$.config[this.kind].description(
			this.inner as never
		)
	}

	// abstract hasOpenIntersection: hasOpenIntersection<d>
	// abstract traverseAllows: TraverseAllows<d["prerequisite"]>
	// abstract traverseApply: TraverseApply<d["prerequisite"]>
	// abstract compileApply(ctx: CompilationContext): string
	// abstract compileAllows(ctx: CompilationContext): string

	allows = (data: d["prerequisite"]): data is distill<extractIn<t>> => {
		const ctx = new TraversalContext(data, this.$.config)
		return this.traverseAllows(data as never, ctx)
	}

	apply(data: d["prerequisite"]): ArkResult<distill<extractOut<t>>> {
		const ctx = new TraversalContext(data, this.$.config)
		this.traverseApply(data as never, ctx)
		if (ctx.currentErrors.length === 0) {
			return { out: data } as any
		}
		return { errors: ctx.currentErrors }
	}

	private inCache?: UnknownNode;
	get in(): Node<ioKindOf<d["kind"]>, extractIn<t>> {
		this.inCache ??= this.getIo("in")
		return this.inCache as never
	}

	private outCache?: UnknownNode
	get out(): Node<ioKindOf<d["kind"]>, extractOut<t>> {
		this.outCache ??= this.getIo("out")
		return this.outCache as never
	}

	private getIo(kind: "in" | "out"): UnknownNode {
		if (!this.includesMorph) {
			return this as never
		}
		const ioInner: Record<any, unknown> = {}
		for (const [k, v] of this.entries as readonly Entry<string>[]) {
			const keyDefinition = this.impl.keys[k]
			if (keyDefinition.meta) {
				continue
			}
			if (keyDefinition.child) {
				const childValue = v as listable<UnknownNode>
				ioInner[k] = isArray(childValue)
					? childValue.map((child) => child[kind])
					: childValue[kind]
			} else {
				ioInner[k] = v
			}
		}
		return this.$.parseNode(this.kind, ioInner) as never
	}

	toJSON() {
		return this.json
	}

	equals(other: Node) {
		return this.typeId === other.typeId
	}

	hasKind<kind extends NodeKind>(kind: kind): this is Node<kind> {
		return this.kind === (kind as never)
	}

	isBasis(): this is Node<BasisKind> {
		return includes(basisKinds, this.kind)
	}

	isRefinement(): this is Node<RefinementKind> {
		return includes(refinementKinds, this.kind)
	}

	isType(): this is TypeNode {
		return includes(typeKinds, this.kind)
	}

	isSet(): this is Node<SetKind> {
		return includes(setKinds, this.kind)
	}

	isConstraint(): this is Node<ConstraintKind> {
		return includes(constraintKinds, this.kind)
	}

	toString() {
		return this.description
	}

	protected abstract intersectOwnInner(
		r: Node<d["kind"]>
	): d["inner"] | ownIntersectionAlternateResult<d>

	intersectOwnKind(r: Node<d["kind"]> | undefined): ownIntersectionResult<d> {
		if (r === undefined) {
			return this as never
		}
		// TODO: check equality
		const innerResult = this.intersectOwnInner(r)
		if (innerResult === null || innerResult instanceof Disjoint) {
			return innerResult
		}
		return this.$.parseNode(this.kind, innerResult as never)
	}

	private static intersectionCache: Record<string, Node | Disjoint> = {}
	intersect<other extends Node>(
		other: other
	): intersectionOf<this["kind"], other["kind"]>
	intersect(other: Node): Node | Disjoint | null {
		const cacheKey = `${this.typeId}&${other.typeId}`
		if (BaseNode.intersectionCache[cacheKey] !== undefined) {
			return BaseNode.intersectionCache[cacheKey]
		}
		const closedResult = this.intersectClosed(other as never)
		if (closedResult !== null) {
			BaseNode.intersectionCache[cacheKey] = closedResult
			BaseNode.intersectionCache[`${other.typeId}&${this.typeId}`] =
				// also cache the result with other's condition as the key.
				// if it was a Disjoint, it has to be inverted so that l,r
				// still line up correctly
				closedResult instanceof Disjoint ? closedResult.invert() : closedResult
			return closedResult
		}
		if (this.isSet() || other.isSet()) {
			return throwInternalError(
				`Unexpected null intersection between non-constraints ${this.kind} and ${other.kind}`
			)
		}
		// if either constraint is a basis or both don't require a basis (i.e.
		// are predicates), it can form an intersection
		const intersectionInner: IntersectionInner | null = this.isBasis()
			? {
					basis: this,
					[other.kind]: other.hasOpenIntersection ? [other] : other
			  }
			: other.isBasis()
			? {
					basis: other,
					[this.kind]: this.hasOpenIntersection ? [this] : this
			  }
			: this.hasKind("predicate") && other.hasKind("predicate")
			? { predicate: [this, other] }
			: null
		return (
			intersectionInner && this.$.parseNode("intersection", intersectionInner)
		)
	}

	intersectClosed<other extends Node>(
		other: other
	): Node<d["kind"] | other["kind"]> | Disjoint | null {
		if (this.equals(other)) {
			// TODO: meta
			return this as never
		}
		const l: UnknownNode = leftOperandOf(this as never, other) as any
		const thisIsLeft = l === (this as never)
		const r: UnknownNode = thisIsLeft ? other : (this as any)
		const intersections = l.impl.intersect
		const intersector = intersections[r.kind] ?? intersections.default
		const result = intersector?.(l, r as never)
		if (result) {
			if (result instanceof Disjoint) {
				return thisIsLeft ? result : result.invert()
			}
			// TODO: meta
			return this.$.parseNode(l.kind, result) as never
		}
		return null
	}

	transform(
		mapper: DeepNodeTransformation,
		shouldTransform: (node: Node) => boolean
	): Node<reducibleKindOf<this["kind"]>> {
		if (!shouldTransform(this as never)) {
			return this as never
		}
		const innerWithTransformedChildren = map(this.inner as Dict, (k, v) => [
			k,
			this.impl.keys[k].child
				? isArray(v)
					? v.map((node) => (node as Node).transform(mapper, shouldTransform))
					: (v as Node).transform(mapper, shouldTransform)
				: v
		])
		return this.$.parseNode(
			this.kind,
			mapper(this.kind, innerWithTransformedChildren as never) as never
		)
	}

	compileApplyInvocation(ctx: CompilationContext) {
		return `this.${this.name}(${ctx.dataArg}, ${ctx.ctxArg})`
	}

	compileAllowsInvocation(ctx: CompilationContext) {
		return `this.${this.name}(${ctx.dataArg})`
	}
}

export type DeepNodeTransformation = <kind extends NodeKind>(
	kind: kind,
	inner: Inner<kind>
) => Inner<kind>

interface NodesByKind<t = any> {
	union: UnionNode<t>
	morph: MorphNode<t>
	intersection: IntersectionNode<t>
	unit: UnitNode<t>
	proto: ProtoNode<t>
	domain: DomainNode<t>
	divisor: DivisorNode
	min: MinNode
	max: MaxNode
	minLength: MinLengthNode
	maxLength: MaxLengthNode
	after: AfterNode
	before: BeforeNode
	pattern: PatternNode
	predicate: PredicateNode
	required: RequiredNode
	optional: OptionalNode
	index: IndexNode
	sequence: SequenceNode
}

export type Node<
	kind extends NodeKind = NodeKind,
	t = any
> = NodesByKind<t>[kind]

export type TypeNode<t = any, kind extends TypeKind = TypeKind> = Node<kind, t>

export type TypeSchema<kind extends TypeKind = TypeKind> = Schema<kind>
