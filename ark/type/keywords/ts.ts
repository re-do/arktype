import { genericNode, intrinsic, node } from "@ark/schema"
import {
	Hkt,
	type Json,
	type Key,
	type omit,
	type pick,
	type show
} from "@ark/util"
import type { To } from "../attributes.ts"
import type { Module, Submodule } from "../module.ts"
import { Scope } from "../scope.ts"

export const arkTsKeywords: arkTsKeywords = Scope.module({
	bigint: intrinsic.bigint,
	boolean: intrinsic.boolean,
	false: intrinsic.false,
	never: intrinsic.never,
	null: intrinsic.null,
	number: intrinsic.number,
	object: intrinsic.object,
	string: intrinsic.string,
	symbol: intrinsic.symbol,
	true: intrinsic.true,
	unknown: intrinsic.unknown,
	undefined: intrinsic.undefined
})

export type arkTsKeywords = Module<arkTsKeywords.$>

export declare namespace arkTsKeywords {
	export type submodule = Submodule<$>

	export type $ = {
		bigint: bigint
		boolean: boolean
		false: false
		never: never
		null: null
		number: number
		object: object
		string: string
		symbol: symbol
		true: true
		unknown: unknown
		undefined: undefined
	}
}

export const unknown = Scope.module(
	{
		root: intrinsic.unknown,
		any: intrinsic.unknown
	},
	{
		name: "unknown"
	}
)

export declare namespace unknown {
	export type submodule = Submodule<$>

	export type $ = {
		root: unknown
		any: any
	}
}

export const json = Scope.module(
	{
		root: intrinsic.jsonObject,
		stringify: node("morph", {
			in: intrinsic.jsonObject,
			morphs: (data: Json) => JSON.stringify(data),
			declaredOut: intrinsic.string
		})
	},
	{
		name: "object.json"
	}
)

export declare namespace json {
	export type submodule = Submodule<$>

	export type $ = {
		root: Json
		stringify: (In: Json) => To<string>
	}
}

export const object = Scope.module(
	{
		root: intrinsic.object,
		json
	},
	{
		name: "object"
	}
)

export declare namespace object {
	export type submodule = Submodule<$>

	export type $ = {
		root: object
		json: json.submodule
	}
}

class RecordHkt extends Hkt<[Key, unknown]> {
	declare body: Record<this[0], this[1]>

	description =
		"a generic type that instantiates an object from a single index signature and corresponding value type"
}

const Record = genericNode(["K", intrinsic.key], "V")(
	args => ({
		domain: "object",
		index: {
			signature: args.K,
			value: args.V
		}
	}),
	RecordHkt
)

class PickHkt extends Hkt<[object, Key]> {
	declare body: pick<this[0], this[1] & keyof this[0]>
}

const Pick = genericNode(["T", intrinsic.object], ["K", intrinsic.key])(
	args => args.T.pick(args.K as never),
	PickHkt
)

class OmitHkt extends Hkt<[object, Key]> {
	declare body: omit<this[0], this[1] & keyof this[0]>
}

const Omit = genericNode(["T", intrinsic.object], ["K", intrinsic.key])(
	args => args.T.omit(args.K as never),
	OmitHkt
)

class PartialHkt extends Hkt<[object]> {
	declare body: show<Partial<this[0]>>
}

const Partial = genericNode(["T", intrinsic.object])(
	args => args.T.partial(),
	PartialHkt
)

class RequiredHkt extends Hkt<[object]> {
	declare body: show<Required<this[0]>>
}

const Required = genericNode(["T", intrinsic.object])(
	args => args.T.required(),
	RequiredHkt
)

class ExcludeHkt extends Hkt<[unknown, unknown]> {
	declare body: Exclude<this[0], this[1]>
}

const Exclude = genericNode("T", "U")(
	args => args.T.exclude(args.U),
	ExcludeHkt
)

class ExtractHkt extends Hkt<[unknown, unknown]> {
	declare body: Extract<this[0], this[1]>
}

const Extract = genericNode("T", "U")(
	args => args.T.extract(args.U),
	ExtractHkt
)

export const arkTsGenerics: arkTsGenerics.module = Scope.module({
	Exclude,
	Extract,
	Omit,
	Partial,
	Pick,
	Record,
	Required
})

export declare namespace arkTsGenerics {
	export type module = Module<arkTsGenerics.$>

	export type submodule = Submodule<$>

	export type $ = {
		Exclude: typeof Exclude.t
		Extract: typeof Extract.t
		Omit: typeof Omit.t
		Partial: typeof Partial.t
		Pick: typeof Pick.t
		Record: typeof Record.t
		Required: typeof Required.t
	}
}
