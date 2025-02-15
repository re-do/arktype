import type { merge, show } from "@ark/util"
import type { UnknownErrorConfigs } from "../config.ts"
import type { nodeOfKind, reducibleKindOf } from "../kinds.ts"
import type { Disjoint } from "./disjoint.ts"
import type { ArkErrors } from "./errors.ts"
import type { NarrowedAttachments, NodeKind } from "./implement.ts"
import type { JsonSchema } from "./jsonSchema.ts"

type withMetaPrefixedKeys<o> = {
	[k in keyof o as k extends string ? `meta.${k}` : never]: o[k]
}

export interface DefaultArkEnv {
	meta(): {}
	onFail(errors: ArkErrors): ArkErrors
}

export interface BaseMeta extends JsonSchema.Meta, UnknownErrorConfigs {
	alias?: string
	onFail?: ArkErrors.Handler
}

declare global {
	export interface ArkEnv extends DefaultArkEnv {}

	export namespace ArkEnv {
		export type meta = show<BaseMeta & ReturnType<ArkEnv["meta"]>>

		export type onFail = ReturnType<ArkEnv["onFail"]>
	}
}

export type MetaSchema = string | ArkEnv.meta

export interface BaseNormalizedSchema
	extends withMetaPrefixedKeys<ArkEnv.meta> {
	readonly meta?: MetaSchema
}

interface DeclarationInput {
	kind: NodeKind
	schema: unknown
	normalizedSchema: BaseNormalizedSchema
	inner: object
	errorContext?: BaseErrorContext
	reducibleTo?: NodeKind
	intersectionIsOpen?: true
	prerequisite?: unknown
	childKind?: NodeKind
}

export interface BaseErrorContext<kind extends NodeKind = NodeKind> {
	readonly description?: string
	readonly code: kind
	readonly meta: BaseMeta
}

export type defaultErrorContext<d extends DeclarationInput> = show<
	BaseErrorContext<d["kind"]> & d["inner"]
>

export type declareNode<
	d extends {
		[k in keyof d]: k extends keyof DeclarationInput ? DeclarationInput[k]
		:	never
	} & DeclarationInput
> = merge<
	{
		intersectionIsOpen: false
		prerequisite: prerequisiteOf<d>
		childKind: never
		reducibleTo: d["kind"]
		errorContext: null
	},
	d
>

type prerequisiteOf<d extends DeclarationInput> =
	"prerequisite" extends keyof d ? d["prerequisite"] : unknown

export type attachmentsOf<d extends BaseNodeDeclaration> =
	NarrowedAttachments<d> & attachedInner<d>

// some nonsense to allow TS to infer attache properties on nodes with
// a base declaration like Prop and Range
type attachedInner<d extends BaseNodeDeclaration> =
	"intersection" & d["kind"] extends never ? d["inner"] : {}

export interface BaseNodeDeclaration {
	kind: NodeKind
	schema: unknown
	normalizedSchema: BaseNormalizedSchema
	inner: {}
	reducibleTo: NodeKind
	prerequisite: any
	intersectionIsOpen: boolean
	childKind: NodeKind
	errorContext: BaseErrorContext | null
}

export type ownIntersectionResult<d extends BaseNodeDeclaration> =
	| nodeOfKind<reducibleKindOf<d["kind"]>>
	| Disjoint
