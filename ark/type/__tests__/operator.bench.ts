import { bench } from "@ark/attest"
import { declare, type } from "arktype"

bench.baseline(() => {
	type("symbol")
	type("symbol[]")
	type("symbol").pipe(s => s)
	type(["symbol", "=>", s => s])
	type("symbol").narrow(() => true)
})

bench("array-string", () => type("number[]")).types([917, "instantiations"])

bench("array-tuple", () => type(["number", "[]"])).types([
	896,
	"instantiations"
])

bench("array-chain", () => type("number").array()).types([
	505,
	"instantiations"
])

bench("union-string", () => type("number|string")).types([
	1153,
	"instantiations"
])

bench("union-tuple", () => type(["number", "|", "string"])).types([
	1100,
	"instantiations"
])

bench("union-chain", () => type("number").or("string")).types([
	1397,
	"instantiations"
])

bench("union-10-ary", () => type("0|1|2|3|4|5|6|7|8|9")).types([
	4240,
	"instantiations"
])

bench("intersection-string", () => type("number&0")).types([
	1311,
	"instantiations"
])

bench("intersection-tuple", () => type(["number", "&", "0"])).types([
	1261,
	"instantiations"
])

bench("intersection-chain", () => type("number").and("0")).types([
	1643,
	"instantiations"
])

bench("intersection-10-ary", () =>
	type(
		"unknown&unknown&unknown&unknown&unknown&unknown&unknown&unknown&unknown&unknown"
	)
).types([5030, "instantiations"])

bench("group-shallow", () => type("string|(number[])")).types([
	1421,
	"instantiations"
])

bench("group-nested", () => type("string|(number|(boolean))[][]")).types([
	2151,
	"instantiations"
])

bench("group-deep", () => type("(0|(1|(2|(3|(4|5)[])[])[])[])[]")).types([
	6980,
	"instantiations"
])

bench("bound-single", () => type("string>5")).types([1362, "instantiations"])

bench("bound-double", () => type("-7<=string.integer<99")).types([
	2079,
	"instantiations"
])

bench("divisor", () => type("number%5")).types([956, "instantiations"])

bench("filter-tuple", () => type(["boolean", ":", b => b])).types([
	1346,
	"instantiations"
])

bench("filter-chain", () => type("boolean").narrow(b => b)).types([
	738,
	"instantiations"
])

bench("morph-tuple", () => type(["boolean", "=>", b => b])).types([
	1416,
	"instantiations"
])

bench("morph-chain", () => type("boolean").pipe(b => b)).types([
	848,
	"instantiations"
])

bench("base object", () =>
	type({
		readonly: "'readonly'",
		keyof: "'keyof'",
		get: "'get'",
		pick: "'pick'",
		omit: "'omit'",
		merge: "'merge'",
		required: "'required'",
		partial: "'partial'",
		map: "'map'",
		as: "'as'",
		and: "'and'",
		or: "'or'",
		extract: "'extract'",
		exclude: "'exclude'",
		configure: "'configure'",
		describe: "'describe'",
		onUndeclaredKey: "'onUndeclaredKey'",
		onDeepUndeclaredKey: "'onDeepUndeclaredKey'",
		brand: "'brand'",
		array: "'array'",
		filter: "'filter'",
		narrow: "'narrow'"
	})
).types([10807, "instantiations"])

type Expected = {
	readonly: "readonly"
	keyof: "keyof"
	get: "get"
	pick: "pick"
	omit: "omit"
	merge: "merge"
	required: "required"
	partial: "partial"
	map: "map"
	as: "as"
	and: "and"
	or: "or"
	extract: "extract"
	exclude: "exclude"
	configure: "configure"
	describe: "describe"
	onUndeclaredKey: "onUndeclaredKey"
	onDeepUndeclaredKey: "onDeepUndeclaredKey"
	brand: "brand"
	array: "array"
	filter: "filter"
	narrow: "narrow"
}

bench("base object", () =>
	declare<Expected>().type({
		readonly: "'readonly'",
		keyof: "'keyof'",
		get: "'get'",
		pick: "'pick'",
		omit: "'omit'",
		merge: "'merge'",
		required: "'required'",
		partial: "'partial'",
		map: "'map'",
		as: "'as'",
		and: "'and'",
		or: "'or'",
		extract: "'extract'",
		exclude: "'exclude'",
		configure: "'configure'",
		describe: "'describe'",
		onUndeclaredKey: "'onUndeclaredKey'",
		onDeepUndeclaredKey: "'onDeepUndeclaredKey'",
		brand: "'brand'",
		array: "'array'",
		filter: "'filter'",
		narrow: "'narrow'"
	})
).types([13020, "instantiations"])
