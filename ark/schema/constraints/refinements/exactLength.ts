import { implementNode } from "../../base.js"
import { internalKeywords } from "../../keywords/internal.js"
import type { BaseMeta, declareNode } from "../../shared/declare.js"
import { Disjoint } from "../../shared/disjoint.js"
import type { TraverseAllows } from "../../shared/traversal.js"
import { BasePrimitiveConstraint } from "../constraint.js"
import type { LengthBoundableData } from "./range.js"

export interface ExactLengthInner extends BaseMeta {
	readonly rule: number
}

export type NormalizedExactLengthDef = ExactLengthInner

export type ExactLengthDef = NormalizedExactLengthDef | number

export type ExactLengthDeclaration = declareNode<{
	kind: "exactLength"
	def: ExactLengthDef
	normalizedDef: NormalizedExactLengthDef
	inner: ExactLengthInner
	prerequisite: LengthBoundableData
	errorContext: ExactLengthInner
}>

export const exactLengthImplementation = implementNode<ExactLengthDeclaration>({
	kind: "exactLength",
	collapsibleKey: "rule",
	keys: {
		rule: {}
	},
	normalize: (def) => (typeof def === "number" ? { rule: def } : def),
	intersections: {
		exactLength: (l, r, $) =>
			new Disjoint({
				"[length]": {
					unit: {
						l: $.node("unit", { unit: l.rule }),
						r: $.node("unit", { unit: r.rule })
					}
				}
			}),
		minLength: (exactLength, minLength) =>
			(
				minLength.exclusive
					? exactLength.rule > minLength.rule
					: exactLength.rule >= minLength.rule
			)
				? exactLength
				: Disjoint.from("range", exactLength, minLength),
		maxLength: (exactLength, maxLength) =>
			(
				maxLength.exclusive
					? exactLength.rule < maxLength.rule
					: exactLength.rule <= maxLength.rule
			)
				? exactLength
				: Disjoint.from("range", exactLength, maxLength)
	},
	hasAssociatedError: true,
	defaults: {
		description: (node) => `exactly length ${node.rule}`
	}
})

export class ExactLengthNode extends BasePrimitiveConstraint<ExactLengthDeclaration> {
	static implementation = exactLengthImplementation

	traverseAllows: TraverseAllows<LengthBoundableData> = (data) =>
		data.length === this.rule

	readonly compiledCondition = `data.length === ${this.rule}`
	readonly compiledNegation = `data.length !== ${this.rule}`
	readonly impliedBasis = internalKeywords.lengthBoundable
	readonly errorContext = this.createErrorContext(this.inner)
	readonly expression = `{ length: ${this.rule} }`
}
