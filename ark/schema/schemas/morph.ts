import {
	type BuiltinObjectKind,
	type BuiltinObjects,
	type Primitive,
	type array,
	arrayFrom,
	type listable,
	reference,
	throwParseError
} from "@arktype/util"
import { type Node, type Schema, implementNode } from "../base.js"
import type { of } from "../constraints/ast.js"
import { tsKeywords } from "../keywords/tsKeywords.js"
import type { NodeDef } from "../kinds.js"
import type { StaticArkOption } from "../scope.js"
import type { NodeCompiler } from "../shared/compile.js"
import type { BaseMeta, declareNode } from "../shared/declare.js"
import { Disjoint } from "../shared/disjoint.js"
import type { ArkResult, ArkTypeError } from "../shared/errors.js"
import { basisKinds, type nodeImplementationOf } from "../shared/implement.js"
import type {
	TraversalContext,
	TraverseAllows,
	TraverseApply
} from "../shared/traversal.js"
import {
	type BaseSchema,
	type BaseSchemaAttachments,
	defineRightwardIntersections,
	type schemaKindRightOf
} from "./schema.js"

export type MorphChildKind = schemaKindRightOf<"morph">

export const morphChildKinds = [
	"intersection",
	...basisKinds
] as const satisfies readonly MorphChildKind[]

export type MorphChildNode = Node<MorphChildKind>

export type MorphChildDefinition = NodeDef<MorphChildKind>

export type Morph<i = any, o = unknown> = (In: i, ctx: TraversalContext) => o

export type Out<o = any> = ["=>", o]

export type MorphAst<i = any, o = any> = (In: i) => Out<o>

export interface MorphInner extends BaseMeta {
	readonly in: MorphChildNode
	readonly out: MorphChildNode
	readonly morphs: readonly Morph[]
}

export interface MorphDef extends BaseMeta {
	readonly in: MorphChildDefinition
	readonly out?: MorphChildDefinition
	readonly morphs: listable<Morph>
}

export type MorphDeclaration = declareNode<{
	kind: "morph"
	def: MorphDef
	normalizedDef: MorphDef
	inner: MorphInner
	childKind: MorphChildKind
	attachments: MorphAttachments
}>

export interface MorphAttachments
	extends BaseSchemaAttachments<MorphDeclaration> {
	serializedMorphs: array<string>
}

export const morphImplementation = implementNode<MorphDeclaration>({
	kind: "morph",
	hasAssociatedError: false,
	keys: {
		in: {
			child: true,
			parse: (def, ctx) => ctx.$.parseNode(morphChildKinds, def)
		},
		out: {
			child: true,
			parse: (def, ctx) => ctx.$.parseNode(morphChildKinds, def)
		},
		morphs: {
			parse: arrayFrom,
			serialize: (morphs) => morphs.map(reference)
		}
	},
	normalize: (def) => def,
	defaults: {
		description: (node) =>
			`a morph from ${node.in.description} to ${node.out.description}`
	},
	intersections: {
		morph: (l, r, $) => {
			if (l.morphs.some((morph, i) => morph !== r.morphs[i])) {
				// TODO: is this always a parse error? what about for union reduction etc.
				// TODO: check in for union reduction
				return throwParseError("Invalid intersection of morphs")
			}
			const inTersection = l.in.intersect(r.in)
			if (inTersection instanceof Disjoint) {
				return inTersection
			}
			const outTersection = l.out.intersect(r.out)
			if (outTersection instanceof Disjoint) {
				return outTersection
			}
			return $.node("morph", {
				morphs: l.morphs,
				in: inTersection,
				out: outTersection
			})
		},
		...defineRightwardIntersections("morph", (l, r, $) => {
			const inTersection = l.in.intersect(r)
			return inTersection instanceof Disjoint
				? inTersection
				: inTersection.kind === "union"
					? $.node(
							"union",
							inTersection.branches.map((branch) => ({
								...l.inner,
								in: branch
							}))
						)
					: $.node("morph", {
							...l.inner,
							in: inTersection
						})
		})
	},
	construct: (self) => {
		const serializedMorphs = self.morphs.map((morph) => reference(morph))
		return {
			serializedMorphs,
			expression: `(In: ${self.in.expression}) => Out<${self.out.expression}>`,
			traverseAllows: (data, ctx) => self.in.traverseAllows(data, ctx),
			traverseApply: (data, ctx) => {
				self.morphs.forEach((morph) => ctx.queueMorph(morph))
				self.in.traverseApply(data, ctx)
			},
			compile(js: NodeCompiler): void {
				if (js.traversalKind === "Allows") {
					js.return(js.invoke(this.in))
					return
				}
				this.serializedMorphs.forEach((name) =>
					js.line(`ctx.queueMorph(${name})`)
				)
				js.line(js.invoke(this.in))
			},
			get in() {
				return this.inner.in
			},
			get out() {
				return this.inner.out ?? tsKeywords.unknown
			},
			rawKeyOf(): Schema {
				return this.in.rawKeyOf()
			}
		}
	}
})

export type MorphNode<t = any, $ = any> = BaseSchema<t, $, MorphDeclaration>

export type inferMorphOut<morph extends Morph> = morph extends Morph<
	never,
	infer out
>
	? out extends ArkResult<unknown, infer innerOut>
		? out extends null
			? // avoid treating any/never as ArkResult
				out
			: innerOut
		: Exclude<out, ArkTypeError>
	: never

export type distillIn<t> = includesMorphs<t> extends true
	? distillRecurse<t, "in", "base">
	: t

export type distillOut<t> = includesMorphs<t> extends true
	? distillRecurse<t, "out", "base">
	: t

export type distillConstrainableIn<t> = includesMorphs<t> extends true
	? distillRecurse<t, "in", "constrainable">
	: t

export type distillConstrainableOut<t> = includesMorphs<t> extends true
	? distillRecurse<t, "out", "constrainable">
	: t

export type includesMorphs<t> = [
	t,
	distillRecurse<t, "in", "base">,
	t,
	distillRecurse<t, "out", "base">
] extends [
	distillRecurse<t, "in", "base">,
	t,
	distillRecurse<t, "out", "base">,
	t
]
	? false
	: true

type distillRecurse<
	t,
	io extends "in" | "out",
	distilledKind extends "base" | "constrainable"
> = unknown extends t
	? unknown
	: t extends MorphAst<infer i, infer o>
		? io extends "in"
			? i
			: o
		: t extends of<infer base, any>
			? distilledKind extends "base"
				? distillRecurse<base, io, distilledKind>
				: t
			: t extends TerminallyInferredObjectKind | Primitive
				? t
				: t extends array
					? distillArray<t, io, distilledKind, []>
					: {
							[k in keyof t]: distillRecurse<
								t[k],
								io,
								distilledKind
							>
						}

type distillArray<
	t extends array,
	io extends "in" | "out",
	constraints extends "base" | "constrainable",
	prefix extends array
> = t extends readonly [infer head, ...infer tail]
	? distillArray<
			tail,
			io,
			constraints,
			[...prefix, distillRecurse<head, io, constraints>]
		>
	: [...prefix, ...distillPostfix<t, io, constraints>]

type distillPostfix<
	t extends array,
	io extends "in" | "out",
	constraints extends "base" | "constrainable",
	postfix extends array = []
> = t extends readonly [...infer init, infer last]
	? distillPostfix<
			init,
			io,
			constraints,
			[distillRecurse<last, io, constraints>, ...postfix]
		>
	: [...{ [i in keyof t]: distillRecurse<t[i], io, constraints> }, ...postfix]

/** Objects we don't want to expand during inference like Date or Promise */
type TerminallyInferredObjectKind =
	| StaticArkOption<"preserve">
	| BuiltinObjects[Exclude<BuiltinObjectKind, "Array">]
