import { attest, contextualize } from "@ark/attest"
import {
	assertNodeKind,
	intrinsic,
	writeIndiscriminableMorphMessage,
	writeInvalidOperandMessage,
	writeMorphIntersectionMessage,
	type ArkErrors
} from "@ark/schema"
import { keywords, scope, type, type Type } from "arktype"
import type { Out, To } from "arktype/internal/attributes.ts"

contextualize(() => {
	it("base", () => {
		const t = type("number").pipe(data => `${data}`)
		attest<Type<(In: number) => Out<string>>>(t)
		attest<string>(t.infer)
		attest<number>(t.in.infer)
		const out = t(5)
		attest<string | type.errors>(out).equals("5")
		const result = t("foo")
		attest(result.toString()).snap("must be a number (was a string)")
	})

	it("disjoint", () => {
		attest(() => type("number>5").pipe(type("number<3"))).throws.snap(
			"ParseError: Intersection of > 5 and < 3 results in an unsatisfiable type"
		)
	})

	it("to", () => {
		const t = type("string.json.parse").to({
			name: "string",
			age: "number"
		})

		const tOut = t.out
		const expected = type({
			name: "string",
			age: "number"
		})

		attest<typeof expected.t>(tOut.t)
		attest(tOut.expression).equals(expected.expression)
	})

	it("to morph", () => {
		const restringifyUser = (o: object) => JSON.stringify(o)

		const t = type("string.json.parse").to([
			{
				name: "string",
				age: "number"
			},
			"=>",
			restringifyUser
		])

		attest(t.t).type.toString.snap("(In: string) => Out<string>")

		attest<string>(t.infer)
		attest(t.json).snap({
			in: "string",
			morphs: [
				"$ark.parseJson",
				{
					in: {
						required: [
							{ key: "age", value: "number" },
							{ key: "name", value: "string" }
						],
						domain: "object"
					},
					morphs: ["$ark.restringifyUser"]
				}
			]
		})
	})

	describe("try", () => {
		it("can catch thrown errors", () => {
			const parseJson = type("string").pipe.try((s): object => JSON.parse(s))

			const out = parseJson("[]")

			attest<ArkErrors | object>(out)
			attest(out).equals([])

			const badOut = parseJson("{ unquoted: true }")

			attest(badOut.toString()).satisfies(
				/^must be valid according to an anonymous predicate \(was aborted due to error:\n {4}SyntaxError:/
			)
		})

		it("preserves validated out", () => {
			const t = type("string").pipe.try(
				s => JSON.parse(s),
				keywords.Array.readonly
			)

			const tOut = t.out
			const expectedOut = keywords.Array.readonly

			attest<typeof expectedOut.t>(tOut.t)
			attest(tOut.expression).equals(expectedOut.expression)
		})
	})

	it("can't directly constrain morph", () => {
		// @ts-expect-error
		attest(() => type("string.numeric.parse").atMostLength(5))
			.throws(
				writeInvalidOperandMessage(
					"maxLength",
					intrinsic.lengthBoundable,
					keywords.string.numeric.parse.internal
				)
			)
			.type.errors("Property 'atMostLength' does not exist")
	})

	it("within type", () => {
		const t = type(["boolean", "=>", data => !data])
		attest<Type<(In: boolean) => Out<boolean>>>(t)

		const serializedMorphs = t.internal.assertHasKind("morph").serializedMorphs

		attest(t.json).snap({
			in: [{ unit: false }, { unit: true }],
			morphs: serializedMorphs
		})

		const out = t(true)
		attest<boolean | type.errors>(out).equals(false)
		attest(t(1).toString()).snap("must be boolean (was 1)")
	})

	it("unit branches", () => {
		const t = type("0 | 1 | 2").pipe(n => n + 1)
		attest<(In: 0 | 1 | 2) => Out<number>>(t.t)

		attest(
			t.internal.firstReferenceOfKindOrThrow("union").discriminantJson
		).snap({
			kind: "unit",
			path: [],
			cases: { "0": true, "1": true, "2": true }
		})

		attest(t(0)).equals(1)
		attest(t(3).toString()).snap("must be 0, 1 or 2 (was 3)")
	})

	it("type instance reference", () => {
		const user = type({
			name: "string",
			age: "number"
		})
		const parsedUser = type("string").pipe(s => JSON.parse(s), user)

		attest<
			(In: string) => To<{
				name: string
				age: number
			}>
		>(parsedUser.t)

		const validUser = { name: "David", age: 30 }
		attest(parsedUser(JSON.stringify(validUser))).equals(validUser)
		const missingKey = { name: "David" }
		attest(parsedUser(JSON.stringify(missingKey)).toString()).snap(
			"age must be a number (was missing)"
		)
	})

	it("many pipes", () => {
		const pipeAlphabet = type("'a'").pipe(
			s => `${s}b` as const,
			s => `${s}c` as const,
			s => `${s}d` as const,
			s => `${s}e` as const,
			s => `${s}f` as const,
			s => `${s}g` as const,
			s => `${s}h` as const
		)
		attest<"abcdefgh">(pipeAlphabet.infer)
		attest(pipeAlphabet("a")).equals("abcdefgh")
	})

	it("uses pipe for consecutive types", () => {
		const bar = type({ bar: "number" })
		const t = type({ foo: "string" }).pipe(bar)
		attest<{
			foo: string
			bar: number
		}>(t.t)
		const expected = type({ foo: "string", bar: "number" })
		attest(t.json).equals(expected.json)
	})

	it("disjoint", () => {
		attest(() => type("number>5").pipe(type("number<3"))).throws.snap(
			"ParseError: Intersection of > 5 and < 3 results in an unsatisfiable type"
		)
	})

	it("extract in/out at path", () => {
		const t = type({
			foo: type("number").pipe(n => `${n}`, type.string)
		})

		attest<{ foo: number }>(t.in.t)
		attest(t.in.expression).snap("{ foo: number }")

		attest<{ foo: string }>(t.out.t)
		attest(t.out.expression).snap("{ foo: string }")
	})

	it("uses pipe for many consecutive types", () => {
		const t = type({ a: "1" }).pipe(
			type({ b: "1" }),
			type({ c: "1" }),
			type({ d: "1" })
		)
		attest<
			Type<{
				a: 1
				b: 1
				c: 1
				d: 1
			}>
		>(t)
		const expected = type({ a: "1", b: "1", c: "1", d: "1" })
		attest(t.json).equals(expected.json)
	})

	it("two morphs", () => {
		const inefficientStringIsEmpty = type("string").pipe(
			s => s.length,
			length => length === 0
		)

		attest<(In: string) => Out<boolean>>(inefficientStringIsEmpty.t)
		attest(inefficientStringIsEmpty("")).equals(true)
		attest(inefficientStringIsEmpty("foo")).equals(false)
		attest(inefficientStringIsEmpty(0).toString()).snap(
			"must be a string (was a number)"
		)
	})

	it("any as out", () => {
		const t = type("string", "=>", s => s as any)
		attest<string>(t.in.infer)
		// https://github.com/arktypeio/arktype/issues/1023
		// attest<any>(t.infer)
	})

	it("never as out", () => {
		const t = type("string", "=>", s => s as never)
		attest<string>(t.in.infer)
		attest<never>(t.infer)
	})

	it("return error", () => {
		const divide100By = type("number", "=>", (n, ctx) =>
			n !== 0 ? 100 / n : ctx.error("non-zero")
		)
		attest<(In: number) => Out<number>>(divide100By.t)
		attest(divide100By(5)).equals(20)
		attest(divide100By(0).toString()).snap("must be non-zero (was 0)")
	})

	it("at path", () => {
		const t = type({ a: ["string", "=>", data => data.length] })
		attest<{ a: (In: string) => Out<number> }>(t.t)

		const input = { a: "four" }

		const out = t(input)

		attest<{ a: number } | type.errors>(out).equals({ a: 4 })
	})

	it("doesn't pipe on error", () => {
		const a = type({ a: "number" }).pipe(o => o.a + 1)

		const aMorphs = a.internal.assertHasKind("morph").serializedMorphs

		const b = type({ a: "string" }, "=>", o => o.a + "!")

		const bMorphs = b.internal.assertHasKind("morph").serializedMorphs

		const t = b.or(a)

		attest<
			| ((In: { a: string }) => Out<string>)
			| ((In: { a: number }) => Out<number>)
		>(t.t)
		attest(t.json).snap([
			{
				in: { required: [{ key: "a", value: "number" }], domain: "object" },
				morphs: aMorphs
			},
			{
				in: { required: [{ key: "a", value: "string" }], domain: "object" },
				morphs: bMorphs
			}
		])

		attest(t({ a: 2 })).snap(3)
	})

	it("in array", () => {
		const types = scope({
			lengthOfString: ["string", "=>", data => data.length],
			mapToLengths: "lengthOfString[]"
		}).export()
		attest<((In: string) => Out<number>)[]>(types.mapToLengths.t)
		const out = types.mapToLengths(["1", "22", "333"])
		attest<number[] | type.errors>(out).equals([1, 2, 3])
	})

	it("object to string", () => {
		const t = type([{ a: "string" }, "=>", data => JSON.stringify(data)])
		const out = t({ a: "foo" })
		attest<string | type.errors>(out).snap('{"a":"foo"}')
	})

	it(".out inferred based on validatedOut", () => {
		const unvalidated = type("string").pipe(s => s.length)

		attest<number>(unvalidated.infer)
		// .out won't be known at runtime
		attest<Type<unknown>>(unvalidated.out)

		const validated = unvalidated.pipe(type("number"))
		// now that the output is a validated, type, out can be used standalone
		attest<Type<number>>(validated.out)
	})

	it("intersection", () => {
		const $ = scope({
			b: "3.14",
			a: ["number", "=>", data => `${data}`],
			aAndB: () => $.type("a&b"),
			bAndA: () => $.type("b&a")
		})
		const types = $.export()
		assertNodeKind(types.bAndA.internal, "morph")
		assertNodeKind(types.aAndB.internal, "morph")

		attest<(In: 3.14) => Out<string>>(types.aAndB.t)
		attest(types.aAndB.json).snap({
			in: { unit: 3.14 },
			morphs: types.aAndB.internal.serializedMorphs
		})
		attest<typeof types.aAndB>(types.bAndA)
		attest(types.bAndA).equals(types.aAndB)
	})

	it("object intersection", () => {
		const $ = scope({
			// ideally the annotation for data wouldn't be required
			a: [{ a: "1" }, "=>", (data: { a: 1 }) => `${data}`],
			b: { b: "2" },
			c: "a&b"
		})
		const types = $.export()

		attest(types.c.t).type.toString.snap("(In: { a: 1; b: 2 }) => Out<string>")
		assertNodeKind(types.c.internal, "morph")
		attest(types.c.json).snap({
			in: {
				domain: "object",
				required: [
					{ key: "a", value: { unit: 1 } },
					{ key: "b", value: { unit: 2 } }
				]
			},
			morphs: types.c.internal.serializedMorphs
		})
	})

	it("union", () => {
		const types = scope({
			a: ["number", "=>", data => `${data}`],
			b: "boolean",
			aOrB: "a|b",
			bOrA: "b|a"
		}).export()
		attest<boolean | ((In: number) => Out<string>)>(types.aOrB.t)
		const serializedMorphs =
			types.aOrB.internal.firstReferenceOfKindOrThrow("morph").serializedMorphs
		attest(types.aOrB.json).snap([
			{ in: "number", morphs: serializedMorphs },
			{ unit: false },
			{ unit: true }
		])
		attest<typeof types.aOrB>(types.bOrA)
		attest(types.bOrA.json).equals(types.aOrB.json)
	})

	it("union with output", () => {
		const t = type("number|string.numeric.parse")
		attest<number>(t.infer)
		attest<string | number>(t.inferIn)
	})

	it("deep union", () => {
		const types = scope({
			a: { a: ["number>0", "=>", data => `${data}`] },
			b: { a: "Function" },
			c: "a|b"
		}).export()
		attest<
			| {
					a: (In: number) => Out<string>
			  }
			| {
					a: Function
			  }
		>(types.c.t)

		const serializedMorphs =
			types.a.internal.firstReferenceOfKindOrThrow("morph").serializedMorphs

		attest(types.c.json).snap([
			{ domain: "object", required: [{ key: "a", value: "Function" }] },
			{
				domain: "object",
				required: [
					{
						key: "a",
						value: {
							in: {
								domain: "number",
								min: { exclusive: true, rule: 0 }
							},
							morphs: serializedMorphs
						}
					}
				]
			}
		])
	})

	it("chained reference", () => {
		const $ = scope({
			a: type("string").pipe(s => s.length),
			b: () => $.type("a").pipe(n => n === 0)
		})
		const types = $.export()
		attest<(In: string) => Out<boolean>>(types.b.t)
		assertNodeKind(types.b.internal, "morph")
		attest(types.b.json).snap({
			in: "string",
			morphs: types.b.internal.serializedMorphs
		})
	})

	it("chained nested", () => {
		const $ = scope({
			a: type("string").pipe(s => s.length),
			b: () => $.type({ a: "a" }).pipe(({ a }) => a === 0)
		})

		const types = $.export()
		attest<(In: { a: string }) => Out<boolean>>(types.b.t)
		assertNodeKind(types.b.internal, "morph")
		assertNodeKind(types.a.internal, "morph")
		attest(types.b.json).snap({
			in: {
				domain: "object",
				required: [
					{
						key: "a",
						value: {
							in: "string",
							morphs: types.a.internal.serializedMorphs
						}
					}
				]
			},
			morphs: types.b.internal.serializedMorphs
		})
	})

	it("directly nested", () => {
		const a = type("string", "=>", s => s.length)
		const t = type(
			{
				// doesn't work with a nested tuple expression here due to a TS limitation
				a
			},
			"=>",
			({ a }) => a === 0
		)
		attest<(In: { a: string }) => Out<boolean>>(t.t)
		assertNodeKind(t.internal, "morph")
		const nestedMorph = t.internal.firstReferenceOfKindOrThrow("morph")
		attest(t.json).snap({
			in: {
				domain: "object",
				required: [
					{
						key: "a",
						value: {
							in: "string",
							morphs: nestedMorph.serializedMorphs
						}
					}
				]
			},
			morphs: t.internal.serializedMorphs
		})
	})

	it("discriminable tuple union", () => {
		const $ = scope({
			a: () => $.type(["string"]).pipe(s => [...s, "!"]),
			b: ["number"],
			c: () => $.type("a|b")
		})
		const types = $.export()

		attest<[number] | ((In: [string]) => Out<string[]>)>(types.c.t)
		const expectedSerializedMorphs =
			types.a.internal.assertHasKind("morph").serializedMorphs

		attest(types.c.internal.assertHasKind("union").discriminantJson).snap({
			kind: "domain",
			path: ["0"],
			cases: {
				'"number"': {
					sequence: { prefix: ["number"] },
					proto: "Array",
					exactLength: 1
				},
				'"string"': {
					in: {
						sequence: { prefix: ["string"] },
						proto: "Array",
						exactLength: 1
					},
					morphs: expectedSerializedMorphs
				}
			}
		})
	})

	it("ArkTypeError not included in return", () => {
		const parsedInt = type([
			"string",
			"=>",
			(s, ctx) => {
				const result = Number.parseInt(s)
				if (Number.isNaN(result)) return ctx.error("an integer string")

				return result
			}
		])
		attest<(In: string) => Out<number>>(parsedInt.t)
		attest(parsedInt("5")).snap(5)
		attest(parsedInt("five").toString()).snap(
			'must be an integer string (was "five")'
		)
	})

	it("nullable return", () => {
		const toNullableNumber = type(["string", "=>", s => s.length || null])
		attest<(In: string) => Out<number | null>>(toNullableNumber.t)
	})

	it("undefinable return", () => {
		const toUndefinableNumber = type([
			"string",
			"=>",
			s => s.length || undefined
		])
		attest<(In: string) => Out<number | undefined>>(toUndefinableNumber.t)
	})

	it("null or undefined return", () => {
		const toMaybeNumber = type([
			"string",
			"=>",
			s =>
				s.length === 0 ? undefined
				: s.length === 1 ? null
				: s.length
		])
		attest<(In: string) => Out<number | null | undefined>>(toMaybeNumber.t)
	})

	it("deep intersection", () => {
		const types = scope({
			a: { a: ["number>0", "=>", data => data + 1] },
			b: { a: "1" },
			c: "a&b"
		}).export()
		attest<{ a: (In: 1) => Out<number> }>(types.c.t)
		const { serializedMorphs } =
			types.a.internal.firstReferenceOfKindOrThrow("morph")

		attest(types.c.json).snap({
			required: [
				{ key: "a", value: { in: { unit: 1 }, morphs: serializedMorphs } }
			],
			domain: "object"
		})
	})

	it("morph intersection", () => {
		attest(() =>
			scope({
				a: ["string", "=>", data => `${data}`],
				b: ["string", "=>", data => `${data}!!!`],
				c: "a&b"
			}).export()
		).throws(
			writeMorphIntersectionMessage(
				"(In: string) => Out<unknown>",
				"(In: string) => Out<unknown>"
			)
		)
	})

	it("indiscriminable union", () => {
		attest(() => {
			scope({
				a: ["/.*/", "=>", s => s.trim()],
				b: "string",
				c: "a|b"
			}).export()
		}).throws(
			writeIndiscriminableMorphMessage(
				"string",
				"(In: string /.*/) => Out<unknown>"
			)
		)
	})

	it("deep morph intersection", () => {
		attest(() => {
			scope({
				a: { a: ["number", "=>", data => `${data}`] },
				b: { a: ["number", "=>", data => `${data}!!!`] },
				c: "a&b"
			}).export()
		}).throws(
			writeMorphIntersectionMessage(
				"(In: number) => Out<unknown>",
				"(In: number) => Out<unknown>"
			)
		)
	})

	it("deep indiscriminable", () => {
		const $ = scope({
			a: { foo: ["string", "=>", s => s.trim()] },
			b: { foo: "symbol" },
			c: { bar: "symbol" }
		})

		// this is fine as a | b can be discriminated via foo
		const t = $.type("a|b")
		attest<
			| {
					foo: (In: string) => Out<string>
			  }
			| {
					foo: symbol
			  }
		>(t.t)

		attest(() => $.type("a|c")).throws(
			writeIndiscriminableMorphMessage(
				"{ bar: symbol }",
				"{ foo: (In: string) => Out<unknown> }"
			)
		)
	})

	it("array double intersection", () => {
		attest(() => {
			scope({
				a: { a: ["number>0", "=>", data => data + 1] },
				b: { a: ["number>0", "=>", data => data + 2] },
				c: "a[]&b[]"
			}).export()
		}).throws(
			writeMorphIntersectionMessage(
				"(In: number > 0) => Out<unknown>",
				"(In: number > 0) => Out<unknown>"
			)
		)
	})

	it("undiscriminated morph at path", () => {
		attest(() => {
			scope({
				a: { a: ["string", "=>", s => s.trim()] },
				b: { b: "bigint" },
				c: { key: "a|b" }
			}).export()
		}).throws(
			writeIndiscriminableMorphMessage(
				"{ a: (In: string) => Out<unknown> }",
				"{ b: bigint }"
			)
		)
	})

	it("helper morph intersection", () => {
		attest(() =>
			type("string")
				.pipe(s => s.length)
				.and(type("string").pipe(s => s.length))
		).throws(
			writeMorphIntersectionMessage(
				"(In: string) => Out<unknown>",
				"(In: string) => Out<unknown>"
			)
		)
	})

	it("union helper undiscriminated", () => {
		attest(() =>
			type("string")
				.pipe(s => s.length)
				.or("'foo'")
		).throws(
			writeIndiscriminableMorphMessage("(In: string) => Out<unknown>", '"foo"')
		)
	})

	it("allows undiscriminated union if morphs are equal", () => {
		const t = type({ foo: "1" })
			.or({ bar: "1" })
			.pipe(o => Object.values(o))

		attest<
			(
				In:
					| {
							foo: 1
					  }
					| {
							bar: 1
					  }
			) => Out<1[]>
		>(t.t)

		const serializedMorphs = t.internal.assertHasKind("morph").serializedMorphs

		attest(t.json).snap({
			in: [
				{ required: [{ key: "bar", value: { unit: 1 } }], domain: "object" },
				{ required: [{ key: "foo", value: { unit: 1 } }], domain: "object" }
			],
			morphs: serializedMorphs
		})
		attest(t({ foo: 1 })).snap([1])
		attest(t({ bar: 1 })).snap([1])
		attest(t({ baz: 2 }).toString()).snap(
			"bar must be 1 (was missing) or foo must be 1 (was missing)"
		)
	})
	it("allows undiscriminated union if morphs at path are equal", () => {
		const t = type({ l: "1", n: "string.numeric.parse" }, "|", {
			r: "1",
			n: "string.numeric.parse"
		})

		attest(t).type.toString.snap(`Type<
	| { l: 1; n: (In: string) => To<number> }
	| { r: 1; n: (In: string) => To<number> },
	{}
>`)

		attest(t.expression).snap(
			"{ l: 1, n: (In: string /^(?:(?!^-0\\.?0*$)(?:-?(?:(?:0|[1-9]\\d*)(?:\\.\\d+)?)?))$/) => Out<number> } | { n: (In: string /^(?:(?!^-0\\.?0*$)(?:-?(?:(?:0|[1-9]\\d*)(?:\\.\\d+)?)?))$/) => Out<number>, r: 1 }"
		)
		attest(t({ l: 1, n: "234" })).snap({ l: 1, n: 234 })
		attest(t({ r: 1, n: "234" })).snap({ r: 1, n: 234 })
		attest(t({ l: 1, r: 1, n: "234" })).snap({ l: 1, r: 1, n: 234 })
		attest(t({ n: "234" }).toString()).snap(
			"l must be 1 (was missing) or r must be 1 (was missing)"
		)
	})
	it("fails on indiscriminable morph in nested union", () => {
		const indiscriminable = () =>
			type({
				foo: "boolean | string.date.parse"
			}).or({
				foo: "boolean | string.json.parse"
			})

		attest(indiscriminable).throws
			.snap(`ParseError: An unordered union of a type including a morph and a type with overlapping input is indeterminate:
Left: { foo: (In: string ) => Out<Date> | false | true }
Right: { foo: (In: string) => Out<{ [string]: $jsonObject | number | string | false | null | true }> | false | true }`)
	})

	it("multiple chained pipes", () => {
		const t = type("string.trim").to("string.lower")

		attest(t.t).type.toString.snap("(In: string) => To<string>")

		attest(t("Success")).equals("success")
		attest(t("success")).equals("success")
		attest(t("SUCCESS  ")).equals("success")
		attest(t("success  ")).equals("success")
	})

	// https://github.com/arktypeio/arktype/issues/1144
	it("multiple chained pipes with literal output", () => {
		const base = type("string.trim").to("string.lower")

		const t = base.to("'success'")

		attest<(In: string) => To<"success">>(t.t)

		attest(t("Success")).equals("success")
		attest(t("success")).equals("success")
		attest(t("SUCCESS  ")).equals("success")
		attest(t("success  ")).equals("success")
	})

	const appendLengthMorph = (s: string) => `${s}${s.length}`

	// https://discord.com/channels/957797212103016458/1291014543635517542
	it("repeated Type pipe", () => {
		const appendLength = type("string", "=>", appendLengthMorph)
		const appendLengths = type("string").pipe(appendLength, appendLength)

		attest(appendLengths.json).snap({
			in: "string",
			morphs: [
				{
					in: "string",
					morphs: [
						"$ark.appendLengthMorph",
						{ in: "string", morphs: ["$ark.appendLengthMorph"] }
					]
				}
			]
		})

		attest(appendLengths("a")).snap("a12")
	})

	// https://discord.com/channels/957797212103016458/1291014543635517542
	it("repeated Type pipe with intermediate morph", () => {
		const appendLength = type("string", "=>", appendLengthMorph)

		const appendSeparatorMorph = (s: string) => `${s}|`

		const appendSeparatedLengths = type("string").pipe(
			appendLength,
			appendLength,
			appendSeparatorMorph,
			appendLength,
			appendLength
		)

		attest(appendSeparatedLengths.json).snap({
			in: "string",
			morphs: [
				{
					in: "string",
					morphs: [
						"$ark.appendLengthMorph",
						{ in: "string", morphs: ["$ark.appendLengthMorph"] }
					]
				},
				"$ark.appendSeparatorMorph",
				{
					in: "string",
					morphs: [
						"$ark.appendLengthMorph",
						{ in: "string", morphs: ["$ark.appendLengthMorph"] }
					]
				}
			]
		})

		attest(appendSeparatedLengths("a")).snap("a12|45")
	})

	it("doesn't lose input prop morphs", () => {
		const T = type({
			foo: type("string").pipe(s => s.length)
		})
			.pipe(o => o)
			.to({
				foo: "number"
			})
		attest(T({ foo: "bar" })).snap({ foo: 3 })

		const types = scope({
			From: { a: ["1", "=>", () => 2] },
			Morph: ["From", "=>", e => e],
			To: { a: "2" }
		}).export()
		const U = types.Morph.pipe(e => e, types.To)
		const out = U({ a: 1 })
		attest<
			| ArkErrors
			| {
					a: 2
			  }
		>(out).snap({ a: 2 })
	})

	// https://github.com/arktypeio/arktype/issues/1185
	it("pipe doesn't run on rejected descendant prop", () => {
		let callCount = 0
		const t = type({
			key: "string"
		}).pipe(v => {
			callCount++
			return v
		})

		const out = t({})

		attest(out.toString()).snap("key must be a string (was missing)")
		attest(callCount).equals(0)
	})

	it("to tuple expression", () => {
		const t = type(["string.json.parse", "|>", { name: "string" }])

		const expected = type("string.json.parse").to({ name: "string" })

		attest<typeof expected>(t)
		attest(t.json).equals(expected.json)
	})

	it("to args expression", () => {
		const t = type("string.json.parse", "|>", { name: "string" })

		const expected = type("string.json.parse").to({ name: "string" })

		attest<typeof expected>(t)
		attest(t.json).equals(expected.json)
	})

	it("infers distributed pipes", () => {
		const t = type("string.numeric.parse | number").to("number > 0")
		attest(t.t).type.toString.snap("number | ((In: string) => To<number>)")
	})
})
