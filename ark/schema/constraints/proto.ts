import type { AbstractableConstructor, instanceOf } from "@arktype/util"
import {
	constructorExtends,
	getExactBuiltinConstructorName,
	objectKindDescriptions,
	objectKindOf
} from "@arktype/util"
import { builtins } from "../builtins.js"
import { Disjoint } from "../disjoint.js"
import { compileSerializedValue } from "../io/compile.js"
import { type BaseAttributes, BaseNode } from "../node.js"
import type { BaseBasis } from "./basis.js"

export interface ProtoInner<
	proto extends AbstractableConstructor = AbstractableConstructor
> extends BaseAttributes {
	readonly proto: proto
}

export type ProtoSchema<
	proto extends AbstractableConstructor = AbstractableConstructor
> = proto | ProtoInner

export class ProtoNode<
		proto extends AbstractableConstructor = AbstractableConstructor
	>
	extends BaseNode<ProtoInner, typeof ProtoNode>
	implements BaseBasis
{
	static readonly kind = "proto"

	declare infer: instanceOf<proto>

	readonly knownObjectKind = objectKindOf(this.proto)
	readonly basisName = `${this.proto.name}`
	readonly domain = "object"

	static readonly keyKinds = this.declareKeys({
		proto: "in"
	})

	// readonly literalKeys = prototypeKeysOf(this.rule.prototype)

	static readonly intersections = this.defineIntersections({
		proto: (l, r) =>
			constructorExtends(l.proto, r.proto)
				? l
				: constructorExtends(r.proto, l.proto)
				? r
				: Disjoint.from("proto", l, r),
		domain: (l, r): ProtoInner | Disjoint =>
			r.domain === "object"
				? l
				: Disjoint.from("domain", builtins.object().unwrapOnly("domain")!, r)
	})

	static readonly compile = this.defineCompiler(
		(inner) =>
			`${this.argName} instanceof ${
				objectKindOf(inner.proto) ?? compileSerializedValue(inner.proto)
			}`
	)

	static from<rule extends AbstractableConstructor>(schema: ProtoSchema<rule>) {
		return new ProtoNode<rule>(
			typeof schema === "function" ? { proto: schema } : schema
		)
	}

	static writeDefaultDescription(inner: ProtoInner) {
		const knownObjectKind = getExactBuiltinConstructorName(inner.proto)
		return knownObjectKind
			? objectKindDescriptions[knownObjectKind]
			: `an instance of ${inner.proto.name}`
	}

	extendsOneOf<constructors extends readonly AbstractableConstructor[]>(
		...constructors: constructors
	): this is ProtoNode<constructors[number]> {
		return constructors.some((constructor) =>
			constructorExtends(this.proto, constructor)
		)
	}
}
