import type { Dict, evaluate, extend } from "@arktype/util"
import type { NarrowedAttachments } from "../base.js"
import type { Declaration, OpenComponentKind } from "../kinds.js"
import type {
	ConstraintKind,
	NodeKind,
	PrimitiveKind,
	PropKind,
	SetKind
} from "./define.js"
import type { Disjoint } from "./disjoint.js"
import type { rightOf } from "./intersect.js"

export type BaseMeta = {
	readonly description?: string
}

export type withBaseMeta<o extends object> = extend<BaseMeta, o>

export type BaseIntersectionMap = {
	[lKey in NodeKind]: evaluate<
		{
			[requiredKey in lKey]:
				| lKey
				| Disjoint
				| (lKey extends OpenComponentKind ? null : never)
		} & {
			[rKey in rightOf<lKey> | "default"]?:
				| lKey
				| Disjoint
				| (lKey extends ConstraintKind ? null : never)
		}
	>
}

export type UnknownIntersections = {
	[rKey in NodeKind | "default"]?: NodeKind | Disjoint | null
}

export type DeclarationInput = {
	kind: NodeKind
	schema: unknown
	intersections: UnknownIntersections
	normalizedSchema: BaseMeta
	inner: Dict
	meta?: Dict
	prerequisite?: unknown
	childKind?: NodeKind
}

type ParentsByKind = {
	[k in NodeKind]: {
		[pKind in NodeKind]: k extends Declaration<k>["childKind"] ? pKind : never
	}[NodeKind]
}

type parentKindOf<kind extends NodeKind> = ParentsByKind[kind]

export type declareNode<d extends DeclarationInput> = extend<
	d,
	{
		meta: "meta" extends keyof d ? extend<BaseMeta, d["meta"]> : BaseMeta
		prerequisite: "prerequisite" extends keyof d ? d["prerequisite"] : unknown
		childKind: "childKind" extends keyof d ? d["childKind"] : never
		parentKind: parentKindOf<d["kind"]>
	}
>

export type attachmentsOf<d extends BaseNodeDeclaration> =
	NarrowedAttachments<d> & d["inner"]

export type BaseNodeDeclaration = {
	kind: NodeKind
	schema: unknown
	normalizedSchema: Dict & BaseMeta
	meta: Dict & BaseMeta
	inner: Dict
	prerequisite: any
	childKind: NodeKind
	parentKind: SetKind | PropKind
	intersections: {
		[k in NodeKind | "default"]?: NodeKind | Disjoint | null
	}
}

export interface PrimitiveNode {
	readonly kind: PrimitiveKind
	readonly compiledActual?: string
	readonly compiledCondition: string
	readonly compiledNegation: string
}
