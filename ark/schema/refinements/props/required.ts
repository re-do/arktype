import { BaseNode, type Node, type TypeSchema } from "../../base.js"
import type { Inner } from "../../kinds.js"
import type { AllowsCompiler, ApplyCompiler } from "../../shared/compile.js"
import type { BaseMeta, declareNode } from "../../shared/declare.js"
import { Disjoint } from "../../shared/disjoint.js"
import type { TypeKind, nodeImplementationOf } from "../../shared/implement.js"
import type { TraverseAllows, TraverseApply } from "../../traversal/context.js"
import { compileSerializedValue } from "../../traversal/registry.js"
import type { FoldInput } from "../refinement.js"
import {
	compileKey,
	compilePresentPropAllows,
	compilePresentPropApply
} from "./shared.js"

export interface RequiredSchema extends BaseMeta {
	readonly key: string | symbol
	readonly value: TypeSchema
}

export interface RequiredInner extends BaseMeta {
	readonly key: string | symbol
	readonly value: Node<TypeKind>
}

export type RequiredDeclaration = declareNode<{
	kind: "required"
	schema: RequiredSchema
	normalizedSchema: RequiredSchema
	inner: RequiredInner
	expectedContext: {
		code: "required"
		key: string | symbol
	}
	composition: "composite"
	prerequisite: object
	open: true
	disjoinable: true
	childKind: TypeKind
}>

export class RequiredNode extends BaseNode<
	object,
	RequiredDeclaration,
	typeof RequiredNode
> {
	static implementation: nodeImplementationOf<RequiredDeclaration> =
		this.implement({
			hasAssociatedError: true,
			keys: {
				key: {},
				value: {
					child: true,
					parse: (schema, ctx) => ctx.$.parseTypeNode(schema)
				}
			},
			normalize: (schema) => schema,
			defaults: {
				description(inner) {
					return `${compileKey(inner.key)}: ${inner.value}`
				},
				expected() {
					return "provided"
				},
				actual: () => null
			}
		})

	readonly hasOpenIntersection = true

	serializedKey = compileSerializedValue(this.key)

	traverseAllows: TraverseAllows<object> = (data, ctx) =>
		this.key in data && this.value.traverseAllows((data as any)[this.key], ctx)

	traverseApply: TraverseApply<object> = (data, ctx) => {
		if (this.key in data) {
			this.value.traverseApply((data as any)[this.key], ctx)
		} else {
			ctx.error("provided")
		}
	}

	compiledKey = compileKey(this.key)

	// TODO: fix base
	readonly baseRequiredErrorContext = { code: "required", key: this.key }

	compileApply(js: ApplyCompiler) {
		return `if(${this.serializedKey} in ${js.data}) {
			${compilePresentPropApply(this, js)}
		} else {
			${js.ctx}.error(${JSON.stringify(this.baseRequiredErrorContext)})
		}`
	}

	compileAllows(js: AllowsCompiler) {
		return `if(${this.serializedKey} in ${js.data}) {
			${compilePresentPropAllows(this, js)}
		} else {
			return false
		}`
	}

	protected intersectOwnInner(r: Inner<"required" | "optional">) {
		if (this.key !== r.key) {
			return null
		}
		const key = this.key
		const value = this.value.intersect(r.value)
		if (value instanceof Disjoint) {
			return value
		}
		return {
			key,
			value
		}
	}

	foldIntersection(into: FoldInput<"required">) {
		return {}
	}
}
