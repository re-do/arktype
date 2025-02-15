import {
	flatMorph,
	hasDomain,
	isEmptyObject,
	isKeyOf,
	throwParseError,
	type array,
	type listable,
	type mutable,
	type show
} from "@ark/util"
import {
	constraintKeyParser,
	flattenConstraints,
	intersectConstraints
} from "../constraint.ts"
import type {
	nodeOfKind,
	NodeSchema,
	Prerequisite,
	RootSchema
} from "../kinds.ts"
import type { PredicateNode } from "../predicate.ts"
import type { NodeCompiler } from "../shared/compile.ts"
import type {
	BaseErrorContext,
	BaseNormalizedSchema,
	declareNode
} from "../shared/declare.ts"
import { Disjoint } from "../shared/disjoint.ts"
import type { ArkError } from "../shared/errors.ts"
import {
	implementNode,
	structureKeys,
	type ConstraintKind,
	type IntersectionContext,
	type nodeImplementationOf,
	type OpenNodeKind,
	type RefinementKind,
	type StructuralKind
} from "../shared/implement.ts"
import { intersectOrPipeNodes } from "../shared/intersections.ts"
import type { JsonSchema } from "../shared/jsonSchema.ts"
import type { TraverseAllows, TraverseApply } from "../shared/traversal.ts"
import {
	hasArkKind,
	isNode,
	type makeRootAndArrayPropertiesMutable
} from "../shared/utils.ts"
import type { Sequence } from "../structure/sequence.ts"
import type {
	Structure,
	UndeclaredKeyBehavior
} from "../structure/structure.ts"
import type { Domain } from "./domain.ts"
import type { Morph } from "./morph.ts"
import type { Proto } from "./proto.ts"
import { BaseRoot } from "./root.ts"
import { defineRightwardIntersections } from "./utils.ts"

export declare namespace Intersection {
	export type BasisKind = "domain" | "proto"

	export type ChildKind = BasisKind | RefinementKind | "predicate" | "structure"

	export type FlattenedChildKind = ChildKind | StructuralKind

	export type RefinementsInner = {
		[k in RefinementKind]?: intersectionChildInnerValueOf<k>
	}

	export interface Inner extends RefinementsInner {
		domain?: Domain.Node
		proto?: Proto.Node
		structure?: Structure.Node
		predicate?: array<PredicateNode>
	}

	export namespace Inner {
		export type mutable = makeRootAndArrayPropertiesMutable<Inner>
	}

	export type ConstraintsSchema<inferredBasis = any> = show<
		BaseNormalizedSchema & {
			domain?: Domain.Schema
			proto?: Proto.Schema
		} & conditionalRootOf<inferredBasis>
	>

	export type NormalizedSchema = Omit<
		ConstraintsSchema,
		StructuralKind | "undeclared"
	>

	export type Schema<inferredBasis = any> = ConstraintsSchema<inferredBasis>

	export interface AstSchema extends BaseNormalizedSchema {
		intersection: readonly RootSchema[]
	}

	export interface ErrorContext
		extends BaseErrorContext<"intersection">,
			Inner {
		errors: readonly ArkError[]
	}

	export type Declaration = declareNode<{
		kind: "intersection"
		schema: Schema
		normalizedSchema: NormalizedSchema
		inner: Inner
		reducibleTo: "intersection" | BasisKind
		errorContext: ErrorContext
		childKind: ChildKind
	}>

	export type Node = IntersectionNode
}

const implementation: nodeImplementationOf<Intersection.Declaration> =
	implementNode<Intersection.Declaration>({
		kind: "intersection",
		hasAssociatedError: true,
		normalize: rawSchema => {
			if (isNode(rawSchema)) return rawSchema

			const { structure, ...schema } = rawSchema
			const hasRootStructureKey = !!structure
			const normalizedStructure = (structure as mutable<Structure.Schema>) ?? {}
			const normalized = flatMorph(schema, (k, v) => {
				if (isKeyOf(k, structureKeys)) {
					if (hasRootStructureKey) {
						throwParseError(
							`Flattened structure key ${k} cannot be specified alongside a root 'structure' key.`
						)
					}
					normalizedStructure[k] = v as never
					return []
				}
				return [k, v]
			}) as mutable<Intersection.NormalizedSchema>
			if (
				hasArkKind(normalizedStructure, "constraint") ||
				!isEmptyObject(normalizedStructure)
			)
				normalized.structure = normalizedStructure
			return normalized
		},
		finalizeInnerJson: ({ structure, ...rest }) =>
			hasDomain(structure, "object") ? { ...structure, ...rest } : rest,
		keys: {
			domain: {
				child: true,
				parse: (schema, ctx) => ctx.$.node("domain", schema)
			},
			proto: {
				child: true,
				parse: (schema, ctx) => ctx.$.node("proto", schema)
			},
			structure: {
				child: true,
				parse: (schema, ctx) => ctx.$.node("structure", schema),
				serialize: node => {
					if (!node.sequence?.minLength) return node.collapsibleJson
					const { sequence, ...structureJson } = node.collapsibleJson as any
					const { minVariadicLength, ...sequenceJson } =
						sequence as Sequence.NormalizedSchema
					const collapsibleSequenceJson =
						sequenceJson.variadic && Object.keys(sequenceJson).length === 1 ?
							sequenceJson.variadic
						:	sequenceJson
					return { ...structureJson, sequence: collapsibleSequenceJson }
				}
			},
			divisor: {
				child: true,
				parse: constraintKeyParser("divisor")
			},
			max: {
				child: true,
				parse: constraintKeyParser("max")
			},
			min: {
				child: true,
				parse: constraintKeyParser("min")
			},
			maxLength: {
				child: true,
				parse: constraintKeyParser("maxLength")
			},
			minLength: {
				child: true,
				parse: constraintKeyParser("minLength")
			},
			exactLength: {
				child: true,
				parse: constraintKeyParser("exactLength")
			},
			before: {
				child: true,
				parse: constraintKeyParser("before")
			},
			after: {
				child: true,
				parse: constraintKeyParser("after")
			},
			pattern: {
				child: true,
				parse: constraintKeyParser("pattern")
			},
			predicate: {
				child: true,
				parse: constraintKeyParser("predicate")
			}
		},
		// leverage reduction logic from intersection and identity to ensure initial
		// parse result is reduced
		reduce: (inner, $) =>
			// we cast union out of the result here since that only occurs when intersecting two sequences
			// that cannot occur when reducing a single intersection schema using unknown
			intersectIntersections({}, inner, {
				$,
				invert: false,
				pipe: false
			}) as nodeOfKind<"intersection" | Intersection.BasisKind>,
		defaults: {
			description: node => {
				if (node.children.length === 0) return "unknown"
				if (node.structure) return node.structure.description

				const childDescriptions: string[] = []

				if (
					node.basis &&
					!node.refinements.some(r => r.impl.obviatesBasisDescription)
				)
					childDescriptions.push(node.basis.description)

				if (node.refinements.length) {
					const sortedRefinementDescriptions = node.refinements
						// override alphabetization to describe min before max
						.toSorted((l, r) => (l.kind === "min" && r.kind === "max" ? -1 : 0))
						.map(r => r.description)
					childDescriptions.push(...sortedRefinementDescriptions)
				}

				if (node.inner.predicate) {
					childDescriptions.push(
						...node.inner.predicate.map(p => p.description)
					)
				}

				return childDescriptions.join(" and ")
			},
			expected: source =>
				`  • ${source.errors.map(e => e.expected).join("\n  • ")}`,
			problem: ctx => `(${ctx.actual}) must be...\n${ctx.expected}`
		},
		intersections: {
			intersection: (l, r, ctx) =>
				intersectIntersections(l.inner, r.inner, ctx),
			...defineRightwardIntersections("intersection", (l, r, ctx) => {
				// if l is unknown, return r
				if (l.children.length === 0) return r

				const { domain, proto, ...lInnerConstraints } = l.inner

				const lBasis = proto ?? domain

				const basis = lBasis ? intersectOrPipeNodes(lBasis, r, ctx) : r

				return (
					basis instanceof Disjoint ? basis
					: l?.basis?.equals(basis) ?
						// if the basis doesn't change, return the original intesection
						l
						// given we've already precluded l being unknown, the result must
						// be an intersection with the new basis result integrated
					:	l.$.node(
							"intersection",
							{ ...lInnerConstraints, [basis.kind]: basis },
							{ prereduced: true }
						)
				)
			})
		}
	})

export class IntersectionNode extends BaseRoot<Intersection.Declaration> {
	basis: nodeOfKind<Intersection.BasisKind> | null =
		this.inner.domain ?? this.inner.proto ?? null

	refinements: array<nodeOfKind<RefinementKind>> = this.children.filter(node =>
		node.isRefinement()
	)

	structure: Structure.Node | undefined = this.inner.structure

	expression: string = writeIntersectionExpression(this)

	get shallowMorphs(): array<Morph> {
		return this.inner.structure?.structuralMorph ?
				[this.inner.structure.structuralMorph]
			:	[]
	}

	get shortDescription(): string {
		return this.basis?.shortDescription ?? "present"
	}

	protected innerToJsonSchema(): JsonSchema {
		return this.children.reduce(
			// cast is required since TS doesn't know children have compatible schema prerequisites
			(schema, child) =>
				child.isBasis() ?
					child.toJsonSchema()
				:	child.reduceJsonSchema(schema as never),
			{}
		)
	}

	traverseAllows: TraverseAllows = (data, ctx) =>
		this.children.every(child => child.traverseAllows(data as never, ctx))

	traverseApply: TraverseApply = (data, ctx) => {
		const errorCount = ctx.currentErrorCount
		if (this.basis) {
			this.basis.traverseApply(data, ctx)
			if (ctx.currentErrorCount > errorCount) return
		}
		if (this.refinements.length) {
			for (let i = 0; i < this.refinements.length - 1; i++) {
				this.refinements[i].traverseApply(data as never, ctx)
				if (ctx.failFast && ctx.currentErrorCount > errorCount) return
			}
			this.refinements.at(-1)!.traverseApply(data as never, ctx)
			if (ctx.currentErrorCount > errorCount) return
		}
		if (this.structure) {
			this.structure.traverseApply(data as never, ctx)
			if (ctx.currentErrorCount > errorCount) return
		}
		if (this.inner.predicate) {
			for (let i = 0; i < this.inner.predicate.length - 1; i++) {
				this.inner.predicate[i].traverseApply(data as never, ctx)
				if (ctx.failFast && ctx.currentErrorCount > errorCount) return
			}
			this.inner.predicate.at(-1)!.traverseApply(data as never, ctx)
		}
	}

	compile(js: NodeCompiler): void {
		if (js.traversalKind === "Allows") {
			this.children.forEach(child => js.check(child))
			js.return(true)
			return
		}

		js.initializeErrorCount()

		if (this.basis) {
			js.check(this.basis)
			// we only have to return conditionally if this is not the last check
			if (this.children.length > 1) js.returnIfFail()
		}
		if (this.refinements.length) {
			for (let i = 0; i < this.refinements.length - 1; i++) {
				js.check(this.refinements[i])
				js.returnIfFailFast()
			}
			js.check(this.refinements.at(-1)!)
			if (this.structure || this.inner.predicate) js.returnIfFail()
		}
		if (this.structure) {
			js.check(this.structure)
			if (this.inner.predicate) js.returnIfFail()
		}
		if (this.inner.predicate) {
			for (let i = 0; i < this.inner.predicate.length - 1; i++) {
				js.check(this.inner.predicate[i])
				// since predicates can be chained, we have to fail immediately
				// if one fails
				js.returnIfFail()
			}
			js.check(this.inner.predicate.at(-1)!)
		}
	}
}

export const Intersection = {
	implementation,
	Node: IntersectionNode
}

const writeIntersectionExpression = (node: Intersection.Node) => {
	let expression =
		node.structure?.expression ||
		`${node.basis ? node.basis.nestableExpression + " " : ""}${node.refinements.map(n => n.expression).join(" & ")}` ||
		"unknown"
	if (expression === "Array == 0") expression = "[]"
	return expression
}

const intersectIntersections = (
	l: Intersection.Inner,
	r: Intersection.Inner,
	ctx: IntersectionContext
): BaseRoot | Disjoint => {
	const baseInner: Intersection.Inner.mutable = {}

	const lBasis = l.proto ?? l.domain
	const rBasis = r.proto ?? r.domain
	const basisResult =
		lBasis ?
			rBasis ?
				(intersectOrPipeNodes(
					lBasis,
					rBasis,
					ctx
				) as nodeOfKind<Intersection.BasisKind>)
			:	lBasis
		:	rBasis
	if (basisResult instanceof Disjoint) return basisResult

	if (basisResult) baseInner[basisResult.kind] = basisResult as never

	return intersectConstraints({
		kind: "intersection",
		baseInner,
		l: flattenConstraints(l),
		r: flattenConstraints(r),
		roots: [],
		ctx
	})
}

export type ConditionalTerminalIntersectionRoot = {
	undeclared?: UndeclaredKeyBehavior
}

type ConditionalTerminalIntersectionKey =
	keyof ConditionalTerminalIntersectionRoot

type ConditionalIntersectionKey =
	| ConstraintKind
	| ConditionalTerminalIntersectionKey

export type constraintKindOf<t> = {
	[k in ConstraintKind]: t extends Prerequisite<k> ? k : never
}[ConstraintKind]

type conditionalIntersectionKeyOf<t> =
	| constraintKindOf<t>
	| (t extends object ? "undeclared" : never)

type intersectionChildSchemaValueOf<k extends Intersection.FlattenedChildKind> =
	k extends OpenNodeKind ? listable<NodeSchema<k>> : NodeSchema<k>

type conditionalSchemaValueOfKey<k extends ConditionalIntersectionKey> =
	k extends Intersection.FlattenedChildKind ? intersectionChildSchemaValueOf<k>
	:	ConditionalTerminalIntersectionRoot[k & ConditionalTerminalIntersectionKey]

type intersectionChildInnerValueOf<k extends Intersection.FlattenedChildKind> =
	k extends OpenNodeKind ? readonly nodeOfKind<k>[] : nodeOfKind<k>

export type conditionalRootOf<t> = {
	[k in conditionalIntersectionKeyOf<t>]?: conditionalSchemaValueOfKey<k>
}
