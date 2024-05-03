import type { MutableIntersectionInner } from "../roots/intersection.js"
import type { BaseRoot } from "../roots/root.js"
import type { declareNode } from "../shared/declare.js"
import {
	implementNode,
	type nodeImplementationOf
} from "../shared/implement.js"
import type { TraverseAllows } from "../shared/traversal.js"
import {
	type BaseNormalizedRangeRoot,
	BaseRange,
	type BaseRangeInner,
	type LengthBoundableData,
	parseExclusiveKey
} from "./range.js"

export interface MinLengthInner extends BaseRangeInner {
	rule: number
}

export interface NormalizedMinLengthSchema extends BaseNormalizedRangeRoot {
	rule: number
}

export type MinLengthSchema = NormalizedMinLengthSchema | number

export interface MinLengthDeclaration
	extends declareNode<{
		kind: "minLength"
		schema: MinLengthSchema
		normalizedSchema: NormalizedMinLengthSchema
		inner: MinLengthInner
		prerequisite: LengthBoundableData
		errorContext: MinLengthInner
	}> {}

export const minLengthImplementation: nodeImplementationOf<MinLengthDeclaration> =
	implementNode<MinLengthDeclaration>({
		kind: "minLength",
		collapsibleKey: "rule",
		hasAssociatedError: true,
		keys: {
			rule: {},
			exclusive: parseExclusiveKey
		},
		normalize: schema =>
			typeof schema === "number" ? { rule: schema } : schema,
		defaults: {
			description: node =>
				node.exclusive ?
					node.rule === 0 ?
						"non-empty"
					:	`more than length ${node.rule}`
				: node.rule === 1 ? "non-empty"
				: `at least length ${node.rule}`,
			actual: data => `${data.length}`
		},
		intersections: {
			minLength: (l, r) => (l.isStricterThan(r) ? l : r)
		}
	})

export class MinLengthNode extends BaseRange<MinLengthDeclaration> {
	readonly impliedBasis: BaseRoot = this.$.keywords.lengthBoundable.raw

	traverseAllows: TraverseAllows<LengthBoundableData> =
		this.exclusive ?
			data => data.length > this.rule
		:	data => data.length >= this.rule

	reduceIntersection(acc: MutableIntersectionInner): MutableIntersectionInner {
		if (!acc.minLength || this.isStricterThan(acc.minLength))
			acc.minLength = this
		return acc
	}
}
