import {
	append,
	domainDescriptions,
	printable,
	throwInternalError,
	throwParseError
} from "@ark/util"
import { nodesByRegisteredId, type NodeId } from "../parse.ts"
import type { NodeCompiler } from "../shared/compile.ts"
import type { BaseNormalizedSchema, declareNode } from "../shared/declare.ts"
import { Disjoint } from "../shared/disjoint.ts"
import {
	implementNode,
	type nodeImplementationOf
} from "../shared/implement.ts"
import { intersectOrPipeNodes } from "../shared/intersections.ts"
import { JsonSchema } from "../shared/jsonSchema.ts"
import { $ark } from "../shared/registry.ts"
import type { TraverseAllows, TraverseApply } from "../shared/traversal.ts"
import { hasArkKind } from "../shared/utils.ts"
import { BaseRoot } from "./root.ts"
import { defineRightwardIntersections } from "./utils.ts"

export declare namespace Alias {
	export type Schema<alias extends string = string> =
		| `$${alias}`
		| NormalizedSchema<alias>

	export interface NormalizedSchema<alias extends string = string>
		extends BaseNormalizedSchema {
		readonly reference: alias
		readonly resolve?: () => BaseRoot
	}

	export interface Inner<alias extends string = string> {
		readonly reference: alias
		readonly resolve?: () => BaseRoot
	}

	export interface Declaration
		extends declareNode<{
			kind: "alias"
			schema: Schema
			normalizedSchema: NormalizedSchema
			inner: Inner
		}> {}

	export type Node = AliasNode
}

export const normalizeAliasSchema = (schema: Alias.Schema): Alias.Inner =>
	typeof schema === "string" ? { reference: schema } : schema

const neverIfDisjoint = (result: BaseRoot | Disjoint): BaseRoot =>
	result instanceof Disjoint ? $ark.intrinsic.never.internal : result

const implementation: nodeImplementationOf<Alias.Declaration> =
	implementNode<Alias.Declaration>({
		kind: "alias",
		hasAssociatedError: false,
		collapsibleKey: "reference",
		keys: {
			reference: {
				serialize: s => (s.startsWith("$") ? s : `$ark.${s}`)
			},
			resolve: {}
		},
		normalize: normalizeAliasSchema,
		defaults: {
			description: node => node.reference
		},
		intersections: {
			alias: (l, r, ctx) =>
				ctx.$.lazilyResolve(
					() =>
						neverIfDisjoint(
							intersectOrPipeNodes(l.resolution, r.resolution, ctx)
						),
					`${l.reference}${ctx.pipe ? "=>" : "&"}${r.reference}`
				),
			...defineRightwardIntersections("alias", (l, r, ctx) => {
				if (r.isUnknown()) return l
				if (r.isNever()) return r
				if (r.isBasis() && !r.overlaps($ark.intrinsic.object)) {
					// can be more robust as part of https://github.com/arktypeio/arktype/issues/1026
					return Disjoint.init(
						"assignability",
						$ark.intrinsic.object as never,
						r
					)
				}

				return ctx.$.lazilyResolve(
					() => neverIfDisjoint(intersectOrPipeNodes(l.resolution, r, ctx)),
					`${l.reference}${ctx.pipe ? "=>" : "&"}${r.id}`
				)
			})
		}
	})

export class AliasNode extends BaseRoot<Alias.Declaration> {
	readonly expression: string = this.reference
	readonly structure = undefined

	get resolution(): BaseRoot {
		const result = this._resolve()
		return (nodesByRegisteredId[this.id] = result)
	}

	protected _resolve(): BaseRoot {
		if (this.resolve) return this.resolve()
		if (this.reference[0] === "$")
			return this.$.resolveRoot(this.reference.slice(1))

		const id = this.reference as NodeId

		let resolution = nodesByRegisteredId[id]
		const seen: NodeId[] = []
		while (hasArkKind(resolution, "context")) {
			if (seen.includes(resolution.id)) {
				return throwParseError(
					writeShallowCycleErrorMessage(resolution.id, seen)
				)
			}

			seen.push(resolution.id)
			resolution = nodesByRegisteredId[resolution.id]
		}
		if (!hasArkKind(resolution, "root")) {
			return throwInternalError(`Unexpected resolution for reference ${this.reference}
Seen: [${seen.join("->")}] 
Resolution: ${printable(resolution)}`)
		}
		return resolution
	}

	get resolutionId(): NodeId {
		if (this.reference.includes("&") || this.reference.includes("=>"))
			return this.resolution.id
		if (this.reference[0] !== "$") return this.reference as NodeId
		const alias = this.reference.slice(1)
		const resolution = this.$.resolutions[alias]
		if (typeof resolution === "string") return resolution
		if (hasArkKind(resolution, "root")) return resolution.id

		return throwInternalError(
			`Unexpected resolution for reference ${this.reference}: ${printable(resolution)}`
		)
	}

	get shortDescription(): string {
		return domainDescriptions.object
	}

	protected innerToJsonSchema(): JsonSchema {
		return JsonSchema.throwUnjsonifiableError(this.expression, "cyclic")
	}

	traverseAllows: TraverseAllows = (data, ctx) => {
		const seen = ctx.seen[this.reference]
		if (seen?.includes(data)) return true
		ctx.seen[this.reference] = append(seen, data)
		return this.resolution.traverseAllows(data, ctx)
	}

	traverseApply: TraverseApply = (data, ctx) => {
		const seen = ctx.seen[this.reference]
		if (seen?.includes(data)) return
		ctx.seen[this.reference] = append(seen, data)
		this.resolution.traverseApply(data, ctx)
	}

	compile(js: NodeCompiler): void {
		const id = this.resolutionId
		js.if(`ctx.seen.${id} && ctx.seen.${id}.includes(data)`, () =>
			js.return(true)
		)
		js.if(`!ctx.seen.${id}`, () => js.line(`ctx.seen.${id} = []`))
		js.line(`ctx.seen.${id}.push(data)`)
		js.return(js.invoke(id))
	}
}

export const writeShallowCycleErrorMessage = (
	name: string,
	seen: string[]
): string =>
	`Alias '${name}' has a shallow resolution cycle: ${[...seen, name].join("->")}`

export const Alias = {
	implementation,
	Node: AliasNode
}
