import { describeCollapsibleDate } from "@ark/util"
import type { BaseRoot } from "../roots/root.ts"
import type { BaseErrorContext, declareNode } from "../shared/declare.ts"
import { Disjoint } from "../shared/disjoint.ts"
import {
	implementNode,
	type nodeImplementationOf
} from "../shared/implement.ts"
import { JsonSchema } from "../shared/jsonSchema.ts"
import { $ark } from "../shared/registry.ts"
import type { TraverseAllows } from "../shared/traversal.ts"
import {
	BaseRange,
	createDateSchemaNormalizer,
	parseDateLimit,
	type BaseRangeInner,
	type LimitSchemaValue,
	type UnknownExpandedRangeSchema,
	type UnknownNormalizedRangeSchema
} from "./range.ts"

export declare namespace Before {
	export interface Inner extends BaseRangeInner {
		rule: Date
	}

	export interface NormalizedSchema extends UnknownNormalizedRangeSchema {
		rule: LimitSchemaValue
	}

	export interface ExpandedSchema extends UnknownExpandedRangeSchema {
		rule: LimitSchemaValue
	}

	export type Schema = ExpandedSchema | LimitSchemaValue

	export interface ErrorContext extends BaseErrorContext<"before">, Inner {}

	export interface Declaration
		extends declareNode<{
			kind: "before"
			schema: Schema
			normalizedSchema: NormalizedSchema
			inner: Inner
			prerequisite: Date
			errorContext: ErrorContext
		}> {}

	export type Node = BeforeNode
}

const implementation: nodeImplementationOf<Before.Declaration> =
	implementNode<Before.Declaration>({
		kind: "before",
		collapsibleKey: "rule",
		hasAssociatedError: true,
		keys: {
			rule: {
				parse: parseDateLimit,
				serialize: schema => schema.toISOString()
			}
		},
		normalize: createDateSchemaNormalizer("before"),
		defaults: {
			description: node => `${node.collapsibleLimitString} or earlier`,
			actual: describeCollapsibleDate
		},
		intersections: {
			before: (l, r) => (l.isStricterThan(r) ? l : r),
			after: (before, after, ctx) =>
				before.overlapsRange(after) ?
					before.overlapIsUnit(after) ?
						ctx.$.node("unit", { unit: before.rule })
					:	null
				:	Disjoint.init("range", before, after)
		}
	})

export class BeforeNode extends BaseRange<Before.Declaration> {
	collapsibleLimitString = describeCollapsibleDate(this.rule)

	traverseAllows: TraverseAllows<Date> = data => data <= this.rule

	impliedBasis: BaseRoot = $ark.intrinsic.Date.internal

	reduceJsonSchema(): JsonSchema.Constrainable {
		return JsonSchema.throwUnjsonifiableError("Date instance")
	}
}

export const Before = {
	implementation,
	Node: BeforeNode
}
