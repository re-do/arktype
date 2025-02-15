import { attest, contextualize } from "@ark/attest"
import {
	registeredReference,
	type ArkErrors,
	type StandardSchemaV1
} from "@ark/schema"
import { scope, type, type Module } from "arktype"
import type { Out, To } from "arktype/internal/attributes.ts"

declare class TimeStub {
	declare readonly isoString: string

	private constructor()

	declare static from: (isoString: string) => TimeStub

	declare static fromDate: (date: Date) => TimeStub

	declare toDate: () => Date

	declare toString: () => string
}

contextualize(() => {
	// https://github.com/arktypeio/arktype/issues/915
	it("time stub w/ private constructor", () => {
		// TimeStub is just declared at a type-level since --experimental-strip-types
		// doesn't yet support private constructors

		const MockTimeStub = class TimeStub {}

		const types = scope({
			timeStub: ["instanceof", MockTimeStub] as type.cast<TimeStub>,
			account: "clientDocument&accountData",
			clientDocument: {
				"id?": "string",
				"coll?": "string",
				"ts?": "timeStub",
				"ttl?": "timeStub"
			},
			accountData: {
				user: "user|timeStub",
				provider: "provider",
				providerUserId: "string"
			},
			user: {
				name: "string",
				"accounts?": "account[]"
			},
			provider: "'GitHub'|'Google'"
		}).export()

		attest(types.account.infer).type.toString.snap(`{
	id?: string
	coll?: string
	ts?: TimeStub
	ttl?: TimeStub
	user: TimeStub | { name: string; accounts?: cyclic[] }
	provider: "GitHub" | "Google"
	providerUserId: string
}`)
		attest(types.account.json).snap({
			required: [
				{ key: "provider", value: [{ unit: "GitHub" }, { unit: "Google" }] },
				{ key: "providerUserId", value: "string" },
				{
					key: "user",
					value: [
						{
							required: [{ key: "name", value: "string" }],
							optional: [
								{
									key: "accounts",
									value: { sequence: "$account", proto: "Array" }
								}
							],
							domain: "object"
						},
						"$ark.TimeStub"
					]
				}
			],
			optional: [
				{ key: "coll", value: "string" },
				{ key: "id", value: "string" },
				{ key: "ts", value: "$ark.TimeStub" },
				{ key: "ttl", value: "$ark.TimeStub" }
			],
			domain: "object"
		})
	})

	it("nested bound traversal", () => {
		// https://github.com/arktypeio/arktype/issues/898
		const user = type({
			name: "string",
			email: "string.email",
			tags: "(string>=2)[]>=3",
			score: "number.integer>=0"
		})

		const out = user({
			name: "Ok",
			email: "",
			tags: ["AB", "B"],
			score: 0
		})

		attest(out.toString()).snap(`email must be an email address (was "")
tags must be at least length 3 (was 2)`)
	})

	it("multiple refinement errors", () => {
		const nospacePattern = /^\S*$/

		const schema = type({
			name: "string",
			email: "string.email",
			tags: "(string>=2)[]>=3",
			score: "number.integer>=0",
			"date?": "Date",
			"nospace?": nospacePattern,
			extra: "string|null"
		})

		const data = {
			name: "Ok",
			email: "",
			tags: ["AB", "B"],
			score: -1,
			date: undefined,
			nospace: "One space"
		}

		const out = schema(data)

		attest(out.toString()).snap(`email must be an email address (was "")
extra must be a string or null (was missing)
score must be non-negative (was -1)
tags must be at least length 3 (was 2)
date must be a Date (was undefined)
nospace must be matched by ^\\S*$ (was "One space")`)
	})

	it("discrimination false negative", () => {
		// https://github.com/arktypeio/arktype/issues/910
		const badScope = scope({
			a: {
				x: "'x1'",
				y: "'y1'",
				z: "string"
			},
			b: {
				x: "'x1'",
				y: "'y2'",
				z: "number"
			},
			c: {
				x: "'x2'",
				y: "'y3'",
				z: "string"
			},
			union: "a | b | c"
		}).export()

		const badType = badScope.union

		type Test = typeof badType.infer

		const value: Test = {
			x: "x2",
			y: "y3",
			z: ""
		} // no type error

		const out = badType(value) // matches scope union item 'c'; should not fail
		attest(out).equals(value)
	})
	it("morph path", () => {
		// https://github.com/arktypeio/arktype/issues/754
		const withMorph = type({
			key: type("string").pipe(type("3<=string<=4"), s => s.trim())
		})

		const outWithMorph = withMorph({
			key: "  This is too long  "
		})

		attest(outWithMorph.toString()).snap(
			"key must be at most length 4 (was 20)"
		)

		const withoutMorph = type({
			key: type("3<=string<=4")
		})

		const outWithoutMorph = withoutMorph({
			key: "  This is too long  "
		})

		attest(outWithoutMorph.toString()).snap(
			"key must be at most length 4 (was 20)"
		)
	})

	it("cross scope reference", () => {
		// https://github.com/arktypeio/arktype/issues/700
		const A = type({
			required: "boolean"
		})

		const B = scope({ A }).type({
			a: "A"
		})

		const C = scope({
			B
		}).type({
			b: "B"
		})

		attest<{
			b: {
				a: {
					required: boolean
				}
			}
		}>(C.t)

		attest<{
			B: {
				a: {
					required: boolean
				}
			}
		}>(C.$.t)

		attest(C.json).snap({
			domain: "object",
			required: [
				{
					key: "b",
					value: {
						domain: "object",
						required: [
							{
								key: "a",
								value: {
									domain: "object",
									required: [
										{
											key: "required",
											value: [{ unit: false }, { unit: true }]
										}
									]
								}
							}
						]
					}
				}
			]
		})
	})

	// https://github.com/arktypeio/arktype/issues/947
	it("chained inline type expression inference", () => {
		const a = type({
			action: "'a' | 'b'"
		}).or({
			action: "'c'"
		})

		const referenced = type({
			someField: "string"
		}).and(a)

		attest<
			| {
					someField: string
					action: "a" | "b"
			  }
			| {
					someField: string
					action: "c"
			  }
		>(referenced.infer)

		const inlined = type({
			someField: "string"
		}).and(
			type({
				action: "'a' | 'b'"
			}).or({
				action: "'c'"
			})
		)

		attest<typeof referenced>(inlined)
	})

	// https://discord.com/channels/957797212103016458/1242116299547476100
	it("infers morphs at nested paths", () => {
		const parseBigint = type("string", "=>", (s, ctx) => {
			try {
				return BigInt(s)
			} catch {
				return ctx.error("a valid number")
			}
		})

		const Test = type({
			group: {
				nested: {
					value: parseBigint
				}
			}
		})

		const out = Test({ group: { nested: { value: "5" } } })
		attest<bigint, typeof Test.infer.group.nested.value>()
		attest(out).equals({ group: { nested: { value: 5n } } })
	})

	// https://discord.com/channels/957797212103016458/957804102685982740/1242221022380556400
	it("nested pipe to validated output", () => {
		const trimString = (s: string) => s.trim()

		const trimStringReference = registeredReference(trimString)

		const validatedTrimString = type("string").pipe(
			trimString,
			type("1<=string<=3")
		)

		const CreatePatientInput = type({
			"patient_id?": "string|null",
			"first_name?": validatedTrimString.or("null"),
			"middle_name?": "string|null",
			"last_name?": "string|null"
		})

		attest<
			((In: string) => To<string>) | null | undefined,
			typeof CreatePatientInput.t.first_name
		>()

		attest(CreatePatientInput.json).snap({
			optional: [
				{
					key: "first_name",
					value: [
						{
							in: "string",
							morphs: [
								trimStringReference,
								{ domain: "string", maxLength: 3, minLength: 1 }
							]
						},
						{ unit: null }
					]
				},
				{ key: "last_name", value: ["string", { unit: null }] },
				{ key: "middle_name", value: ["string", { unit: null }] },
				{ key: "patient_id", value: ["string", { unit: null }] }
			],
			domain: "object"
		})
		attest(CreatePatientInput({ first_name: " Bob  " })).equals({
			first_name: "Bob"
		})
		attest(CreatePatientInput({ first_name: " John  " }).toString()).snap(
			"first_name must be at most length 3 (was 4)"
		)

		attest(CreatePatientInput({ first_name: 5 }).toString()).snap(
			"first_name must be a string or null (was a number)"
		)
	})

	// https://github.com/arktypeio/arktype/issues/968
	it("handles consecutive pipes", () => {
		const MyAssets = scope({
			Asset: {
				token: "string",
				amount: type("string").pipe((s, ctx) => {
					try {
						return BigInt(s)
					} catch {
						return ctx.error("a valid non-decimal number")
					}
				})
			},
			Assets: {
				assets: "Asset[]>=1"
			}
		})
			.export()
			.Assets.pipe(o => {
				const assets = o.assets.reduce<Record<string, bigint>>((acc, asset) => {
					acc[asset.token] = asset.amount
					return acc
				}, {})
				return { ...o, assets }
			})

		const out = MyAssets({ assets: [{ token: "a", amount: "1" }] })

		attest(out).snap({ assets: { a: 1n } })
	})

	// https://discord.com/channels/957797212103016458/957804102685982740/1243850690644934677
	it("more chained pipes/narrows", () => {
		const Amount = type(
			"string",
			":",
			(s, ctx) => Number.isInteger(Number(s)) || ctx.reject("number")
		)
			.pipe((s, ctx) => {
				try {
					return BigInt(s)
				} catch {
					return ctx.error("a non-decimal number")
				}
			})
			.narrow(() => true)

		const Token = type("7<string<=120")
			.pipe(s => s.toLowerCase())
			.narrow(() => true)

		const $ = scope({
			Asset: {
				token: Token,
				amount: Amount
			},
			Assets: () => $.type("Asset[]>=1").pipe(assets => assets)
		})

		const types = $.export()

		const out = types.Assets([{ token: "lovelace", amount: "5000000" }])

		attest(out).snap([{ token: "lovelace", amount: 5000000n }])
	})

	it("regex index signature", () => {
		const test = scope({
			svgPath: /^\.\/(\d|a|b|c|d|e|f)+(-(\d|a|b|c|d|e|f)+)*\.svg$/,
			svgMap: {
				"[svgPath]": "string.digits"
			}
		}).export()
		attest<
			Module<{
				svgMap: {
					[x: string]: string
				}
				svgPath: string
			}>
		>(test)
		attest(test.svgMap({ "./f.svg": "123", bar: 5 })).unknown.snap({
			"./f.svg": "123",
			bar: 5
		})
		attest(test.svgMap({ "./f.svg": "123a" }).toString()).snap(
			'value at ["./f.svg"] must be only digits 0-9 (was "123a")'
		)
	})

	it("standalone type from cyclic", () => {
		const types = scope({
			JsonSchema: "JsonSchemaArray|JsonSchemaNumber",
			JsonSchemaArray: {
				items: "JsonSchema",
				type: "'array'"
			},
			JsonSchemaNumber: {
				type: "'number'|'integer'"
			}
		}).export()

		const standalone = types.JsonSchemaArray.describe("standalone")

		attest(standalone.json).snap({
			required: [
				{ key: "items", value: "$JsonSchema" },
				{ key: "type", value: { unit: "array" } }
			],
			meta: "standalone",
			domain: { meta: "standalone", domain: "object" }
		})

		const valid: typeof standalone.infer = {
			type: "array",
			items: { type: "array", items: { type: "number" } }
		}

		const out = standalone(valid)

		attest(out).equals(valid)

		const failOut = standalone({
			type: "array",
			items: { type: "array" }
		})

		attest(failOut.toString()).snap(
			'items.items must be an object (was missing) or items.type must be "integer" or "number" (was "array")'
		)
	})

	it("more external cyclic scope references", () => {
		const $ = scope({
			box: {
				"box?": "box"
			}
		})

		const box = $.type("box|null")

		attest(box({})).equals({})
		attest(box(null)).equals(null)
		attest(box({ box: { box: { box: {} } } })).snap({
			box: { box: { box: {} } }
		})
		attest(box({ box: { box: { box: "whoops" } } })?.toString()).snap(
			"box.box.box must be an object (was a string)"
		)
	})

	it("morph with alias child", () => {
		const types = scope({
			ArraySchema: {
				"items?": "Schema"
			},
			Schema: "TypeWithKeywords",
			TypeWithKeywords: "ArraySchema"
		}).export()

		const t = types.Schema.pipe(o => JSON.stringify(o))

		attest(t({ items: {} })).snap('{"items":{}}')
		attest(t({ items: null }).toString()).snap(
			"items must be an object (was null)"
		)
	})

	it("terse missing key error", () => {
		const types = scope({
			Library: {
				sections: "Sections"
			},
			Sections: {
				"[string]": "Book[]"
			},
			Book: {
				isbn: "string",
				title: "string",
				"subtitle?": "string",
				authors: "string[]",
				publisher: "Publisher"
			},
			Publisher: {
				id: "string",
				name: "string"
			}
		}).export()

		attest(types.Library({}).toString()).snap(
			"sections must be an object (was missing)"
		)
	})

	it("narrowed quoted description", () => {
		const t = type("string")
			.narrow(() => true)
			.describe('This will "fail"')

		attest<string>(t.t)

		const serializedPredicate =
			t.internal.firstReferenceOfKindOrThrow("predicate").serializedPredicate

		attest(t.json).snap({
			meta: 'This will "fail"',
			domain: { meta: 'This will "fail"', domain: "string" },
			predicate: [{ meta: 'This will "fail"', predicate: serializedPredicate }]
		})
	})

	it("extract in of narrowed morph", () => {
		const SubSubType = type("string").pipe(s => parseInt(s))
		const SubType = type({ amount: SubSubType }).narrow(() => true)
		const MyType = type({
			sub: SubType
		})

		type MyType = typeof MyType.in.infer

		attest<
			{
				sub: {
					amount: string
				}
			},
			MyType
		>()
	})

	it("narrowed morph", () => {
		const t = type("string")
			.pipe(s => parseInt(s))
			.narrow(() => true)

		attest<(In: string) => Out<number>>(t.t)

		const u = t.pipe(
			n => `${n}`,
			s => `${s}++` as const
		)

		attest(u.t).type.toString("(In: string) => Out<`${string}++`>")
	})

	it("recursive reference from union", () => {
		const $ = scope({
			TypeWithKeywords: "ArraySchema",
			Schema: "number|ArraySchema",
			ArraySchema: {
				"additionalItems?": "Schema"
			}
		})

		$.export()

		attest($.json).snap({
			TypeWithKeywords: {
				optional: [
					{ key: "additionalItems", value: ["$ArraySchema", "number"] }
				],
				domain: "object"
			},
			Schema: ["$ArraySchema", "number"],
			ArraySchema: {
				optional: [
					{ key: "additionalItems", value: ["$ArraySchema", "number"] }
				],
				domain: "object"
			}
		})
	})

	// https://discord.com/channels/957797212103016458/957804102685982740/1254900389346807849
	it("narrows nested morphs", () => {
		const parseBigint = type("string").pipe(s => BigInt(s))
		const fee = type({ amount: parseBigint }).narrow(
			fee => typeof fee.amount === "bigint"
		)

		const Claim = type({
			fee
		})

		const out = Claim.assert({ fee: { amount: "5" } })

		attest(out).equals({ fee: { amount: 5n } })
	})

	// https://github.com/arktypeio/arktype/issues/1037
	it("can morph an optional key", () => {
		const t = type({
			"optionalKey?": ["string", "=>", x => x.toLowerCase()]
		})

		attest<{
			optionalKey?: (In: string) => Out<string>
		}>(t.t)

		attest(t({})).equals({})

		attest(t({ optionalKey: "FOO" })).snap({ optionalKey: "foo" })
	})

	// https://discord.com/channels/957797212103016458/1261621890775126160/1261621890775126160
	it("can narrow output of a piped union", () => {
		const parseBigint = (v: string | number) => BigInt(v)
		const morphReference = registeredReference(parseBigint)
		const validatePositiveBigint = (b: bigint) => b > 0n
		const predicateReference = registeredReference(validatePositiveBigint)

		const Amount = type("string|number")
			.pipe(parseBigint)
			.narrow(validatePositiveBigint)

		attest<(In: string | number) => Out<bigint>>(Amount.t)
		attest(Amount.json).snap({
			in: ["number", "string"],
			morphs: [morphReference, { predicate: [predicateReference] }]
		})

		attest(Amount("1000")).equals(1000n)
		attest(Amount("-5").toString()).snap(
			"must be valid according to validatePositiveBigint (was -5n)"
		)
	})

	it("nested 'and' chained from morph on optional", () => {
		const validatedTrimString = type("string").pipe(
			s => s.trim(),
			type("1<=string<=3")
		)

		const t = type({
			"first_name?": validatedTrimString.and("unknown")
		})

		attest(t.expression).snap(
			"{ first_name?: (In: string) => To<string <= 3 & >= 1> }"
		)
		attest(t.t).type.toString.snap(
			"{ first_name?: (In: string) => To<string> }"
		)
	})

	it("cyclic narrow in scope", () => {
		const root = scope({
			filename: "0<string<255",
			file: {
				type: "'file'",
				name: "filename"
			},
			directory: {
				type: "'directory'",
				name: "filename",
				children: [
					"root[]",
					":",
					(v, ctx) => {
						if (new Set(v.map(f => f.name)).size !== v.length)
							return ctx.mustBe("names must be unique in a directory")

						return true
					}
				]
			},
			root: "file|directory"
		}).resolve("root")

		attest(root.t).type.toString.snap(`	| { type: "file"; name: string }
	| {
			type: "directory"
			name: string
			children: ({ type: "file"; name: string } | cyclic)[]
	  }`)
	})

	// https://github.com/arktypeio/arktype/discussions/1080#discussioncomment-10247616
	it("pipe to discriminated morph union", () => {
		const objSchema = type({
			action: "'order.completed'"
		}).or({
			action: `'scheduled'`,
			id: "string.integer.parse",
			calendarID: "string.integer.parse",
			appointmentTypeID: "string.integer.parse"
		})

		const parseJsonToObj = type("string.json.parse").pipe(objSchema)

		attest(parseJsonToObj.expression).snap(
			'(In: string) => To<{ action: "order.completed" } | { action: "scheduled", appointmentTypeID: number % 1, calendarID: number % 1, id: number % 1 }>'
		)

		const out = parseJsonToObj(
			JSON.stringify({
				action: "scheduled",
				id: "1",
				calendarID: "1",
				appointmentTypeID: "1"
			})
		)

		attest<
			| ArkErrors
			| {
					action: "order.completed"
			  }
			| {
					action: "scheduled"
					id: number
					calendarID: number
					appointmentTypeID: number
			  }
		>(out)

		attest(out).snap({
			action: "scheduled",
			id: 1,
			calendarID: 1,
			appointmentTypeID: 1
		})
	})

	// https://github.com/arktypeio/arktype/discussions/1080#discussioncomment-10247616
	it("pipe to discriminated morph inner union", () => {
		const objSchema = type({
			action: "'order.completed'"
		}).or({
			action: "'scheduled' | 'rescheduled' | 'canceled' | 'changed'",
			id: "string.integer.parse",
			calendarID: "string.integer.parse",
			appointmentTypeID: "string.integer.parse"
		})

		const parseJsonToObj = type("string.json.parse").pipe(objSchema)

		const out = parseJsonToObj(
			JSON.stringify({
				action: "scheduled",
				id: "1",
				calendarID: "1",
				appointmentTypeID: "1"
			})
		)

		attest(out).snap({
			action: "scheduled",
			id: 1,
			calendarID: 1,
			appointmentTypeID: 1
		})
	})

	// https://discord.com/channels/957797212103016458/957804102685982740/1276840721370054688
	it("directly nested piped type instantiation", () => {
		const t = type({
			"test?": type("string").pipe(x => x === "true")
		})

		attest<{
			test?: (In: string) => Out<boolean>
		}>(t.t)
	})

	it("discriminated union error", () => {
		const c = type({ city: "string", "+": "reject" }).pipe(o => ({
			...o,
			type: "city"
		}))
		const n = type({ name: "string", "+": "reject" }).pipe(o => ({
			...o,
			type: "name"
		}))

		const cn = c.or(n)

		const out = cn({ city: "foo", name: "foo" })
		attest(out.toString()).snap("name must be removed or city must be removed")
	})

	it("array intersection with object literal", () => {
		const t = type({ name: "string" }).and("string[]")
		attest(t).type.toString.snap("Type<{ name: string } & string[], {}>")
		attest(t.infer).type.toString.snap("{ name: string } & string[]")

		attest(t.expression).snap("{ name: string } & string[]")
	})

	it("tuple or morph inference", () => {
		const t = type(["string", "string"]).or(["null", "=>", () => undefined])

		attest(t.expression).snap("[string, string] | (In: null) => Out<unknown>")
		attest(t.t).type.toString.snap(
			"[string, string] | ((In: null) => Out<undefined>)"
		)
		attest(t.inferIn).type.toString("[string, string] | null")
		attest(t.infer).type.toString("[string, string] | undefined")
	})

	it("scoped discrimnated union", () => {
		const $ = scope({
			TypeWithNoKeywords: { type: "'boolean'|'null'" },
			TypeWithKeywords: "ArraySchema|ObjectSchema", // without both ArraySchema and ObjectSchema there's no error
			// "#BaseSchema": "TypeWithNoKeywords|boolean", // errors even with union reversed
			"#BaseSchema": "boolean|TypeWithNoKeywords", // without the `boolean` there's no error (even if still union such as `string|TypeWithNoKeywords`)
			ArraySchema: {
				"additionalItems?": "BaseSchema", // without this reference there's no error
				type: "'array'"
			},
			// If `ObjectSchema` doesn't have `type` key there's no error
			ObjectSchema: {
				type: "'object'"
			}
		})
		const JsonSchema = $.export()
		attest(JsonSchema.TypeWithKeywords.expression).snap(
			'{ type: "array", additionalItems?: { type: "boolean" | "null" } | false | true } | { type: "object" }'
		)

		attest(
			JsonSchema.TypeWithKeywords({
				type: "array",
				additionalItems: { type: "boolean" }
			})
		).snap({ type: "array", additionalItems: { type: "boolean" } })
		attest(
			JsonSchema.TypeWithKeywords({
				type: "array",
				additionalItems: {
					type: "whoops"
				}
			}).toString()
		).snap('additionalItems.type must be "boolean" or "null" (was "whoops")')
	})

	// https://github.com/arktypeio/arktype/issues/1127
	it("keys can overlap with RegExp", () => {
		const MaybeEmpty = type("<t>", "t|undefined|null")

		const ApiSchema = type({
			ref: MaybeEmpty("string"),
			service_code: MaybeEmpty("number"),
			action: MaybeEmpty("string"),
			source: type("string | null"),
			lastIndex: type("string | null")
		})

		attest<{
			ref: string | null | undefined
			service_code: number | null | undefined
			action: string | null | undefined
			source: string | null
			lastIndex: string | null
		}>(ApiSchema.t)

		attest(ApiSchema.expression).snap(
			"{ action: string | undefined | null, lastIndex: string | null, ref: string | undefined | null, service_code: number | undefined | null, source: string | null }"
		)
	})

	it("error on bounded liftArray", () => {
		// @ts-expect-error
		attest(() => type("2 < Array.liftFrom<string> < 4"))
			.throws.snap(
				"ParseError: MaxLength operand must be a string or an array (was a morph)"
			)
			.type.errors.snap(
				"Argument of type '\"2 < Array.liftFrom<string> < 4\"' is not assignable to parameter of type '\"To constrain the output of ... < 4, pipe like myMorph.to('number > 0').\\nTo constrain the input, intersect like myMorph.and('number > 0'). \"'."
			)
	})

	// https://discord.com/channels/957797212103016458/1290304355643293747
	it("can extract proto Node at property", () => {
		const d = type("Date")

		const o = type({
			last_updated: d
		})

		const t = o.get("last_updated")

		attest<Date>(t.t)
		attest(d.expression).snap("Date")
		attest(t.expression).equals(d.expression)
		attest(t.extends(d)).equals(true)
	})

	it("piped through Type", () => {
		const Letters = type("'a'|'b'|'c'")
		// normally, this would just be .to(Letters), but this should work as
		// well, even if it's less efficient
		const Letter = type("string").pipe(s => Letters(s))

		attest(Letter("d").toString()).snap('must be "a", "b" or "c" (was "d")')
	})

	it(".in types are always unionable", () => {
		const MorphArrayMorph = type("string")
			.pipe(e => e)
			.array()
			.pipe(e => e)
		const OtherType = type("string[]")
		const EitherInput = MorphArrayMorph.in.or(OtherType.in)

		attest(EitherInput(["str"])).snap(["str"])
	})

	it("intersecting unknown with piped type preserves identity", () => {
		const base = type({
			foo: type("string").pipe(() => 123)
		})
			.pipe(c => c)
			.to({
				foo: "123"
			})

		const identity = base.and("unknown")

		attest(base.json).equals(identity.json)
		attest(base.internal.id).equals(identity.internal.id)
	})

	it("index signature union intersection with default", () => {
		const t = type({
			storeA: "Record<string, string>"
		})
			.or({
				storeB: {
					foo: "Record<string, string>"
				}
			})
			.and({
				ext: ["string", "=", ".txt"]
			})

		attest(t.expression).snap(
			'{ storeA: { [string]: string }, ext: string = ".txt" } | { storeB: { foo: { [string]: string } }, ext: string = ".txt" }'
		)
	})

	it("correct toString for array of union", () => {
		const t = type("(string | number)[]")
		attest(t.expression).snap("(number | string)[]")
	})

	it("union with length constraint", () => {
		const feedbackSchema = type({
			contact: "string.email | string == 0"
		})

		attest(feedbackSchema.expression).snap(
			"{ contact: string == 0 | string /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$/ }"
		)
		attest(feedbackSchema.t).type.toString.snap(`{ contact: string }`)
	})

	it("deleted undeclared keys allowed in input", () => {
		const t = type({ foo: "string" }).onUndeclaredKey("delete")

		attest(t.json).snap({
			undeclared: "delete",
			required: [{ key: "foo", value: "string" }],
			domain: "object"
		})

		attest(t.in.json).snap({
			required: [{ key: "foo", value: "string" }],
			domain: "object"
		})

		const extras = { foo: "hi", bar: 3 }

		attest(t(extras)).equals({ foo: "hi" })
		attest(t.allows(extras)).equals(true)
		attest(t.in(extras)).equals(extras)
	})

	it("deleted undeclared keys rejected in output", () => {
		const t = type({ foo: "string" }).onUndeclaredKey("delete")

		attest(t.json).snap({
			undeclared: "delete",
			required: [{ key: "foo", value: "string" }],
			domain: "object"
		})

		attest(t.out.json).snap({
			undeclared: "reject",
			required: [{ key: "foo", value: "string" }],
			domain: "object"
		})

		attest(t.out({ foo: "hi", bar: 3 }).toString()).snap("bar must be removed")
	})

	it("includesMorph only when expected", () => {
		const unmorphed = type({
			"optional?": "string",
			required: "string",
			tuple: ["string", "number?"],
			array: "string[]",
			closed: {
				"+": "reject",
				a: "true"
			}
		})
		attest(unmorphed.internal.includesTransform).equals(false)
	})

	it("morph includesMorph", () => {
		const t = type({
			prop: ["string", "=>", s => s.length]
		})

		attest(t.internal.includesTransform).equals(true)
	})

	it("default prop includesMorph", () => {
		const t = type({
			prop: "number = 5"
		})

		attest(t.internal.includesTransform).equals(true)
	})

	it("default tuple includesMorph", () => {
		const t = type({
			tuple: ["number = 5"]
		})

		attest(t.internal.includesTransform).equals(true)
	})

	it("onUndeclaredKey delete includesMorph", () => {
		const t = type({
			inner: {
				"+": "delete",
				foo: "string"
			}
		})
		attest(t.internal.includesTransform).equals(true)
	})

	it("distill doesn't treat functions returning any/never as morphs", () => {
		type T = {
			any(): any
			never(): never
		}
		const t = type("unknown").as<T>()

		attest(t.infer).type.toString.equals("T")
		attest(t.inferIn).type.toString.equals("T")
	})

	it("distills morphs returning any/never", () => {
		const t = type({
			any: ["unknown", "=>", (): any => {}],
			never: ["unknown", "=>", () => [] as never]
		})

		attest(t.t).type.toString.snap(`{
	any: (In: unknown) => Out<any>
	never: (In: unknown) => Out<never>
}`)
		attest(t.infer).type.toString.snap("{ any: any; never: never }")
		attest(t.inferIn).type.toString.snap("{ any: unknown; never: unknown }")
	})

	// https://github.com/arktypeio/arktype/issues/1274
	it("fail on non-discriminable union of objects with onUndeclaredKey: delete", () => {
		const point2d = type({
			x: "number",
			y: "number",
			"+": "delete"
		})

		const point3d = type({
			x: "number",
			y: "number",
			z: "number",
			"+": "delete"
		})

		attest(() => point2d.or(point3d)).throws
			.snap(`ParseError: An unordered union of a type including a morph and a type with overlapping input is indeterminate:
Left: { x: number, y: number, z: number, + (undeclared): delete }
Right: { x: number, y: number, + (undeclared): delete }`)
	})

	// https://github.com/arktypeio/arktype/issues/1266
	it("onUndeclaredKey intersection cases", () => {
		const types = type.module({
			// Works: overlapping fields are named the same, have simple type
			ModelA_V1: { times: "number", "+": "reject" },
			ModelA_V2: {
				times: "number",
				version: "2",
				"+": "reject"
			},
			ModelA: "ModelA_V2 | ModelA_V1",
			// Works: non-overlapping list fields
			ModelB_V1: { times: "number.integer[]", "+": "reject" },
			ModelB_V2: {
				frames: "number.integer[]",
				version: "2",
				"+": "reject"
			},
			ModelB: "ModelB_V2 | ModelB_V1",
			// Does not work: overlapping array field
			ModelC_V1: { times: "number[]", "+": "reject" },
			ModelC_V2: {
				times: "number[]",
				version: "2",
				"+": "reject"
			},
			ModelC: "ModelC_V2 | ModelC_V1",
			// Works: overlapping map fields
			ModelD_V1: { times: "Record<string, number>", "+": "reject" },
			ModelD_V2: {
				times: "Record<string, number>",
				version: "2",
				"+": "reject"
			},
			ModelD: "ModelD_V2 | ModelD_V1",
			// Works: overlapping user-defined sub-model
			Time: { value: "number" },
			ModelE_V1: { time: "Time", "+": "reject" },
			ModelE_V2: {
				time: "Time",
				version: "2",
				"+": "reject"
			},
			ModelE: "ModelE_V2 | ModelE_V1",
			Times: { values: "number[]" },
			// Does not work: arrays within overlapping sub-model
			ModelF_V1: { times: "Times", "+": "reject" },
			ModelF_V2: {
				times: "Times",
				version: "2",
				"+": "reject"
			},
			ModelF: "ModelF_V2 | ModelF_V1"
		})

		types.ModelA.assert({ times: 0.0, version: 2 })
		types.ModelB.assert({ frames: [0], version: 2 })
		types.ModelC.assert({ times: [0.0], version: 2 })
		types.ModelD.assert({ times: { age: 7.3 }, version: 2 })
		types.ModelE.assert({ time: { value: 0.0 }, version: 2 })
		types.ModelF.assert({ times: { values: [0.0] }, version: 2 })
	})

	it("can nested type call from standard schema generic", () => {
		function fn<
			T extends {
				schema: StandardSchemaV1
			}
		>(_: T) {
			return {} as StandardSchemaV1.InferOutput<T["schema"]>
		}

		// was inferred as unknown before NoInfer was refactored to conditionals
		const arkRes = fn({
			schema: type({
				name: "string"
			})
		})

		attest<{ name: string }>(arkRes)
	})
})
