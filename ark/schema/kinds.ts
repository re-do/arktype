import {
	deepClone,
	envHasCsp,
	flatMorph,
	withAlphabetizedKeys,
	type array,
	type listable
} from "@ark/util"
import { mergeConfigs, type ResolvedConfig } from "./config.ts"
import type { BaseNode } from "./node.ts"
import { Predicate } from "./predicate.ts"
import { Divisor } from "./refinements/divisor.ts"
import {
	boundClassesByKind,
	boundImplementationsByKind,
	type BoundDeclarations,
	type BoundNodesByKind
} from "./refinements/kinds.ts"
import { Pattern } from "./refinements/pattern.ts"
import { Alias } from "./roots/alias.ts"
import { Domain } from "./roots/domain.ts"
import { Intersection } from "./roots/intersection.ts"
import { Morph } from "./roots/morph.ts"
import { Proto } from "./roots/proto.ts"
import { Union } from "./roots/union.ts"
import { Unit } from "./roots/unit.ts"
import type { BaseScope } from "./scope.ts"
import type {
	ConstraintKind,
	NodeKind,
	OpenNodeKind,
	RootKind,
	UnknownAttachments,
	UnknownNodeImplementation
} from "./shared/implement.ts"
import { $ark } from "./shared/registry.ts"
import type { makeRootAndArrayPropertiesMutable } from "./shared/utils.ts"
import { Index } from "./structure/index.ts"
import { Optional } from "./structure/optional.ts"
import { Required } from "./structure/required.ts"
import { Sequence } from "./structure/sequence.ts"
import { Structure } from "./structure/structure.ts"

export interface NodeDeclarationsByKind extends BoundDeclarations {
	alias: Alias.Declaration
	domain: Domain.Declaration
	unit: Unit.Declaration
	proto: Proto.Declaration
	union: Union.Declaration
	morph: Morph.Declaration
	intersection: Intersection.Declaration
	sequence: Sequence.Declaration
	divisor: Divisor.Declaration
	required: Required.Declaration
	optional: Optional.Declaration
	index: Index.Declaration
	pattern: Pattern.Declaration
	predicate: Predicate.Declaration
	structure: Structure.Declaration
}

export const nodeImplementationsByKind: Record<
	NodeKind,
	UnknownNodeImplementation
> = {
	...boundImplementationsByKind,
	alias: Alias.implementation,
	domain: Domain.implementation,
	unit: Unit.implementation,
	proto: Proto.implementation,
	union: Union.implementation,
	morph: Morph.implementation,
	intersection: Intersection.implementation,
	divisor: Divisor.implementation,
	pattern: Pattern.implementation,
	predicate: Predicate.implementation,
	required: Required.implementation,
	optional: Optional.implementation,
	index: Index.implementation,
	sequence: Sequence.implementation,
	structure: Structure.implementation
} satisfies Record<NodeKind, unknown> as never

$ark.defaultConfig = withAlphabetizedKeys(
	Object.assign(
		flatMorph(nodeImplementationsByKind, (kind, implementation) => [
			kind,
			implementation.defaults
		]),
		{
			jitless: envHasCsp(),
			clone: deepClone,
			onUndeclaredKey: "ignore",
			numberAllowsNaN: false,
			dateAllowsInvalid: false,
			onFail: null
		} satisfies Omit<ResolvedConfig, NodeKind>
	) as never
)

$ark.resolvedConfig = mergeConfigs($ark.defaultConfig, $ark.config)

export const nodeClassesByKind: Record<
	NodeKind,
	new (attachments: UnknownAttachments, $: BaseScope) => BaseNode
> = {
	...boundClassesByKind,
	alias: Alias.Node,
	domain: Domain.Node,
	unit: Unit.Node,
	proto: Proto.Node,
	union: Union.Node,
	morph: Morph.Node,
	intersection: Intersection.Node,
	divisor: Divisor.Node,
	pattern: Pattern.Node,
	predicate: Predicate.Node,
	required: Required.Node,
	optional: Optional.Node,
	index: Index.Node,
	sequence: Sequence.Node,
	structure: Structure.Node
} satisfies Record<NodeKind, typeof BaseNode<any>> as never

interface NodesByKind extends BoundNodesByKind {
	alias: Alias.Node
	union: Union.Node
	morph: Morph.Node
	intersection: Intersection.Node
	unit: Unit.Node
	proto: Proto.Node
	domain: Domain.Node
	divisor: Divisor.Node
	pattern: Pattern.Node
	predicate: Predicate.Node
	required: Required.Node
	optional: Optional.Node
	index: Index.Node
	sequence: Sequence.Node
	structure: Structure.Node
}

export type nodeOfKind<kind extends NodeKind> = NodesByKind[kind]

export type Declaration<kind extends NodeKind> = NodeDeclarationsByKind[kind]

export type NodeSchema<kind extends NodeKind> = Declaration<kind>["schema"]

export type RootSchema<kind extends RootKind = RootKind> = NodeSchema<kind>

export type NormalizedSchema<kind extends NodeKind> =
	Declaration<kind>["normalizedSchema"]

export type childKindOf<kind extends NodeKind> = Declaration<kind>["childKind"]

export type Prerequisite<kind extends NodeKind> =
	Declaration<kind>["prerequisite"]

export type reducibleKindOf<kind extends NodeKind> =
	Declaration<kind>["reducibleTo"] extends NodeKind ?
		Declaration<kind>["reducibleTo"]
	:	kind

export type Inner<kind extends NodeKind> = Declaration<kind>["inner"]

export type defAttachedAs<kind extends ConstraintKind> =
	kind extends OpenNodeKind ? listable<NodeSchema<kind>> : NodeSchema<kind>

export type innerAttachedAs<kind extends ConstraintKind> =
	kind extends OpenNodeKind ? array<nodeOfKind<kind>> : nodeOfKind<kind>

/** make nested arrays mutable while keeping nested nodes immutable */
export type mutableInnerOfKind<kind extends NodeKind> =
	makeRootAndArrayPropertiesMutable<Inner<kind>>

export type mutableNormalizedRootOfKind<kind extends NodeKind> =
	makeRootAndArrayPropertiesMutable<NormalizedSchema<kind>>

export type errorContext<kind extends NodeKind> =
	Declaration<kind>["errorContext"]
