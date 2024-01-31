import {
	printable,
	throwParseError,
	type Constructor,
	type and,
	type inferDomain,
	type instanceOf,
	type isAny
} from "@arktype/util"
import { isNode, type NodeSubclass } from "../base.js"
import type { ExpectedContext, Schema } from "../kinds.js"
import {
	compilePrimitive,
	createPrimitiveExpectedContext,
	type CompilationContext
} from "../shared/compile.js"
import type { BaseComponent, BasePrimitive } from "../shared/declare.js"
import type { BasisKind } from "../shared/implement.js"
import type { TraverseApply } from "../traversal/context.js"
import { BaseType, type BaseTypeDeclaration } from "../type.js"
import type { DomainNode, DomainSchema, NonEnumerableDomain } from "./domain.js"
import type { ProtoNode, ProtoSchema } from "./proto.js"
import type { UnitNode, UnitSchema } from "./unit.js"

export type BaseBasisDeclaration = and<BaseTypeDeclaration, { kind: BasisKind }>

export abstract class BaseBasis<
		t,
		d extends BaseBasisDeclaration,
		subclass extends NodeSubclass<d>
	>
	extends BaseType<t, d, subclass>
	implements BasePrimitive
{
	abstract readonly basisName: string
	abstract readonly compiledCondition: string
	abstract readonly compiledNegation: string

	readonly constraintGroup = "basis"

	traverseApply: TraverseApply<d["prerequisite"]> = (data, ctx) => {
		if (!this.traverseAllows(data, ctx)) {
			ctx.error(this.description)
		}
	}

	private expectedContextCache?: ExpectedContext<d["kind"]>
	get expectedContext(): ExpectedContext<d["kind"]> {
		this.expectedContextCache ??= createPrimitiveExpectedContext(this as never)
		return this.expectedContextCache
	}

	compileApply(ctx: CompilationContext) {
		return compilePrimitive("apply", this as any, ctx)
	}

	compileAllows(ctx: CompilationContext) {
		return compilePrimitive("allows", this as any, ctx)
	}
}

export const maybeGetBasisKind = (schema: unknown): BasisKind | undefined => {
	switch (typeof schema) {
		case "string":
			return "domain"
		case "function":
			return "proto"
		case "object":
			if (schema === null) {
				return
			}
			if (isNode(schema)) {
				if (schema.isBasis()) {
					return schema.kind
				}
			}
			if ("domain" in schema) {
				return "domain"
			} else if ("proto" in schema) {
				return "proto"
			} else if ("unit" in schema) {
				return "unit"
			}
	}
}

export type instantiateBasis<def extends Schema<BasisKind>> =
	//allow any to be used to access all refinements
	isAny<def> extends true
		? any
		: def extends NonEnumerableDomain
		? DomainNode<inferDomain<def>>
		: def extends Constructor<infer instance>
		? ProtoNode<instance>
		: def extends DomainSchema<infer domain>
		? DomainNode<inferDomain<domain>>
		: def extends ProtoSchema<infer proto>
		? ProtoNode<instanceOf<proto>>
		: def extends UnitSchema<infer is>
		? UnitNode<is>
		: never

export const assertBasisKind = (schema: unknown) => {
	const basisKind = maybeGetBasisKind(schema)
	if (basisKind === undefined) {
		return throwParseError(
			`${printable(
				schema
			)} is not a valid basis schema. Please provide one of the following:
- A string representing a non-enumerable domain ("string", "number", "object", "bigint", or "symbol")
- A constructor like Array
- A schema object with one of the following keys:
	- "domain"
	- "proto"
	- "unit"`
		)
	}
	return basisKind
}
