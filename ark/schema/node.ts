import type {
	AbstractableConstructor,
	conform,
	Constructor,
	Dict,
	extend
} from "@arktype/util"
import { DynamicBase } from "@arktype/util"
import type { ConstraintClassesByKind } from "./constraints/constraint.js"
import type { TypeClassesByKind, validateBranchInput } from "./types/type.js"

export interface BaseAttributes {
	alias?: string
	description?: string
}

export type NodeIds = {
	in: string
	out: string
	type: string
	reference: string
}

export const schema = <const branches extends readonly unknown[]>(
	...branches: {
		[i in keyof branches]: validateBranchInput<branches[i]>
	}
) => branches

const prevalidated = Symbol("used to bypass validation when creating a node")

export type Prevalidated = typeof prevalidated

export const createReferenceId = (
	referenceObject: Record<string, unknown>,
	schema: BaseAttributes
) => {
	if (schema.description) {
		referenceObject.description = schema.description
	}
	if (schema.alias) {
		referenceObject.alias = schema.alias
	}
	return JSON.stringify(referenceObject)
}

// TODO: map schema keys to id kinds
// For each key, if the value is a Node or list of Nodes, recurse?
type SchemaValueKind = "meta" | "in" | "out" | "type"

// TODO: Terminal nodes have a condition that is compiled directly
// Also should be associated with a problem type for if that conditions fails

// Nonterminal nodes would compile their logic in some arbitrary function TBD

// NOTE: utilize composition, don't worry about e.g. having to call a function from each terminal node

export interface StaticBaseNode<children extends BaseAttributes> {
	new (children: children): BaseNode<children, any>
	keyKinds: Record<keyof children, SchemaValueKind>
	writeDefaultDescription(children: children): string
}

type childrenOf<nodeClass> = ConstructorParameters<
	conform<nodeClass, AbstractableConstructor>
>[0]

type extensionKeyOf<nodeClass> = Exclude<
	keyof childrenOf<nodeClass>,
	keyof BaseAttributes
>

export abstract class BaseNode<
	children extends BaseAttributes,
	nodeClass extends StaticBaseNode<children>
> extends DynamicBase<children> {
	abstract kind: NodeKind

	declare condition: string
	nodeClass = this.constructor as nodeClass

	alias: string
	description: string

	protected static readonly prevalidated = prevalidated

	protected static declareKeyKinds<nodeClass>(
		this: nodeClass,
		keyKinds: {
			[k in extensionKeyOf<nodeClass>]: SchemaValueKind
		}
	): { [k in keyof childrenOf<nodeClass>]-?: SchemaValueKind } {
		return {
			alias: "meta",
			description: "meta",
			...(keyKinds as any)
		}
	}

	constructor(
		public children: ConstructorParameters<nodeClass>[0] & object,
		public ids: NodeIds
	) {
		super(children)
		this.alias = children.alias ?? "generated"
		this.description =
			children.description ??
			(this.constructor as NodeClass).writeDefaultDescription(children as never)
	}

	equals(other: BaseNode<any, any>) {
		return this.ids.type === other.ids.type
	}

	allows(data: unknown) {
		return true
	}

	hasKind<kind extends NodeKind>(kind: kind): this is Node<kind> {
		return this.kind === kind
	}

	toString() {
		return this.description
	}
}

export type NodeClassesByKind = extend<
	ConstraintClassesByKind,
	TypeClassesByKind
>

export type NodeKind = keyof NodeClassesByKind

export type NodeClass<kind extends NodeKind = NodeKind> =
	NodeClassesByKind[kind]

export type Schema<kind extends NodeKind> = Parameters<
	NodeClass<kind>["from"]
>[0]

export type Children<kind extends NodeKind> = ConstructorParameters<
	NodeClass<kind>
>[0]

export type Node<kind extends NodeKind = NodeKind> = InstanceType<
	NodeClass<kind>
>
