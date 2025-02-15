import { append, printable, throwParseError, unset, type Key } from "@ark/util"
import { BaseConstraint } from "../constraint.ts"
import type { nodeOfKind, RootSchema } from "../kinds.ts"
import {
	flatRef,
	type BaseNode,
	type DeepNodeTransformation,
	type DeepNodeTransformContext,
	type FlatRef
} from "../node.ts"
import type { BaseRoot } from "../roots/root.ts"
import { compileSerializedValue, type NodeCompiler } from "../shared/compile.ts"
import type { BaseNormalizedSchema } from "../shared/declare.ts"
import { Disjoint } from "../shared/disjoint.ts"
import type { IntersectionContext, RootKind } from "../shared/implement.ts"
import { intersectOrPipeNodes } from "../shared/intersections.ts"
import { $ark } from "../shared/registry.ts"
import {
	traverseKey,
	type TraverseAllows,
	type TraverseApply
} from "../shared/traversal.ts"
import type { Optional } from "./optional.ts"
import type { Required } from "./required.ts"

export declare namespace Prop {
	export type Kind = "required" | "optional"

	export type Node = nodeOfKind<Kind>

	export interface Schema extends BaseNormalizedSchema {
		readonly key: Key
		readonly value: RootSchema
	}

	export interface Inner {
		readonly key: Key
		readonly value: BaseRoot
	}

	export interface Declaration<kind extends Kind = Kind> {
		kind: kind
		prerequisite: object
		intersectionIsOpen: true
		childKind: RootKind
	}
}

export const intersectProps = (
	l: nodeOfKind<Prop.Kind>,
	r: nodeOfKind<Prop.Kind>,
	ctx: IntersectionContext
): nodeOfKind<Prop.Kind> | Disjoint | null => {
	if (l.key !== r.key) return null

	const key = l.key
	let value = intersectOrPipeNodes(l.value, r.value, ctx)
	const kind: Prop.Kind = l.required || r.required ? "required" : "optional"
	if (value instanceof Disjoint) {
		if (kind === "optional") value = $ark.intrinsic.never.internal
		else {
			// if either operand was optional, the Disjoint has to be treated as optional
			return value.withPrefixKey(
				l.key,
				l.required && r.required ? "required" : "optional"
			)
		}
	}

	if (kind === "required") {
		return ctx.$.node("required", {
			key,
			value
		})
	}

	const defaultIntersection =
		l.hasDefault() ?
			r.hasDefault() ?
				l.default === r.default ?
					l.default
				:	throwParseError(writeDefaultIntersectionMessage(l.default, r.default))
			:	l.default
		: r.hasDefault() ? r.default
		: unset

	return ctx.$.node("optional", {
		key,
		value,
		// unset is stripped during parsing
		default: defaultIntersection
	})
}

export abstract class BaseProp<
	kind extends Prop.Kind = Prop.Kind
> extends BaseConstraint<
	kind extends "required" ? Required.Declaration : Optional.Declaration
> {
	required: boolean = this.kind === "required"
	optional: boolean = this.kind === "optional"
	impliedBasis: BaseRoot = $ark.intrinsic.object.internal
	serializedKey: string = compileSerializedValue(this.key)
	compiledKey: string =
		typeof this.key === "string" ? this.key : this.serializedKey

	flatRefs: FlatRef[] = append(
		this.value.flatRefs.map(ref => flatRef([this.key, ...ref.path], ref.node)),
		flatRef([this.key], this.value)
	)

	protected override _transform(
		mapper: DeepNodeTransformation,
		ctx: DeepNodeTransformContext
	): BaseNode | null {
		ctx.path.push(this.key)
		const result = super._transform(mapper, ctx)
		ctx.path.pop()
		return result
	}

	hasDefault(): this is Optional.Node.withDefault {
		return "default" in this.inner
	}

	traverseAllows: TraverseAllows<object> = (data, ctx) => {
		if (this.key in data) {
			// ctx will be undefined if this node isn't context-dependent
			return traverseKey(
				this.key,
				() => this.value.traverseAllows((data as any)[this.key], ctx),
				ctx
			)
		}
		return this.optional
	}

	traverseApply: TraverseApply<object> = (data, ctx) => {
		if (this.key in data) {
			traverseKey(
				this.key,
				() => this.value.traverseApply((data as any)[this.key], ctx),
				ctx
			)
		} else if (this.hasKind("required"))
			ctx.errorFromNodeContext(this.errorContext)
	}

	compile(js: NodeCompiler): void {
		js.if(`${this.serializedKey} in data`, () =>
			js.traverseKey(this.serializedKey, `data${js.prop(this.key)}`, this.value)
		)

		if (this.hasKind("required")) {
			js.else(() => {
				if (js.traversalKind === "Apply") {
					return js.line(
						`ctx.errorFromNodeContext(${this.compiledErrorContext})`
					)
				} else return js.return(false)
			})
		}

		if (js.traversalKind === "Allows") js.return(true)
	}
}

export const writeDefaultIntersectionMessage = (
	lValue: unknown,
	rValue: unknown
): string =>
	`Invalid intersection of default values ${printable(lValue)} & ${printable(rValue)}`
