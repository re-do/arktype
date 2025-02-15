import {
	arrayEquals,
	liftArray,
	throwParseError,
	type array,
	type listable,
	type mutable
} from "@ark/util"
import type { RootSchema } from "../kinds.ts"
import type { NodeCompiler } from "../shared/compile.ts"
import type { BaseNormalizedSchema, declareNode } from "../shared/declare.ts"
import { Disjoint } from "../shared/disjoint.ts"
import {
	implementNode,
	type nodeImplementationOf,
	type RootKind
} from "../shared/implement.ts"
import { intersectOrPipeNodes } from "../shared/intersections.ts"
import { JsonSchema } from "../shared/jsonSchema.ts"
import { $ark, registeredReference } from "../shared/registry.ts"
import type {
	Traversal,
	TraverseAllows,
	TraverseApply
} from "../shared/traversal.ts"
import { hasArkKind } from "../shared/utils.ts"
import { BaseRoot } from "./root.ts"
import { defineRightwardIntersections } from "./utils.ts"

export declare namespace Morph {
	export interface Inner {
		readonly in?: BaseRoot
		readonly morphs: array<Morph | BaseRoot>
		readonly declaredIn?: BaseRoot
		readonly declaredOut?: BaseRoot
	}

	export interface Schema extends BaseNormalizedSchema {
		readonly in?: RootSchema
		readonly morphs: listable<Morph | BaseRoot>
		readonly declaredIn?: BaseRoot
		readonly declaredOut?: BaseRoot
	}

	export interface Declaration
		extends declareNode<{
			kind: "morph"
			schema: Schema
			normalizedSchema: Schema
			inner: Inner
			childKind: RootKind
		}> {}

	export type Node = MorphNode

	export type In<morph extends Morph> = morph extends Morph<infer i> ? i : never

	export type Out<morph extends Morph> =
		morph extends Morph<never, infer o> ? o : never
}

export type Morph<i = any, o = unknown> = (In: i, ctx: Traversal) => o

const implementation: nodeImplementationOf<Morph.Declaration> =
	implementNode<Morph.Declaration>({
		kind: "morph",
		hasAssociatedError: false,
		keys: {
			in: {
				child: true,
				parse: (schema, ctx) => ctx.$.parseSchema(schema)
			},
			morphs: {
				parse: liftArray,
				serialize: morphs =>
					morphs.map(m =>
						hasArkKind(m, "root") ? m.json : registeredReference(m)
					)
			},
			declaredIn: {
				child: false,
				serialize: node => node.json
			},
			declaredOut: {
				child: false,
				serialize: node => node.json
			}
		},
		normalize: schema => schema,
		defaults: {
			description: node =>
				`a morph from ${node.in.description} to ${node.out?.description ?? "unknown"}`
		},
		intersections: {
			morph: (l, r, ctx) => {
				if (!l.hasEqualMorphs(r)) {
					return throwParseError(
						writeMorphIntersectionMessage(l.expression, r.expression)
					)
				}
				const inTersection = intersectOrPipeNodes(l.in, r.in, ctx)
				if (inTersection instanceof Disjoint) return inTersection

				const baseInner: Omit<mutable<Morph.Inner>, "in"> = {
					morphs: l.morphs
				}

				if (l.declaredIn || r.declaredIn) {
					const declaredIn = intersectOrPipeNodes(l.in, r.in, ctx)
					// we can't treat this as a normal Disjoint since it's just declared
					// it should only happen if someone's essentially trying to create a broken type
					if (declaredIn instanceof Disjoint) return declaredIn.throw()
					else baseInner.declaredIn = declaredIn as never
				}

				if (l.declaredOut || r.declaredOut) {
					const declaredOut = intersectOrPipeNodes(l.out, r.out, ctx)
					if (declaredOut instanceof Disjoint) return declaredOut.throw()
					else baseInner.declaredOut = declaredOut
				}

				// in case from is a union, we need to distribute the branches
				// to can be a union as any schema is allowed
				return inTersection.distribute(
					inBranch =>
						ctx.$.node("morph", {
							...baseInner,
							in: inBranch
						}),
					ctx.$.parseSchema
				)
			},
			...defineRightwardIntersections("morph", (l, r, ctx) => {
				const inTersection =
					l.inner.in ? intersectOrPipeNodes(l.inner.in, r, ctx) : r
				return (
					inTersection instanceof Disjoint ? inTersection
					: inTersection.equals(l.inner.in) ? l
					: ctx.$.node("morph", {
							...l.inner,
							in: inTersection
						})
				)
			})
		}
	})

export class MorphNode extends BaseRoot<Morph.Declaration> {
	serializedMorphs: string[] = this.morphs.map(registeredReference)
	compiledMorphs = `[${this.serializedMorphs}]`

	lastMorph = this.inner.morphs.at(-1)
	lastMorphIfNode: BaseRoot | undefined =
		hasArkKind(this.lastMorph, "root") ? this.lastMorph : undefined
	introspectableIn: BaseRoot | undefined = this.inner.in
	introspectableOut: BaseRoot | undefined =
		this.lastMorphIfNode ?
			Object.assign(this.referencesById, this.lastMorphIfNode.referencesById) &&
			this.lastMorphIfNode.out
		:	undefined

	get shallowMorphs(): array<Morph> {
		// if the morph input is a union, it should not contain any other shallow morphs
		return Array.isArray(this.inner.in?.shallowMorphs) ?
				[...this.inner.in.shallowMorphs, ...this.morphs]
			:	this.morphs
	}

	override get in(): BaseRoot {
		return (
			this.declaredIn ?? this.inner.in?.in ?? $ark.intrinsic.unknown.internal
		)
	}

	override get out(): BaseRoot {
		return (
			this.declaredOut ??
			this.introspectableOut ??
			$ark.intrinsic.unknown.internal
		)
	}

	declareIn(declaredIn: BaseRoot): MorphNode {
		return this.$.node("morph", {
			...this.inner,
			declaredIn
		})
	}

	declareOut(declaredOut: BaseRoot): MorphNode {
		return this.$.node("morph", {
			...this.inner,
			declaredOut
		})
	}

	expression = `(In: ${this.in.expression}) => ${this.lastMorphIfNode ? "To" : "Out"}<${this.out.expression}>`

	get shortDescription(): string {
		return "a morph"
	}

	protected innerToJsonSchema(): JsonSchema {
		return JsonSchema.throwUnjsonifiableError(this.expression, "morph")
	}

	compile(js: NodeCompiler): void {
		if (js.traversalKind === "Allows") {
			if (!this.introspectableIn) return
			js.return(js.invoke(this.introspectableIn))
			return
		}
		if (this.introspectableIn) js.line(js.invoke(this.introspectableIn))
		js.line(`ctx.queueMorphs(${this.compiledMorphs})`)
	}

	traverseAllows: TraverseAllows = (data, ctx) =>
		!this.introspectableIn || this.introspectableIn.traverseAllows(data, ctx)

	traverseApply: TraverseApply = (data, ctx) => {
		if (this.introspectableIn) this.introspectableIn.traverseApply(data, ctx)
		ctx.queueMorphs(this.morphs)
	}

	/** Check if the morphs of r are equal to those of this node */
	hasEqualMorphs(r: MorphNode): boolean {
		return arrayEquals(this.morphs, r.morphs, {
			isEqual: (lMorph, rMorph) =>
				lMorph === rMorph ||
				(hasArkKind(lMorph, "root") &&
					hasArkKind(rMorph, "root") &&
					lMorph.equals(rMorph))
		})
	}
}

export const Morph = {
	implementation,
	Node: MorphNode
}

export const writeMorphIntersectionMessage = (
	lDescription: string,
	rDescription: string
): string =>
	`The intersection of distinct morphs at a single path is indeterminate:
Left: ${lDescription}
Right: ${rDescription}`
