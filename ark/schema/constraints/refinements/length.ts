import { jsData } from "../../shared/compile.js"
import type { BaseMeta, declareNode } from "../../shared/declare.js"
import { Disjoint } from "../../shared/disjoint.js"
import { BasePrimitiveConstraint } from "../constraint.js"
import type { LengthBoundableData } from "./range.js"

export interface LengthInner extends BaseMeta {
	readonly length: number
}

export type length<n extends number> = { "==": n }

export type NormalizedLengthSchema = LengthInner

export type LengthSchema = NormalizedLengthSchema | number

export type LengthDeclaration = declareNode<{
	kind: "length"
	schema: LengthSchema
	normalizedSchema: NormalizedLengthSchema
	inner: LengthInner
	prerequisite: LengthBoundableData
	expectedContext: LengthInner
}>

export class LengthNode extends BasePrimitiveConstraint<
	LengthDeclaration,
	typeof LengthNode
> {
	static implementation = this.implement({
		collapseKey: "length",
		keys: {
			length: {}
		},
		normalize: (schema) =>
			typeof schema === "number" ? { length: schema } : schema,
		intersections: {
			length: (l, r) =>
				new Disjoint({
					"[length]": {
						unit: {
							l: l.$.parse("unit", { unit: l.length }),
							r: r.$.parse("unit", { unit: r.length })
						}
					}
				}),
			default: () => null
		},
		hasAssociatedError: true,
		defaults: {
			description(inner) {
				return `exactly length ${inner.length}`
			}
		}
	})

	traverseAllows = (data: LengthBoundableData) => data.length === this.length

	compiledCondition = `${jsData}.length === ${this.length}`
	compiledNegation = `${jsData}.length !== ${this.length}`

	readonly expectedContext = this.createExpectedContext(this.inner)
}
