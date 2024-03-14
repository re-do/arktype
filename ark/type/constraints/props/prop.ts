import { compileSerializedValue } from "@arktype/util"
import type { Node, TypeSchema } from "../../base.js"
import type { NodeCompiler } from "../../shared/compile.js"
import type { TraverseAllows, TraverseApply } from "../../shared/context.js"
import type { BaseMeta, declareNode } from "../../shared/declare.js"
import { Disjoint } from "../../shared/disjoint.js"
import type { TypeKind, nodeImplementationOf } from "../../shared/implement.js"
import { BaseConstraint } from "../constraint.js"

export interface PropSchema extends BaseMeta {
	readonly key: string | symbol
	readonly value: TypeSchema
	readonly optional?: boolean
}

export interface PropInner extends BaseMeta {
	readonly key: string | symbol
	readonly value: Node<TypeKind>
	readonly optional?: true
}

export type PropDeclaration = declareNode<{
	kind: "prop"
	schema: PropSchema
	normalizedSchema: PropSchema
	inner: PropInner
	errorContext: {
		key: string | symbol
	}
	prerequisite: object
	intersectionIsOpen: true
	childKind: TypeKind
}>

export class PropNode extends BaseConstraint<PropDeclaration> {
	static implementation: nodeImplementationOf<PropDeclaration> = this.implement(
		{
			hasAssociatedError: true,
			intersectionIsOpen: true,
			keys: {
				key: {},
				value: {
					child: true,
					parse: (schema, ctx) => ctx.$.parseTypeSchema(schema)
				},
				optional: {
					// normalize {optional: false} to {}
					parse: (schema) => schema || undefined
				}
			},
			normalize: (schema) => schema,
			defaults: {
				description(node) {
					return `${node.compiledKey}${node.optional ? "?" : ""}: ${
						node.value.description
					}`
				},
				expected() {
					return "provided"
				},
				actual: () => null
			},
			intersections: {
				prop: (l, r, $) => {
					if (l.key !== r.key) {
						return null
					}
					const key = l.key
					const value = l.value.intersect(r.value)
					if (value instanceof Disjoint) {
						return value.withPrefixKey(l.compiledKey)
					}
					return $.parseSchema("prop", {
						key,
						value,
						optional: l.optional && r.optional
					})
				}
			}
		}
	)

	readonly required = !this.optional
	readonly impliedBasis = this.$.tsKeywords.object
	readonly serializedKey = compileSerializedValue(this.key)
	readonly compiledKey =
		typeof this.key === "string" ? this.key : this.serializedKey
	readonly expression = `${this.compiledKey}${this.optional ? "?" : ""}: ${
		this.value
	}`

	readonly errorContext = Object.freeze({
		code: "prop",
		description: this.description,
		key: this.key
	})

	traverseAllows: TraverseAllows<object> = (data, ctx) => {
		if (this.key in data) {
			return this.value.traverseAllows((data as any)[this.key], ctx)
		}
		return this.required
	}

	traverseApply: TraverseApply<object> = (data, ctx) => {
		if (this.key in data) {
			this.value.traverseApply((data as any)[this.key], ctx)
		} else if (this.required) {
			ctx.error(this.errorContext)
		}
	}

	compile(js: NodeCompiler): void {
		js.if(`${this.serializedKey} in ${js.data}`, () =>
			js.checkLiteralKey(this.key, this.value)
		)
		if (this.required) {
			js.else(() =>
				js.traversalKind === "Allows"
					? js.return(false)
					: js.line(`${js.ctx}.error(${JSON.stringify(this.errorContext)})`)
			)
		}

		if (js.traversalKind === "Allows") {
			js.return(true)
		}
	}
}
