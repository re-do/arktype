import { intrinsic } from "@ark/schema"
import type {
	Anonymous,
	AtLeastLength,
	AtMostLength,
	BaseAttributes,
	Default,
	ExactlyLength,
	LengthAttributes,
	LessThanLength,
	MetaAttributes,
	MoreThanLength,
	Nominal,
	Optional,
	brand,
	constraint,
	of
} from "../../attributes.ts"
import type { Module, Submodule } from "../../module.ts"
import { arkModule } from "../utils.ts"
import { alpha } from "./alpha.ts"
import { alphanumeric } from "./alphanumeric.ts"
import { base64 } from "./base64.ts"
import { capitalize } from "./capitalize.ts"
import { creditCard } from "./creditCard.ts"
import { stringDate } from "./date.ts"
import { digits } from "./digits.ts"
import { email } from "./email.ts"
import { integer, type stringInteger } from "./integer.ts"
import { ip } from "./ip.ts"
import { json, type stringJson } from "./json.ts"
import { lower } from "./lower.ts"
import { normalize } from "./normalize.ts"
import { numeric, type stringNumeric } from "./numeric.ts"
import { semver } from "./semver.ts"
import { trim } from "./trim.ts"
import { upper } from "./upper.ts"
import { url } from "./url.ts"
import { uuid } from "./uuid.ts"

export const string = arkModule({
	root: intrinsic.string,
	numeric,
	integer,
	alpha,
	alphanumeric,
	base64,
	digits,
	semver,
	ip,
	creditCard,
	email,
	uuid,
	url,
	json,
	trim,
	upper,
	lower,
	normalize,
	capitalize,
	date: stringDate
})

export type Matching<rule> = {
	matching: constraint<rule>
}

export declare namespace string {
	export type atLeastLength<rule> = of<string, AtLeastLength<rule>>

	export type moreThanLength<rule> = of<string, MoreThanLength<rule>>

	export type atMostLength<rule> = of<string, AtMostLength<rule>>

	export type lessThanLength<rule> = of<string, LessThanLength<rule>>

	export type exactlyLength<rule> = of<string, ExactlyLength<rule>>

	export type matching<rule> = of<string, Matching<rule>>

	export type anonymous = of<string, Anonymous>

	export type optional = of<string, Optional>

	export type defaultsTo<rule> = of<string, Default<rule>>

	export type nominal<rule> = of<string, Nominal<rule>>

	export type is<attributes> = of<string, attributes>

	export type apply<attribute> =
		"brand" extends keyof attribute ? branded.apply<attribute>
		:	applyUnbranded<attribute>

	type applyUnbranded<attribute> =
		attribute extends ExactlyLength<infer rule> ? exactlyLength<rule>
		: attribute extends MoreThanLength<infer rule> ? moreThanLength<rule>
		: attribute extends AtLeastLength<infer rule> ? atLeastLength<rule>
		: attribute extends AtMostLength<infer rule> ? atMostLength<rule>
		: attribute extends LessThanLength<infer rule> ? lessThanLength<rule>
		: attribute extends Matching<infer rule> ? matching<rule>
		: attribute extends Optional ? optional
		: attribute extends Default<infer rule> ? defaultsTo<rule>
		: attribute extends Nominal<infer rule> ? nominal<rule>
		: never

	export interface Attributes extends MetaAttributes, Attributes.Brandable {}

	export namespace Attributes {
		export type Kind = keyof Attributes

		export interface Brandable extends BaseAttributes, LengthAttributes {
			matching: string
		}

		export namespace Brandable {
			export type Kind = keyof Brandable
		}
	}

	export type attach<
		base extends string,
		kind extends Attributes.Kind,
		value extends Attributes[kind],
		existingAttributes = unknown
	> =
		string extends base ?
			unknown extends existingAttributes ?
				kind extends "matching" ? matching<value>
				: kind extends "optional" ? optional
				: kind extends "default" ? defaultsTo<value>
				: never
			:	is<existingAttributes & createAttribute<kind, value>>
		:	of<base, existingAttributes & createAttribute<kind, value>>

	export type module = Module<string.submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: string
		alpha: alpha
		alphanumeric: alphanumeric
		base64: base64.submodule
		digits: digits
		numeric: stringNumeric.submodule
		integer: stringInteger.submodule
		creditCard: creditCard
		email: email
		uuid: uuid.submodule
		semver: semver
		ip: ip.submodule
		json: stringJson.submodule
		date: stringDate.submodule
		url: url.submodule
		trim: trim.submodule
		normalize: normalize.submodule
		capitalize: capitalize.submodule
		lower: lower.submodule
		upper: upper.submodule
	}

	export type branded<rule> = brand<string, Nominal<rule>>

	export namespace branded {
		export type atLeastLength<rule> = brand<string, AtLeastLength<rule>>

		export type moreThanLength<rule> = brand<string, MoreThanLength<rule>>

		export type atMostLength<rule> = brand<string, AtMostLength<rule>>

		export type lessThanLength<rule> = brand<string, LessThanLength<rule>>

		export type exactlyLength<rule> = brand<string, ExactlyLength<rule>>

		export type matching<rule> = brand<string, Matching<rule>>

		export type anonymous = brand<string, Anonymous>

		export type is<attributes> = brand<string, attributes>

		export type apply<attribute> =
			attribute extends ExactlyLength<infer rule> ? exactlyLength<rule>
			: attribute extends MoreThanLength<infer rule> ? moreThanLength<rule>
			: attribute extends AtLeastLength<infer rule> ? atLeastLength<rule>
			: attribute extends AtMostLength<infer rule> ? atMostLength<rule>
			: attribute extends LessThanLength<infer rule> ? lessThanLength<rule>
			: attribute extends Matching<infer rule> ? matching<rule>
			: attribute extends Nominal<infer rule> ? branded<rule>
			: never
	}
}
