import {
	isKeyOf,
	type PartialRecord,
	type extend,
	type optionalizeKeys,
	type valueOf
} from "@arktype/util"
import type { Node, NodeSubclass } from "../base.js"
import type { Declaration, hasOpenIntersection } from "../kinds.js"
import type { CompilationContext } from "../scope.js"
import type {
	BaseNodeDeclaration,
	declareNode,
	withBaseMeta
} from "../shared/declare.js"
import type { BoundKind, NodeImplementation } from "../shared/define.js"
import { Disjoint } from "../shared/disjoint.js"
import type { NodeIntersections } from "../shared/intersect.js"
import { BaseRefinement } from "./refinement.js"

export type BoundInner<limit extends LimitSchemaValue = LimitSchemaValue> = {
	readonly limit: limit
	readonly exclusive?: true
}

export type LimitSchemaValue = number | string

export type NormalizedBoundSchema<
	limit extends LimitSchemaValue = LimitSchemaValue
> = withBaseMeta<{
	readonly limit: limit
	readonly exclusive?: boolean
}>

export type BoundSchema<limit extends LimitSchemaValue = LimitSchemaValue> =
	| limit
	| NormalizedBoundSchema<limit>

export type LimitKind = "lower" | "upper"

export type RelativeComparator<kind extends LimitKind = LimitKind> = {
	lower: ">" | ">="
	upper: "<" | "<="
}[kind]

export const negatedComparators = {
	"<": ">=",
	"<=": ">",
	">": "<=",
	">=": "<"
} as const satisfies Record<RelativeComparator, RelativeComparator>

export const boundKindPairsByLower = {
	min: "max",
	minLength: "maxLength",
	after: "before"
} as const satisfies PartialRecord<BoundKind, BoundKind>

export type LowerBoundKind = keyof typeof boundKindPairsByLower

export type LowerNode = Node<LowerBoundKind>

export type UpperBoundKind = valueOf<typeof boundKindPairsByLower>

export type UpperNode = Node<UpperBoundKind>

export type NumericallyBoundable = string | number | readonly unknown[]

export type Boundable = NumericallyBoundable | Date

const normalizeLimit = (limit: LimitSchemaValue): number =>
	typeof limit === "string" ? new Date(limit).valueOf() : limit

const createLowerIntersections = <kind extends LowerBoundKind>(kind: kind) =>
	({
		// symmetric lower bound intersection
		[kind]: (l: LowerNode, r: LowerNode): LowerNode =>
			l.limit > r.limit || (l.limit === r.limit && l.exclusive) ? l : r,
		// asymmetric bound intersections are handled by the lower bound
		[boundKindPairsByLower[kind]]: (
			l: LowerNode,
			r: UpperNode
		): Disjoint | null =>
			l.limit > r.limit || (l.limit === r.limit && (l.exclusive || r.exclusive))
				? Disjoint.from("bound", l, r)
				: null
	}) as {} as NodeIntersections<Declaration<kind>>

const createUpperIntersections = <kind extends UpperBoundKind>(kind: kind) =>
	({
		// symmetric upper bound intersection
		[kind]: (l: UpperNode, r: UpperNode): Node<UpperBoundKind> =>
			l.limit < r.limit || (l.limit === r.limit && l.exclusive) ? l : r
	}) as {} as NodeIntersections<Declaration<kind>>

export type BaseBoundDeclaration = extend<
	BaseNodeDeclaration,
	{
		kind: BoundKind
		inner: BoundInner
	}
>

export const implementBound = <d extends Declaration<BoundKind>>(
	implementation: optionalizeKeys<
		NodeImplementation<d>,
		"collapseKey" | "keys" | "normalize"
	>
) =>
	({
		collapseKey: "limit",
		keys: {
			limit: {
				parse: normalizeLimit
			},
			exclusive: {
				// omit key with value false since it is the default
				parse: (flag: boolean) => flag || undefined
			}
		},
		normalize: (schema: d["schema"]) =>
			typeof schema === "object"
				? { ...schema, limit: schema.limit }
				: { limit: schema as Extract<d["schema"], LimitSchemaValue> },
		...implementation
	}) as const

export abstract class BaseBound<
	d extends BaseBoundDeclaration,
	subclass extends NodeSubclass<d>
> extends BaseRefinement<d, subclass> {
	readonly hasOpenIntersection = false as hasOpenIntersection<d>

	comparator = compileComparator(
		this.kind,
		this.exclusive
		// cast to lower bound comparator for internal checking
	)

	compileBody(ctx: CompilationContext) {
		return this.$.compilePrimitive(this as never, ctx)
	}
}

const compileComparator = (kind: BoundKind, exclusive: true | undefined) =>
	`${isKeyOf(kind, boundKindPairsByLower) ? ">" : "<"}${
		exclusive ? "" : "="
	}` as const

abstract class BaseNumericBound<
	d extends BaseBoundDeclaration,
	subclass extends NodeSubclass<d>
> extends BaseBound<d, subclass> {
	compiledActual = this.$.dataName
	compiledCondition = `${this.compiledActual} ${this.comparator} ${this.limit}`
	compiledNegation = `${this.compiledActual} ${
		negatedComparators[this.comparator]
	} ${this.limit}`

	getCheckedDefinitions() {
		return ["number"] as const
	}
}

export type MinDeclaration = declareNode<{
	kind: "min"
	schema: BoundSchema<number>
	normalizedSchema: NormalizedBoundSchema<number>
	inner: BoundInner<number>
	prerequisite: number
	intersections: {
		min: "min"
		max: Disjoint | null
	}
}>

export class MinNode extends BaseNumericBound<MinDeclaration, typeof MinNode> {
	static implementation: NodeImplementation<MinDeclaration> = implementBound({
		intersections: createLowerIntersections("min"),
		describeExpected(node) {
			return `${node.exclusive ? "more than" : "at least"} ${node.limit}`
		}
	})

	traverseAllows = this.exclusive
		? (data: number) => data > this.limit
		: (data: number) => data >= this.limit
}

export type MaxDeclaration = declareNode<{
	kind: "max"
	schema: BoundSchema<number>
	normalizedSchema: NormalizedBoundSchema<number>
	inner: BoundInner<number>
	prerequisite: number
	intersections: {
		// TODO: Fix rightOf
		max: "max"
	}
}>

export class MaxNode extends BaseNumericBound<MaxDeclaration, typeof MaxNode> {
	static implementation: NodeImplementation<MaxDeclaration> = implementBound({
		intersections: createUpperIntersections("max"),
		describeExpected(node) {
			return `${node.exclusive ? "less than" : "at most"} ${node.limit}`
		}
	})

	traverseAllows = this.exclusive
		? (data: number) => data < this.limit
		: (data: number) => data <= this.limit
}

abstract class BaseLengthBound<
	d extends BaseBoundDeclaration,
	subclass extends NodeSubclass<d>
> extends BaseBound<d, subclass> {
	compiledActual = `${this.$.dataName}.length`
	compiledCondition = `${this.compiledActual} ${this.comparator} ${this.limit}`
	compiledNegation = `${this.compiledActual} ${
		negatedComparators[this.comparator]
	} ${this.limit}`

	getCheckedDefinitions() {
		return ["string", Array] as const
	}
}

export type MinLengthDeclaration = declareNode<{
	kind: "minLength"
	schema: BoundSchema<number>
	normalizedSchema: NormalizedBoundSchema<number>
	inner: BoundInner<number>
	prerequisite: string | readonly unknown[]
	intersections: {
		minLength: "minLength"
		maxLength: Disjoint | null
	}
}>

export class MinLengthNode extends BaseLengthBound<
	MinLengthDeclaration,
	typeof MinLengthNode
> {
	static implementation: NodeImplementation<MinLengthDeclaration> =
		implementBound({
			intersections: createLowerIntersections("minLength"),
			describeActual(data) {
				return `${data.length}`
			},
			describeExpected(node) {
				return node.exclusive
					? node.limit === 0
						? "non-empty"
						: `more than length ${node.limit}`
					: node.limit === 1
					  ? "non-empty"
					  : `at least length ${node.limit}`
			}
		})

	traverseAllows = this.exclusive
		? (data: string | readonly unknown[]) => data.length > this.limit
		: (data: string | readonly unknown[]) => data.length >= this.limit
}

export type MaxLengthDeclaration = declareNode<{
	kind: "maxLength"
	schema: BoundSchema<number>
	normalizedSchema: NormalizedBoundSchema<number>
	inner: BoundInner<number>
	prerequisite: string | readonly unknown[]
	intersections: {
		maxLength: "maxLength"
	}
}>

export class MaxLengthNode extends BaseLengthBound<
	MaxLengthDeclaration,
	typeof MaxLengthNode
> {
	static implementation: NodeImplementation<MaxLengthDeclaration> =
		implementBound({
			intersections: createUpperIntersections("maxLength"),
			describeActual(data) {
				return `${data.length}`
			},
			describeExpected(node) {
				return node.exclusive
					? `less than length ${node.limit}`
					: `at most length ${node.limit}`
			}
		})

	traverseAllows = this.exclusive
		? (data: string | readonly unknown[]) => data.length < this.limit
		: (data: string | readonly unknown[]) => data.length <= this.limit
}

abstract class BaseDateBound<
	d extends BaseBoundDeclaration,
	subclass extends NodeSubclass<d>
> extends BaseBound<d, subclass> {
	compiledActual = `${this.$.dataName}.valueOf()`
	compiledCondition = `${this.compiledActual} ${this.comparator} ${this.limit}`
	compiledNegation = `${this.compiledActual} ${
		negatedComparators[this.comparator]
	} ${this.limit}`

	dateLimit = new Date(this.limit)
	numericLimit = +this.dateLimit
	limitString =
		typeof this.limit === "string"
			? this.limit
			: this.dateLimit.toLocaleString()

	getCheckedDefinitions() {
		return [Date] as const
	}
}

const dateLimitToString = (limit: LimitSchemaValue) =>
	typeof limit === "string" ? limit : new Date(limit).toLocaleString()

export type AfterDeclaration = declareNode<{
	kind: "after"
	schema: BoundSchema<string | number>
	normalizedSchema: NormalizedBoundSchema<string | number>
	inner: BoundInner<string | number>
	prerequisite: Date
	intersections: {
		after: "after"
	}
}>

export class AfterNode extends BaseDateBound<
	AfterDeclaration,
	typeof AfterNode
> {
	static implementation: NodeImplementation<AfterDeclaration> = implementBound({
		intersections: createLowerIntersections("after"),
		describeActual(data) {
			return data.toLocaleString()
		},
		describeExpected(inner) {
			const limitString = dateLimitToString(inner.limit)
			return inner.exclusive
				? `after ${limitString}`
				: `${limitString} or later`
		}
	})

	traverseAllows = this.exclusive
		? (data: Date) => +data > this.numericLimit
		: (data: Date) => +data >= this.numericLimit
}

export type BeforeDeclaration = declareNode<{
	kind: "before"
	schema: BoundSchema<string | number>
	normalizedSchema: NormalizedBoundSchema<string | number>
	inner: BoundInner<string | number>
	prerequisite: Date
	intersections: {
		before: "before"
		after: Disjoint | null
	}
}>

export class BeforeNode extends BaseDateBound<
	BeforeDeclaration,
	typeof BeforeNode
> {
	static implementation: NodeImplementation<BeforeDeclaration> = implementBound(
		{
			intersections: createUpperIntersections("before"),
			describeActual(data) {
				return data.toLocaleString()
			},
			describeExpected(inner) {
				const limitString = dateLimitToString(inner.limit)
				return inner.exclusive
					? `before ${limitString}`
					: `${limitString} or earlier`
			}
		}
	)

	traverseAllows = this.exclusive
		? (data: Date) => +data < this.numericLimit
		: (data: Date) => +data <= this.numericLimit
}

export type BoundDeclarations = {
	min: MinDeclaration
	max: MaxDeclaration
	minLength: MinLengthDeclaration
	maxLength: MaxLengthDeclaration
	after: AfterDeclaration
	before: BeforeDeclaration
}

export const BoundNodes = {
	min: MinNode,
	max: MaxNode,
	minLength: MinLengthNode,
	maxLength: MaxLengthNode,
	after: AfterNode,
	before: BeforeNode
}
