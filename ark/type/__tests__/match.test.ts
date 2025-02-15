import { attest, contextualize } from "@ark/attest"
import { registeredReference, writeUnboundableMessage } from "@ark/schema"
import { match, scope, type } from "arktype"
import type { Out } from "arktype/internal/attributes.ts"
import { doubleAtMessage, throwOnDefault } from "arktype/internal/match.ts"

const throwDefaultRef = registeredReference(throwOnDefault)

contextualize(() => {
	it("single object", () => {
		const sizeOf = match({
			"string|Array": v => v.length,
			number: v => v,
			bigint: v => v,
			default: "assert"
		})

		attest<number>(sizeOf("abc")).equals(3)
		attest<number>(sizeOf([1, 2, 3])).equals(3)
		attest<bigint>(sizeOf(5n)).equals(5n)

		const getBad = () => sizeOf(true)
		attest<() => never>(getBad)
		// ideally would also include number | bigint, discriminated out
		attest(getBad).throws.snap(
			"AggregateError: must be a string or an object (was boolean)"
		)
	})

	it("completes case keys", () => {
		attest(() =>
			match({
				// prettier-ignore
				// @ts-expect-error
				"big": () => true
			})
		).completions({ big: ["bigint"] })
	})

	it("completes default key", () => {
		attest(() =>
			match({
				bigint: () => true,
				// prettier-ignore
				// @ts-expect-error
				"defaul": () => false
			})
		).completions({ defaul: ["default"] })
	})

	it("completes shallow fluent defs", () => {
		// @ts-expect-error
		attest(() => match.case("WeakS")).completions({ WeakS: ["WeakSet"] })
	})

	it("completes object fluent defs", () => {
		attest(() =>
			match.case(
				{
					// @ts-expect-error
					id: "string | numb"
				},
				o => o.id
			)
		).completions({ "string | numb": ["string | number"] })
	})

	it("properly infers types of inputs/outputs based on chained", () => {
		const matcher = match({ string: s => s, number: n => n })
			.case("boolean", b => b)
			.default("assert")

		// properly infers the type of the output based on the input
		attest<string>(matcher("abc")).equals("abc")
		attest<number>(matcher(4)).equals(4)
		attest<boolean>(matcher(true)).equals(true)

		// and properly handles unions in the input type
		attest<string | number>(matcher(0 as string | number))

		const getBad = () => matcher(null)
		attest<() => never>(getBad)
		// this sucks and should be improved- result of discrimination
		attest(getBad).throws.snap("AggregateError: must be boolean (was null)")
	})

	it("multiple case blocks", () => {
		const m = match({
			"1": n => n,
			"2": n => n + 2
		}).match({
			"3": n => n + 3,
			default: "assert"
		})

		attest<1>(m(1)).equals(1)
		attest<number>(m(2)).equals(4)
		attest<number>(m(3)).equals(6)
		attest(m).type.toString.snap(`Match<
	unknown,
	[(In: 1) => 1, (In: 2) => number, (In: 3) => number]
>`)
	})

	it("default value", () => {
		const m = match({
			string: s => s.length,
			default: v => v
		})

		attest(m("foo")).equals(3)
		attest(m(5)).equals(5)

		attest(m).type.toString.snap(`Match<
	unknown,
	[(In: string) => number, (v: unknown) => unknown]
>`)
	})

	it("never", () => {
		const m = match({
			string: s => s.length,
			default: "never"
		})

		attest(m("foo")).equals(3)

		attest(m).type.toString.snap("Match<string, [(In: string) => number]>")
	})

	it("within scope", () => {
		const threeSixtyNoScope = scope({ three: "3", sixty: "60", no: "'no'" })

		let threeCount = 0
		let sixtyCount = 0

		const matcher = threeSixtyNoScope
			.match({
				three: three => {
					threeCount++
					attest<3>(three)
					return 3
				}
			})
			.case("sixty", sixty => {
				sixtyCount++
				attest<60>(sixty)
				return 60
			})
			.default("assert")

		// for assertions
		matcher(3)
		matcher(60)

		attest(threeCount).equals(1)
		attest(sixtyCount).equals(1)
	})

	it("properly propagates errors from invalid type definitions in `when`", () => {
		// @ts-expect-error
		attest(() => match({}).case("strong", s => s)).type.errors(
			"'strong' is unresolvable"
		)
	})

	it("properly propagates errors from invalid type definitions in `cases`", () => {
		// @ts-expect-error
		attest(() => match({ strong: s => s })).type.errors(
			"'strong' is unresolvable"
		)
	})

	it("semantic error in case", () => {
		attest(() =>
			match({
				// @ts-expect-error
				"boolean < 5": () => true
			})
		).throwsAndHasTypeError(writeUnboundableMessage("boolean"))
	})

	it("does not accept invalid inputs at a type-level", () => {
		const matcher = match
			.in<string | number>()
			.case("string", s => s)
			.case("number", n => n)
			.default("never")

		// @ts-expect-error
		attest(() => matcher(true))
			.throws.snap("AggregateError: must be a string or a number (was boolean)")
			.type.errors(
				"Argument of type 'boolean' is not assignable to parameter of type 'string | number'"
			)
	})

	it("from exhaustive", () => {
		const matcher = match
			.in("string | number")
			.match({
				string: s => s,
				number: n => n
			})
			.default("assert")

		attest(matcher).type.toString.snap(`Match<
	string | number,
	[(In: string) => string, (In: number) => number]
>`)

		// @ts-expect-error
		attest(() => matcher(true))
			.throws.snap("AggregateError: must be a string or a number (was boolean)")
			.type.errors(
				"Argument of type 'boolean' is not assignable to parameter of type 'string | number'"
			)
	})

	it("argless `in` type error", () => {
		// @ts-expect-error
		attest(() => match.in()).type.errors("Expected 1 arguments, but got 0")
	})

	it("allows ordered overlapping", () => {
		const m = match({
			"0 < number < 10": function _matchOverlapping1(n) {
				return [0, n]
			},
			// this will never be hit since it is a subtype of a previous case
			"number > 0": function _matchOverlapping2(n) {
				return [1, n]
			},
			number: function _matchOverlapping3(n) {
				return [2, n]
			},
			default: function _matchOverlapping4(v) {
				return [3, v]
			}
		})

		attest(m.internal.json).snap({
			branches: [
				{
					in: {
						domain: "number",
						max: { exclusive: true, rule: 10 },
						min: { exclusive: true, rule: 0 }
					},
					morphs: ["$ark._matchOverlapping1"]
				},
				{
					in: { domain: "number", min: { exclusive: true, rule: 0 } },
					morphs: ["$ark._matchOverlapping2"]
				},
				{ in: "number", morphs: ["$ark._matchOverlapping3"] },
				{ in: {}, morphs: ["$ark._matchOverlapping4"] }
			],
			ordered: true
		})

		attest(m(5)).equals([0, 5])
		attest(m(11)).equals([1, 11])
		attest(m(0)).equals([2, 0])
		attest(m(undefined)).equals([3, undefined])
	})

	it("prunes subtype cases", () => {
		const m = match({
			"0 < number < 10": function _matchPreservedOne(n) {
				return [0, n]
			},
			// this will never be hit since it is a subtype of a previous case
			"4 < number < 6": function _matchPrunedOne(n) {
				return [1, n]
			},
			number: function _matchPreservedTwo(n) {
				return [2, n]
			},
			default: function _matchPreservedDefault(v) {
				return [3, v]
			}
		})

		attest(m.internal.json).snap({
			branches: [
				{
					in: {
						domain: "number",
						max: { exclusive: true, rule: 10 },
						min: { exclusive: true, rule: 0 }
					},
					morphs: ["$ark._matchPreservedOne"]
				},
				{ in: "number", morphs: ["$ark._matchPreservedTwo"] },
				{ in: {}, morphs: ["$ark._matchPreservedDefault"] }
			],
			ordered: true
		})
	})

	describe("at", () => {
		it("unknown allows any key", () => {
			const m = match.at("n").match({
				"0": o => `${o.n} = 0` as const,
				"1": o => `${o.n} = 1` as const,
				default: "never"
			})

			attest<"0 = 0">(m({ n: 0 })).equals("0 = 0")
			attest<"1 = 1">(m({ n: 1 })).equals("1 = 1")

			// @ts-expect-error
			attest(() => m({}))
				// (was missing) would be better here, undefined is a result of discrimination
				.throws.snap("AggregateError: n must be 0 or 1 (was undefined)")
				.type.errors.snap(
					"Argument of type '{}' is not assignable to parameter of type '{ n: 0; } | { n: 1; }'."
				)
		})

		it("in", () => {
			const m = match
				.in<{ kind: string }>()
				.at("kind")
				.case("'a'", o => {
					attest<{
						kind: "a"
					}>(o).equals({ kind: "a" })
					return [o.kind]
				})
				.default(o => o.kind)

			attest(m({ kind: "a" })).snap(["a"])
			attest(m({ kind: "b" })).snap("b")

			// @ts-expect-error
			attest(() => m({})).type.errors("Property 'kind' is missing")
		})

		it("in completions", () => {
			const base = match.in<{ kind: string }>()
			// @ts-expect-error
			attest(() => base.at("")).completions({ "": ["kind"] })
		})

		it("keyless in", () => {
			const m = match
				.in<object>()
				.at("foo")
				.match({
					true: t => t,
					default: "assert"
				})

			attest(m).type.toString.snap(`Match<
	object,
	[(In: { foo: true }) => { foo: true }]
>`)
		})

		it("at with cases param", () => {
			const m = match.at("foo", {
				string: function _atCasesParam1(o) {
					return o.foo.length
				},
				number: function _atCasesParam2(o) {
					return `${o.foo + 1}`
				},
				default: "never"
			})

			attest(m.internal.json).snap({
				branches: [
					{
						in: {
							required: [{ key: "foo", value: "string" }],
							domain: "object"
						},
						morphs: ["$ark._atCasesParam1"]
					},
					{
						in: {
							required: [{ key: "foo", value: "number" }],
							domain: "object"
						},
						morphs: ["$ark._atCasesParam2"]
					}
				],
				ordered: true,
				meta: { onFail: throwDefaultRef }
			})
			attest(m).type.toString.snap(`Match<
	{ foo: string } | { foo: number },
	[
		(In: { foo: string }) => number,
		(In: { foo: number }) => string
	]
>`)
		})

		it("at after in", () => {
			const m = match
				.in<{ id: 0 | 1 | 2 }>()
				.at("id")
				.match({
					"0": function _atAfterIn1(o) {
						return o.id
					},
					// correctly inferred
					number: function _atAfterIn2(o) {
						return o.id
					},
					default: "never"
				})

			attest(m.internal.json).snap({
				branches: [
					{
						in: {
							required: [{ key: "id", value: { unit: 0 } }],
							domain: "object"
						},
						morphs: ["$ark._atAfterIn1"]
					},
					{
						in: {
							required: [{ key: "id", value: "number" }],
							domain: "object"
						},
						morphs: ["$ark._atAfterIn2"]
					}
				],
				ordered: true,
				meta: { onFail: throwDefaultRef }
			})
			attest(m).type.toString.snap(`Match<
	{ id: 0 | 1 | 2 } | { id: 0 },
	[
		(In: { id: 0 | 1 | 2 }) => 0 | 1 | 2,
		(In: { id: 0 }) => 0
	]
>`)
		})

		it("multiple ats", () => {
			attest(() => {
				match
					.at("foo", {
						string: o => o.foo.length
					})
					// @ts-expect-error
					.at("bar")
			}).throwsAndHasTypeError(doubleAtMessage)
		})
	})

	it("attached to type", () => {
		attest<typeof match>(type.match).equals(match)
	})

	it("initial case", () => {
		const initial = match.case("string", Number.parseInt).default("assert")

		const expected = match({
			string: Number.parseInt,
			default: "assert"
		})

		// ensure structure is identical
		attest(initial.internal.json).equals(expected.internal.json)
		// ensure we are able to cache ordered unions like from matchers
		attest(initial.internal.id).equals(expected.internal.id)
		// ensure ids are doing what they're suppoed to

		// for some reason TS can't handle initial/expected comparison so we have to cast
		attest(initial === (expected as {})).equals(true)

		// like the uncasted version of the above equality check,
		// uncommenting this also causes an infinite depth issue
		// attest<typeof expected>(initial)

		const expectedTypeSnapshot = "Match<unknown, [(In: string) => number]>"
		attest(initial).type.toString(expectedTypeSnapshot)
		attest(initial).type.toString(expectedTypeSnapshot)
	})

	it("reference in object", () => {
		const m = match({
			string: s => s.length,
			default: "assert"
		})

		const t = type({
			foo: m
		})

		attest<{
			foo: (In: string) => Out<number>
		}>(t.t)
		attest(t.expression).snap("{ foo: (In: string) => Out<unknown> }")
		attest(t({ foo: "foo" })).equals({ foo: 3 })
		attest(t({ foo: 5 }).toString()).snap("foo must be a string (was a number)")
	})

	it("morph key", () => {
		const parseNum = match({
			"string.numeric.parse": function _matchMorphKey1(valid) {
				return valid
			},
			default: function _matchMorphKey2() {
				return null
			}
		})

		attest<number | null>(parseNum("12.34")).equals(12.34)
		attest<null>(parseNum(12.34)).equals(null)
	})

	it("fluent morph", () => {
		const parseInt = match
			.case("string.integer.parse", function _matchFluentMorph1(valid) {
				return valid
			})
			.default(function _matchFluentMorph2() {
				return null
			})

		attest<number | null>(parseInt("1234")).equals(1234)
		attest<null>(parseInt(1234)).equals(null)
	})

	it("accounts for ordering during discrimination", () => {
		const m = match
			.case(
				{
					id: "string"
				},
				function _matchOrderedDiscrimination1(o) {
					return o.id
				}
			)
			.case(
				{
					kind: "'string'"
				},
				function _matchOrderedDiscrimination2(o) {
					return o.kind
				}
			)
			.case(
				{
					kind: "'number'"
				},
				function _matchOrderedDiscrimination3(o) {
					return o.kind
				}
			)
			.case(
				{
					id: "number"
				},
				function _matchOrderedDiscrimination4(o) {
					return o.id
				}
			)
			.default("assert")

		attest(m.internal.assertHasKind("union").discriminantJson).snap({
			kind: "domain",
			path: ["id"],
			cases: {
				'"string"': { in: {}, morphs: ["$ark._matchOrderedDiscrimination1"] },
				'"number"': {
					kind: "unit",
					path: ["kind"],
					cases: {
						'"string"': {
							branches: [
								{ in: {}, morphs: ["$ark._matchOrderedDiscrimination2"] },
								{ in: {}, morphs: ["$ark._matchOrderedDiscrimination4"] }
							],
							ordered: true
						},
						'"number"': {
							branches: [
								{ in: {}, morphs: ["$ark._matchOrderedDiscrimination3"] },
								{ in: {}, morphs: ["$ark._matchOrderedDiscrimination4"] }
							],
							ordered: true
						},
						default: { in: {}, morphs: ["$ark._matchOrderedDiscrimination4"] }
					}
				},
				default: {
					kind: "unit",
					path: ["kind"],
					cases: {
						'"string"': {
							in: {},
							morphs: ["$ark._matchOrderedDiscrimination2"]
						},
						'"number"': {
							in: {},
							morphs: ["$ark._matchOrderedDiscrimination3"]
						}
					}
				}
			}
		})
		attest(m).type.toString.snap(`Match<
	unknown,
	[
		(In: { id: string }) => string,
		(In: { kind: "string" }) => "string",
		(In: { kind: "number" }) => "number",
		(In: { id: number }) => number
	]
>`)
	})

	it("allows number keys", () => {
		const numeric = match({
			0: function numericZeroCase(n) {
				return `${n}` as const
			},
			1: function numericOneCase(n) {
				return `${n}` as const
			},
			default: "assert"
		})

		attest(numeric).type.toString.snap(`Match<
	unknown,
	[(In: number) => "0", (In: number) => "1"]
>`)
		attest(numeric.json).snap({
			branches: [
				{ in: { unit: 0 }, morphs: ["$ark.numericZeroCase"] },
				{ in: { unit: 1 }, morphs: ["$ark.numericOneCase"] }
			],
			ordered: true,
			meta: { onFail: "$ark.throwOnDefault" }
		})
	})

	it("union inputs", () => {
		const stringifyResponse = match({
			"true | 1": n => `${n}`,
			"false | 0": n => `${n}`,
			default: "assert"
		})

		attest(stringifyResponse).type.toString.snap(`Match<
	unknown,
	[(In: true | 1) => string, (In: false | 0) => string]
>`)

		attest(stringifyResponse(true)).snap("true")
		attest(stringifyResponse(false)).snap("false")
		attest(stringifyResponse(1)).snap("1")
		attest(stringifyResponse(0)).snap("0")
	})

	it("discriminated", () => {
		type Data =
			| {
					id: 1
					oneValue: number
			  }
			| {
					id: 2
					twoValue: string
			  }

		const discriminateValue = match
			.in<Data>()
			.at("id")
			.match({
				1: o => `${o.oneValue}!`,
				2: o => o.twoValue.length,
				default: "assert"
			})

		attest(discriminateValue).type.toString.snap(`Match<
	Data,
	[(In: Data) => string, (In: Data) => number]
>`)

		const a = discriminateValue({ id: 1, oneValue: 1 })
		attest(a).equals("1!")
		const b = discriminateValue({ id: 2, twoValue: "two" })
		attest(b).equals(3)
		// @ts-expect-error
		attest(() => discriminateValue({ oneValue: 3 }))
			.throws.snap("AggregateError: id must be 1 or 2 (was undefined)")
			.type.errors("Property 'id' is missing in type '{ oneValue: number; }'")
	})

	it("default ArkErrors", () => {
		const m = match({
			string: s => s.length,
			number: n => n,
			default: "reject"
		})

		attest(m).type.toString.snap(`Match<
	unknown,
	[
		(In: number) => number,
		(In: string) => number,
		(In: unknown) => ArkErrors
	]
>`)

		attest(m("foo")).equals(3)
		attest(m(3)).equals(3)
		// can access directly since it has no overlap with input
		attest(m(null).summary).snap("must be a string or a number (was null)")
	})

	it("docs example 2", () => {
		const sizeOf = match({
			string: v => v.length,
			number: v => v,
			bigint: v => v
			// match any object with a length property
		})
			.case({ length: "number" }, o => o.length)
			.default("assert")

		attest(sizeOf("abc")).equals(3)
		attest(sizeOf({ name: "David", length: 5 })).equals(5)
		attest(() => sizeOf(null)).throws.snap(
			"AggregateError: must be a string, a number, a bigint or an object (was null)"
		)
	})
})
