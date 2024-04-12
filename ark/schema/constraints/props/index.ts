import { throwParseError } from "@arktype/util"
import {
	type BaseAttachments,
	type SchemaDef,
	implementNode
} from "../../base.js"
import type { RawSchema } from "../../schemas/schema.js"
import type { BaseMeta, declareNode } from "../../shared/declare.js"
import type { SchemaKind } from "../../shared/implement.js"
import type { ConstraintAttachments, RawConstraint } from "../constraint.js"

export interface IndexDef extends BaseMeta {
	readonly key: SchemaDef
	readonly value: SchemaDef
}

export interface IndexInner extends BaseMeta {
	readonly key: RawSchema
	readonly value: RawSchema
}

export type IndexDeclaration = declareNode<{
	kind: "index"
	def: IndexDef
	normalizedDef: IndexDef
	inner: IndexInner
	prerequisite: object
	intersectionIsOpen: true
	childKind: SchemaKind
	attachments: IndexAttachments
}>

export interface IndexAttachments
	extends BaseAttachments<IndexDeclaration>,
		ConstraintAttachments {}

export const indexImplementation = implementNode<IndexDeclaration>({
	kind: "index",
	hasAssociatedError: false,
	intersectionIsOpen: true,
	keys: {
		key: {
			child: true,
			parse: (def, ctx) => {
				const key = ctx.$.schema(def)
				if (!key.extends(ctx.$.keywords.propertyKey))
					return throwParseError(writeInvalidPropertyKeyMessage(key.expression))
				return key
			}
		},
		value: {
			child: true,
			parse: (def, ctx) => ctx.$.schema(def)
		}
	},
	normalize: (def) => def,
	defaults: {
		description: (node) => `[${node.key.expression}]: ${node.value.description}`
	},
	intersections: {
		index: (l) => l
	},
	construct: (self) => {
		return {
			expression: `[${self.key.expression}]: ${self.value.expression}`,
			impliedBasis: self.$.keywords.object,
			traverseAllows(data, ctx) {
				return Object.entries(data).every(
					(entry) =>
						!this.key.traverseAllows(entry[0], ctx) ||
						this.value.traverseAllows(entry[1], ctx)
				)
			},
			traverseApply(data, ctx) {
				return Object.entries(data).forEach((entry) => {
					if (this.key.traverseAllows(entry[0], ctx)) {
						this.value.traverseApply(entry[1], ctx)
					}
				})
			},
			compile: (js) => {
				if (js.traversalKind === "Allows") {
					js.return(true)
				}
			}
		}
	}
})

export type IndexNode = RawConstraint<IndexDeclaration>

export const writeInvalidPropertyKeyMessage = <indexDef extends string>(
	indexDef: indexDef
): writeInvalidPropertyKeyMessage<indexDef> =>
	`Indexed key definition '${indexDef}' must be a string, number or symbol`

export type writeInvalidPropertyKeyMessage<indexDef extends string> =
	`Indexed key definition '${indexDef}' must be a string, number or symbol`
