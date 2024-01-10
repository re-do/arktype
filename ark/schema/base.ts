import {
	DynamicBase,
	includes,
	isArray,
	throwInternalError,
	type Constructor,
	type Dict,
	type Entry,
	type Json,
	type JsonData,
	type entriesOf,
	type listable
} from "@arktype/util"
import type {
	Declaration,
	Schema,
	hasOpenIntersection,
	ioKindOf
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
import type {
	CompilationContext,
	ScopeNode,
	TraverseAllows,
	TraverseApply
} from "./scope.js"
import type {
	BaseMeta,
	BaseNodeDeclaration,
	attachmentsOf
} from "./shared/declare.js"
import {
	basisKinds,
	constraintKinds,
	refinementKinds,
	setKinds,
	typeKinds,
	type BaseNodeImplementationInput,
	type BasisKind,
	type ConstraintKind,
	type NodeKind,
	type RefinementKind,
	type SetKind,
	type TypeKind,
	type nodeImplementationInputOf,
	type nodeImplementationOf
} from "./shared/define.js"
import { Disjoint } from "./shared/disjoint.js"
import { leftOperandOf, type intersectionOf } from "./shared/intersect.js"
import { TraversalContext } from "./traversal/context.js"
import type { ArkResult } from "./traversal/errors.js"
import type { DomainNode } from "./types/domain.js"
import type {
	IntersectionInner,
	IntersectionNode
} from "./types/intersection.js"
import type {
	MorphNode,
	distill,
	extractIn,
	extractOut
} from "./types/morph.js"
import type { ProtoNode } from "./types/proto.js"
import type { UnionNode } from "./types/union.js"
import type { UnitNode } from "./types/unit.js"

export interface BaseAttachments {
	alias?: string
	readonly kind: NodeKind
	readonly id: string
	readonly inner: Dict
	readonly meta: BaseMeta & Dict
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
		readonly implementation: nodeImplementationInputOf<d>
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
	): nodeImplementationOf<kindOf<self>>
	// typing the parameter as any is required for signature compatibility
	protected static implement(_: never): any {
		const implementation: BaseNodeImplementationInput = _
		implementation.defaults.error ??= (ctx) => `must be ${ctx.expected}`
		return implementation
	}

	private readonly impl: BaseNodeImplementationInput = (this.constructor as any)
		.implementation

	readonly includesMorph: boolean =
		this.kind === "morph" || this.children.some((child) => child.includesMorph)
	readonly includesContextDependentPredicate: boolean =
		// if a predicate accepts exactly one arg, we can safely skip passing context
		(this.hasKind("predicate") && this.inner.predicate.length !== 1) ||
		this.children.some((child) => child.includesContextDependentPredicate)
	readonly referencesById: Record<string, Node> = this.children.reduce(
		(result, child) => Object.assign(result, child.contributesReferencesById),
		{}
	)
	readonly references: readonly Node[] = Object.values(this.referencesById)
	readonly contributesReferencesById: Record<string, Node>
	readonly contributesReferences: readonly Node[]

	constructor(baseAttachments: BaseAttachments) {
		super(baseAttachments as never)
		this.contributesReferencesById =
			this.id in this.referencesById
				? this.referencesById
				: { ...this.referencesById, [this.id]: this as never }
		this.contributesReferences = Object.values(this.contributesReferencesById)
	}

	abstract hasOpenIntersection: hasOpenIntersection<d>
	abstract traverseAllows: TraverseAllows<d["prerequisite"]>
	abstract traverseApply: TraverseApply<d["prerequisite"]>
	abstract compileBody(ctx: CompilationContext): string

	allows = (data: d["prerequisite"]): data is distill<extractIn<t>> => {
		const ctx = new TraversalContext(data)
		return this.traverseAllows(data as never, ctx)
	}

	apply(data: d["prerequisite"]): ArkResult<distill<extractOut<t>>> {
		const ctx = new TraversalContext(data)
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

	private descriptionCache?: string
	get expected() {
		this.descriptionCache ??=
			this.meta.expected ?? this.impl.defaults.expected(this as never)
		return this.descriptionCache
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
		return this.expected
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
		const intersections = l.impl.intersections
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
}

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
