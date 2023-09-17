import type { conform, Domain, inferDomain } from "@arktype/util"
import { Hkt } from "@arktype/util"
import { Disjoint } from "../disjoint.js"
import type { BaseAttributes, Node, parseNode } from "../schema.js"
import { BaseNode, nodeParser } from "../schema.js"
import type { Basis } from "./basis.js"
import type { BaseRefinement } from "./refinement.js"

export interface DomainSchema<
	domain extends NonEnumerableDomain = NonEnumerableDomain
> extends BaseAttributes {
	domain: domain
}

export type DomainInput = NonEnumerableDomain | DomainSchema

export class DomainNode<
	// @ts-expect-error (coerce the variance of schema to out since TS gets confused by inferDomain)
	out schema extends DomainSchema = DomainSchema
> extends BaseNode<schema> {
	readonly kind = "domain"

	declare infer: inferDomain<schema["domain"]>

	protected constructor(schema: schema) {
		super(schema)
	}

	static hkt = new (class extends Hkt {
		f = (input: conform<this[Hkt.key], DomainInput>) => {
			return new DomainNode(
				typeof input === "string" ? { domain: input } : input
			) as {} as typeof input extends DomainSchema
				? DomainNode<typeof input>
				: typeof input extends NonEnumerableDomain
				? DomainNode<{ domain: typeof input }>
				: never
		}
	})()

	static from = nodeParser(this)

	hash() {
		return this.domain
	}

	writeDefaultDescription() {
		return domainDescriptions[this.domain]
	}

	intersectOwnKeys(other: Node) {
		return other.kind === "domain" ? Disjoint.from("domain", this, other) : null
	}
}

export const domainNode = DomainNode.from

/** Each domain's completion for the phrase "Must be _____" */
export const domainDescriptions = {
	bigint: "a bigint",
	boolean: "boolean",
	null: "null",
	number: "a number",
	object: "an object",
	string: "a string",
	symbol: "a symbol",
	undefined: "undefined"
} as const satisfies Record<Domain, string>

// only domains with an infinite number of values are allowed as bases
export type NonEnumerableDomain = Exclude<
	Domain,
	"null" | "undefined" | "boolean"
>
