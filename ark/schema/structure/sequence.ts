import {
	append,
	conflatenate,
	printable,
	throwInternalError,
	throwParseError,
	type array,
	type mutable,
	type satisfy
} from "@ark/util"
import { BaseConstraint } from "../constraint.ts"
import type { RootSchema, mutableInnerOfKind } from "../kinds.ts"
import {
	appendUniqueFlatRefs,
	flatRef,
	type BaseNode,
	type DeepNodeTransformContext,
	type DeepNodeTransformation,
	type FlatRef
} from "../node.ts"
import type { ExactLengthNode } from "../refinements/exactLength.ts"
import type { MaxLengthNode } from "../refinements/maxLength.ts"
import type { MinLengthNode } from "../refinements/minLength.ts"
import type { Morph } from "../roots/morph.ts"
import type { BaseRoot } from "../roots/root.ts"
import type { NodeCompiler } from "../shared/compile.ts"
import type { BaseNormalizedSchema, declareNode } from "../shared/declare.ts"
import { Disjoint } from "../shared/disjoint.ts"
import {
	defaultValueSerializer,
	implementNode,
	type IntersectionContext,
	type RootKind,
	type nodeImplementationOf
} from "../shared/implement.ts"
import { intersectOrPipeNodes } from "../shared/intersections.ts"
import { JsonSchema } from "../shared/jsonSchema.ts"
import { $ark, registeredReference } from "../shared/registry.ts"
import {
	traverseKey,
	type TraverseAllows,
	type TraverseApply
} from "../shared/traversal.ts"
import {
	assertDefaultValueAssignability,
	computeDefaultValueMorph
} from "./optional.ts"
import { writeDefaultIntersectionMessage } from "./prop.ts"

export declare namespace Sequence {
	export interface NormalizedSchema extends BaseNormalizedSchema {
		readonly prefix?: array<RootSchema>
		readonly defaultables?: array<DefaultableSchema>
		readonly optionals?: array<RootSchema>
		readonly variadic?: RootSchema
		readonly minVariadicLength?: number
		readonly postfix?: array<RootSchema>
	}

	export type Schema = NormalizedSchema | RootSchema

	export type DefaultableSchema = [schema: RootSchema, defaultValue: unknown]

	export type DefaultableElement = [node: BaseRoot, defaultValue: unknown]

	export interface Inner {
		// a list of fixed position elements starting at index 0
		readonly prefix?: array<BaseRoot>
		// a list of optional elements with default values following prefix
		readonly defaultables?: array<DefaultableElement>
		// a list of optional elements without default values following defaultables
		readonly optionals?: array<BaseRoot>
		// the variadic element (only checked if all optional elements are present)
		readonly variadic?: BaseRoot
		readonly minVariadicLength?: number
		// a list of fixed position elements, the last being the last element of the array
		readonly postfix?: array<BaseRoot>
	}

	export interface Declaration
		extends declareNode<{
			kind: "sequence"
			schema: Schema
			normalizedSchema: NormalizedSchema
			inner: Inner
			prerequisite: array
			reducibleTo: "sequence"
			childKind: RootKind
		}> {}

	export type Node = SequenceNode
}

const implementation: nodeImplementationOf<Sequence.Declaration> =
	implementNode<Sequence.Declaration>({
		kind: "sequence",
		hasAssociatedError: false,
		collapsibleKey: "variadic",
		keys: {
			prefix: {
				child: true,
				parse: (schema, ctx) => {
					// empty affixes are omitted. an empty array should therefore
					// be specified as `{ proto: Array, length: 0 }`
					if (schema.length === 0) return undefined

					return schema.map(element => ctx.$.parseSchema(element))
				}
			},
			optionals: {
				child: true,
				parse: (schema, ctx) => {
					if (schema.length === 0) return undefined

					return schema.map(element => ctx.$.parseSchema(element))
				}
			},
			defaultables: {
				child: defaultables => defaultables.map(element => element[0]),
				parse: (defaultables, ctx) => {
					if (defaultables.length === 0) return undefined

					return defaultables.map(element => {
						const node = ctx.$.parseSchema(element[0])
						assertDefaultValueAssignability(node, element[1], null)
						return [node, element[1]]
					})
				},
				serialize: defaults =>
					defaults.map(element => [
						element[0].collapsibleJson,
						defaultValueSerializer(element[1])
					])
			},
			variadic: {
				child: true,
				parse: (schema, ctx) => ctx.$.parseSchema(schema, ctx)
			},
			minVariadicLength: {
				// minVariadicLength is reflected in the id of this node,
				// but not its IntersectionNode parent since it is superceded by the minLength
				// node it implies
				parse: min => (min === 0 ? undefined : min)
			},
			postfix: {
				child: true,
				parse: (schema, ctx) => {
					if (schema.length === 0) return undefined

					return schema.map(element => ctx.$.parseSchema(element))
				}
			}
		},
		normalize: schema => {
			if (typeof schema === "string") return { variadic: schema }

			if (
				"variadic" in schema ||
				"prefix" in schema ||
				"defaultables" in schema ||
				"optionals" in schema ||
				"postfix" in schema ||
				"minVariadicLength" in schema
			) {
				if (schema.postfix?.length) {
					if (!schema.variadic)
						return throwParseError(postfixWithoutVariadicMessage)

					if (schema.optionals?.length || schema.defaultables?.length)
						return throwParseError(postfixAfterOptionalOrDefaultableMessage)
				}
				if (schema.minVariadicLength && !schema.variadic) {
					return throwParseError(
						"minVariadicLength may not be specified without a variadic element"
					)
				}
				return schema
			}
			return { variadic: schema }
		},
		reduce: (raw, $) => {
			let minVariadicLength = raw.minVariadicLength ?? 0
			const prefix = raw.prefix?.slice() ?? []
			const defaultables = raw.defaultables?.slice() ?? []
			const optionals = raw.optionals?.slice() ?? []
			const postfix = raw.postfix?.slice() ?? []
			if (raw.variadic) {
				// optional elements equivalent to the variadic parameter are redundant
				while (optionals.at(-1)?.equals(raw.variadic)) optionals.pop()

				if (optionals.length === 0 && defaultables.length === 0) {
					// If there are no optional, normalize prefix
					// elements adjacent and equivalent to variadic:
					// 		{ variadic: number, prefix: [string, number] }
					// reduces to:
					// 		{ variadic: number, prefix: [string], minVariadicLength: 1 }
					while (prefix.at(-1)?.equals(raw.variadic)) {
						prefix.pop()
						minVariadicLength++
					}
				}
				// Normalize postfix elements adjacent and equivalent to variadic:
				// 		{ variadic: number, postfix: [number, number, 5] }
				// reduces to:
				// 		{ variadic: number, postfix: [5], minVariadicLength: 2 }
				while (postfix[0]?.equals(raw.variadic)) {
					postfix.shift()
					minVariadicLength++
				}
			} else if (optionals.length === 0 && defaultables.length === 0) {
				// if there's no variadic, optional or defaultable elements,
				// postfix can just be appended to prefix
				prefix.push(...postfix.splice(0))
			}
			if (
				// if any variadic adjacent elements were moved to minVariadicLength
				minVariadicLength !== raw.minVariadicLength ||
				// or any postfix elements were moved to prefix
				(raw.prefix && raw.prefix.length !== prefix.length)
			) {
				// reparse the reduced def
				return $.node(
					"sequence",
					{
						...raw,
						// empty lists will be omitted during parsing
						prefix,
						defaultables,
						optionals,
						postfix,
						minVariadicLength
					},
					{ prereduced: true }
				)
			}
		},
		defaults: {
			description: node => {
				if (node.isVariadicOnly) return `${node.variadic!.nestableExpression}[]`
				const innerDescription = node.tuple
					.map(element =>
						element.kind === "defaultables" ?
							`${element.node.nestableExpression} = ${printable(element.default)}`
						: element.kind === "optionals" ?
							`${element.node.nestableExpression}?`
						: element.kind === "variadic" ?
							`...${element.node.nestableExpression}[]`
						:	element.node.expression
					)
					.join(", ")
				return `[${innerDescription}]`
			}
		},
		intersections: {
			sequence: (l, r, ctx) => {
				const rootState = _intersectSequences({
					l: l.tuple,
					r: r.tuple,
					disjoint: new Disjoint(),
					result: [],
					fixedVariants: [],
					ctx
				})

				const viableBranches =
					rootState.disjoint.length === 0 ?
						[rootState, ...rootState.fixedVariants]
					:	rootState.fixedVariants

				return (
					viableBranches.length === 0 ? rootState.disjoint!
					: viableBranches.length === 1 ?
						ctx.$.node(
							"sequence",
							sequenceTupleToInner(viableBranches[0].result)
						)
					:	ctx.$.node(
							"union",
							viableBranches.map(state => ({
								proto: Array,
								sequence: sequenceTupleToInner(state.result)
							}))
						)
				)
			}

			// exactLength, minLength, and maxLength don't need to be defined
			// here since impliedSiblings guarantees they will be added
			// directly to the IntersectionNode parent of the SequenceNode
			// they exist on
		}
	})

export class SequenceNode extends BaseConstraint<Sequence.Declaration> {
	impliedBasis: BaseRoot = $ark.intrinsic.Array.internal

	tuple: SequenceTuple = sequenceInnerToTuple(this.inner)

	prefixLength: number = this.prefix?.length ?? 0
	defaultablesLength: number = this.defaultables?.length ?? 0
	optionalsLength: number = this.optionals?.length ?? 0
	postfixLength: number = this.postfix?.length ?? 0
	defaultablesAndOptionals: BaseRoot[] = []
	prevariadic: array<PrevariadicSequenceElement> = this.tuple.filter(
		(el): el is PrevariadicSequenceElement => {
			if (el.kind === "defaultables" || el.kind === "optionals") {
				// populate defaultablesAndOptionals while filtering prevariadic
				this.defaultablesAndOptionals.push(el.node)
				return true
			}

			return el.kind === "prefix"
		}
	)

	variadicOrPostfix: array<BaseRoot> = conflatenate(
		this.variadic && [this.variadic],
		this.postfix
	)

	// have to wait until prevariadic and variadicOrPostfix are set to calculate
	flatRefs: FlatRef[] = this.addFlatRefs()

	protected addFlatRefs(): FlatRef[] {
		appendUniqueFlatRefs(
			this.flatRefs,
			this.prevariadic.flatMap((element, i) =>
				append(
					element.node.flatRefs.map(ref =>
						flatRef([`${i}`, ...ref.path], ref.node)
					),
					flatRef([`${i}`], element.node)
				)
			)
		)

		appendUniqueFlatRefs(
			this.flatRefs,
			this.variadicOrPostfix.flatMap(element =>
				// a postfix index can't be directly represented as a type
				// key, so we just use the same matcher for variadic
				append(
					element.flatRefs.map(ref =>
						flatRef(
							[$ark.intrinsic.nonNegativeIntegerString.internal, ...ref.path],
							ref.node
						)
					),
					flatRef([$ark.intrinsic.nonNegativeIntegerString.internal], element)
				)
			)
		)

		return this.flatRefs
	}

	isVariadicOnly: boolean = this.prevariadic.length + this.postfixLength === 0
	minVariadicLength: number = this.inner.minVariadicLength ?? 0
	minLength: number =
		this.prefixLength + this.minVariadicLength + this.postfixLength
	minLengthNode: MinLengthNode | null =
		this.minLength === 0 ?
			null
			// cast is safe here as the only time this would not be a
			// MinLengthNode would be when minLength is 0
		:	(this.$.node("minLength", this.minLength) as never)
	maxLength: number | null = this.variadic ? null : this.tuple.length
	maxLengthNode: MaxLengthNode | ExactLengthNode | null =
		this.maxLength === null ? null : this.$.node("maxLength", this.maxLength)
	impliedSiblings: array<MaxLengthNode | MinLengthNode | ExactLengthNode> =
		this.minLengthNode ?
			this.maxLengthNode ?
				[this.minLengthNode, this.maxLengthNode]
			:	[this.minLengthNode]
		: this.maxLengthNode ? [this.maxLengthNode]
		: []

	defaultValueMorphs: Morph[] = getDefaultableMorphs(this)

	defaultValueMorphsReference =
		this.defaultValueMorphs.length ?
			registeredReference(this.defaultValueMorphs)
		:	undefined

	protected elementAtIndex(data: array, index: number): SequenceElement {
		if (index < this.prevariadic.length) return this.tuple[index]
		const firstPostfixIndex = data.length - this.postfixLength
		if (index >= firstPostfixIndex)
			return { kind: "postfix", node: this.postfix![index - firstPostfixIndex] }
		return {
			kind: "variadic",
			node:
				this.variadic ??
				throwInternalError(
					`Unexpected attempt to access index ${index} on ${this}`
				)
		}
	}

	// minLength/maxLength should be checked by Intersection before either traversal
	traverseAllows: TraverseAllows<array> = (data, ctx) => {
		for (let i = 0; i < data.length; i++) {
			if (!this.elementAtIndex(data, i).node.traverseAllows(data[i], ctx))
				return false
		}

		return true
	}

	traverseApply: TraverseApply<array> = (data, ctx) => {
		let i = 0
		for (; i < data.length; i++) {
			traverseKey(
				i,
				() => this.elementAtIndex(data, i).node.traverseApply(data[i], ctx),
				ctx
			)
		}
	}

	get element(): BaseRoot {
		return this.cacheGetter("element", this.$.node("union", this.children))
	}

	// minLength/maxLength compilation should be handled by Intersection
	compile(js: NodeCompiler): void {
		this.prefix?.forEach((node, i) =>
			js.traverseKey(`${i}`, `data[${i}]`, node)
		)

		this.defaultablesAndOptionals.forEach((node, i) => {
			const dataIndex = `${i + this.prefixLength}`
			js.if(`${dataIndex} >= ${js.data}.length`, () =>
				js.traversalKind === "Allows" ? js.return(true) : js.return()
			)
			js.traverseKey(dataIndex, `data[${dataIndex}]`, node)
		})

		if (this.variadic) {
			if (this.postfix) {
				js.const(
					"firstPostfixIndex",
					`${js.data}.length${this.postfix ? `- ${this.postfix.length}` : ""}`
				)
			}
			js.for(
				`i < ${this.postfix ? "firstPostfixIndex" : "data.length"}`,
				() => js.traverseKey("i", "data[i]", this.variadic!),
				this.prevariadic.length
			)
			this.postfix?.forEach((node, i) => {
				const keyExpression = `firstPostfixIndex + ${i}`
				js.traverseKey(keyExpression, `data[${keyExpression}]`, node)
			})
		}

		if (js.traversalKind === "Allows") js.return(true)
	}

	protected override _transform(
		mapper: DeepNodeTransformation,
		ctx: DeepNodeTransformContext
	): BaseNode | null {
		ctx.path.push($ark.intrinsic.nonNegativeIntegerString.internal)
		const result = super._transform(mapper, ctx)
		ctx.path.pop()
		return result
	}

	// this depends on tuple so needs to come after it
	expression: string = this.description

	reduceJsonSchema(schema: JsonSchema.Array): JsonSchema.Array {
		if (this.prefix)
			schema.prefixItems = this.prefix.map(node => node.toJsonSchema())

		if (this.optionals) {
			return JsonSchema.throwUnjsonifiableError(
				`Optional tuple element${this.optionalsLength > 1 ? "s" : ""} ${this.optionals.join(", ")}`
			)
		}

		if (this.variadic) {
			schema.items = this.variadic?.toJsonSchema()
			// length constraints will be enforced by items: false
			// for non-variadic arrays
			if (this.minLength) schema.minItems = this.minLength
			if (this.maxLength) schema.maxItems = this.maxLength
		} else {
			schema.items = false
			// delete min/maxLength constraints that will have been added by the
			// base intersection node to enforce fixed length
			delete schema.minItems
			delete schema.maxItems
		}

		if (this.postfix) {
			return JsonSchema.throwUnjsonifiableError(
				`Postfix tuple element${this.postfixLength > 1 ? "s" : ""} ${this.postfix.join(", ")}`
			)
		}

		return schema
	}
}

const defaultableMorphsCache: Record<string, Morph[] | undefined> = {}

const getDefaultableMorphs = (node: Sequence.Node): Morph[] => {
	if (!node.defaultables) return []

	const morphs: Morph[] = []
	let cacheKey = "["

	const lastDefaultableIndex = node.prefixLength + node.defaultablesLength - 1

	for (let i = node.prefixLength; i <= lastDefaultableIndex; i++) {
		const [elementNode, defaultValue] = node.defaultables[i - node.prefixLength]
		morphs.push(computeDefaultValueMorph(i, elementNode, defaultValue))
		cacheKey += `${i}: ${elementNode.id} = ${defaultValueSerializer(defaultValue)}, `
	}

	cacheKey += "]"

	return (defaultableMorphsCache[cacheKey] ??= morphs)
}

export const Sequence = {
	implementation,
	Node: SequenceNode
}

const sequenceInnerToTuple = (inner: Sequence.Inner): SequenceTuple => {
	const tuple: mutable<SequenceTuple> = []
	inner.prefix?.forEach(node => tuple.push({ kind: "prefix", node }))
	inner.defaultables?.forEach(([node, defaultValue]) =>
		tuple.push({ kind: "defaultables", node, default: defaultValue })
	)
	inner.optionals?.forEach(node => tuple.push({ kind: "optionals", node }))
	if (inner.variadic) tuple.push({ kind: "variadic", node: inner.variadic })
	inner.postfix?.forEach(node => tuple.push({ kind: "postfix", node }))
	return tuple
}

const sequenceTupleToInner = (tuple: SequenceTuple): Sequence.Inner =>
	tuple.reduce<mutableInnerOfKind<"sequence">>((result, element) => {
		if (element.kind === "variadic") result.variadic = element.node
		else if (element.kind === "defaultables") {
			result.defaultables = append(result.defaultables, [
				[element.node, element.default]
			])
		} else result[element.kind] = append(result[element.kind], element.node)

		return result
	}, {})

export const postfixAfterOptionalOrDefaultableMessage =
	"A postfix required element cannot follow an optional or defaultable element"

export type postfixAfterOptionalOrDefaultableMessage =
	typeof postfixAfterOptionalOrDefaultableMessage

export const postfixWithoutVariadicMessage =
	"A postfix element requires a variadic element"

export type postfixWithoutVariadicMessage = typeof postfixWithoutVariadicMessage

export type SequenceElement =
	| PrevariadicSequenceElement
	| VariadicSequenceElement
	| PostfixSequenceElement

export type SequenceElementKind = satisfy<
	keyof Sequence.Inner,
	SequenceElement["kind"]
>

export type PrevariadicSequenceElement =
	| PrefixSequenceElement
	| DefaultableSequenceElement
	| OptionalSequenceElement

export type PrefixSequenceElement = {
	kind: "prefix"
	node: BaseRoot
}

export type OptionalSequenceElement = {
	kind: "optionals"
	node: BaseRoot
}

export type PostfixSequenceElement = {
	kind: "postfix"
	node: BaseRoot
}

export type VariadicSequenceElement = {
	kind: "variadic"
	node: BaseRoot
}

export type DefaultableSequenceElement = {
	kind: "defaultables"
	node: BaseRoot
	default: unknown
}

export type SequenceTuple = array<SequenceElement>

type SequenceIntersectionState = {
	l: SequenceTuple
	r: SequenceTuple
	disjoint: Disjoint
	result: SequenceTuple
	fixedVariants: SequenceIntersectionState[]
	ctx: IntersectionContext
}

const _intersectSequences = (
	s: SequenceIntersectionState
): SequenceIntersectionState => {
	const [lHead, ...lTail] = s.l
	const [rHead, ...rTail] = s.r

	if (!lHead || !rHead) return s

	const lHasPostfix = lTail.at(-1)?.kind === "postfix"
	const rHasPostfix = rTail.at(-1)?.kind === "postfix"

	const kind: SequenceElementKind =
		lHead.kind === "prefix" || rHead.kind === "prefix" ? "prefix"
		: lHead.kind === "postfix" || rHead.kind === "postfix" ? "postfix"
		: lHead.kind === "variadic" && rHead.kind === "variadic" ? "variadic"
			// if either operand has postfix elements, the full-length
			// intersection can't include optional elements (though they may
			// exist in some of the fixed length variants)
		: lHasPostfix || rHasPostfix ? "prefix"
		: lHead.kind === "defaultables" || rHead.kind === "defaultables" ?
			"defaultables"
		:	"optionals"

	if (lHead.kind === "prefix" && rHead.kind === "variadic" && rHasPostfix) {
		const postfixBranchResult = _intersectSequences({
			...s,
			fixedVariants: [],
			r: rTail.map(element => ({ ...element, kind: "prefix" }))
		})
		if (postfixBranchResult.disjoint.length === 0)
			s.fixedVariants.push(postfixBranchResult)
	} else if (
		rHead.kind === "prefix" &&
		lHead.kind === "variadic" &&
		lHasPostfix
	) {
		const postfixBranchResult = _intersectSequences({
			...s,
			fixedVariants: [],
			l: lTail.map(element => ({ ...element, kind: "prefix" }))
		})
		if (postfixBranchResult.disjoint.length === 0)
			s.fixedVariants.push(postfixBranchResult)
	}

	const result = intersectOrPipeNodes(lHead.node, rHead.node, s.ctx)
	if (result instanceof Disjoint) {
		if (kind === "prefix" || kind === "postfix") {
			s.disjoint.push(
				...result.withPrefixKey(
					// ideally we could handle disjoint paths more precisely here,
					// but not trivial to serialize postfix elements as keys
					kind === "prefix" ? s.result.length : `-${lTail.length + 1}`,
					"required"
				)
			)
			s.result = [...s.result, { kind, node: $ark.intrinsic.never.internal }]
		} else if (kind === "optionals" || kind === "defaultables") {
			// if the element result is optional and unsatisfiable, the
			// intersection can still be satisfied as long as the tuple
			// ends before the disjoint element would occur
			return s
		} else {
			// if the element is variadic and unsatisfiable, the intersection
			// can be satisfied with a fixed length variant including zero
			// variadic elements
			return _intersectSequences({
				...s,
				fixedVariants: [],
				// if there were any optional elements, there will be no postfix elements
				// so this mapping will never occur (which would be illegal otherwise)
				l: lTail.map(element => ({ ...element, kind: "prefix" })),
				r: lTail.map(element => ({ ...element, kind: "prefix" }))
			})
		}
	} else if (kind === "defaultables") {
		if (
			lHead.kind === "defaultables" &&
			rHead.kind === "defaultables" &&
			lHead.default !== rHead.default
		) {
			throwParseError(
				writeDefaultIntersectionMessage(lHead.default, rHead.default)
			)
		}

		s.result = [
			...s.result,
			{
				kind,
				node: result,
				default:
					lHead.kind === "defaultables" ? lHead.default
					: rHead.kind === "defaultables" ? rHead.default
					: throwInternalError(
							`Unexpected defaultable intersection from ${lHead.kind} and ${rHead.kind} elements.`
						)
			}
		]
	} else s.result = [...s.result, { kind, node: result }]

	const lRemaining = s.l.length
	const rRemaining = s.r.length

	if (
		lHead.kind !== "variadic" ||
		(lRemaining >= rRemaining &&
			(rHead.kind === "variadic" || rRemaining === 1))
	)
		s.l = lTail

	if (
		rHead.kind !== "variadic" ||
		(rRemaining >= lRemaining &&
			(lHead.kind === "variadic" || lRemaining === 1))
	)
		s.r = rTail

	return _intersectSequences(s)
}
