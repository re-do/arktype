import type { TypeNode, TypeSchema } from "../base.js"
import type {
	CompilationContext,
	TraverseAllows,
	TraverseApply
} from "../scope.js"
import type { declareNode, withBaseMeta } from "../shared/declare.js"
import type { nodeImplementationOf } from "../shared/define.js"
import type { Disjoint } from "../shared/disjoint.js"
import { BaseProp } from "./prop.js"

export type IndexSchema = withBaseMeta<{
	readonly key: TypeSchema
	readonly value: TypeSchema
}>

export type IndexInner = {
	readonly key: TypeNode<string | symbol>
	readonly value: TypeNode
}

export type IndexDeclaration = declareNode<{
	kind: "index"
	schema: IndexSchema
	normalizedSchema: IndexSchema
	inner: IndexInner
	intersections: {
		index: "index" | Disjoint | null
	}
	prerequisite: object
}>

export class IndexNode extends BaseProp<IndexDeclaration, typeof IndexNode> {
	static implementation: nodeImplementationOf<"index"> = this.implement({
		keys: {
			key: {
				child: true,
				parse: (schema, ctx) => ctx.$.parseTypeNode(schema)
			},
			value: {
				child: true,
				parse: (schema, ctx) => ctx.$.parseTypeNode(schema)
			}
		},
		normalize: (schema) => schema,
		intersections: {
			index: (l) => l
		},
		defaults: {
			expected(inner) {
				return `[${inner.key}]: ${inner.value}`
			}
		}
	})

	readonly hasOpenIntersection = true

	traverseAllows: TraverseAllows<object> = (data, ctx) =>
		Object.entries(data).every(
			(entry) =>
				!this.key.traverseAllows(entry[0], ctx) ||
				this.value.traverseAllows(entry[1], ctx)
		)

	traverseApply: TraverseApply<object> = (data, ctx) =>
		Object.entries(data).forEach((entry) => {
			if (this.key.traverseAllows(entry[0], ctx)) {
				this.value.traverseAllows(entry[1], ctx)
			}
		})

	getCheckedDefinitions() {
		return ["object"] as const
	}

	compileBody(ctx: CompilationContext): string {
		return ""
	}
}
