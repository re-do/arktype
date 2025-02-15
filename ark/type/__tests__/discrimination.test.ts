import { attest, contextualize } from "@ark/attest"
import { registeredReference } from "@ark/schema"
import { scope, type } from "arktype"

contextualize(() => {
	it("2 literal branches", () => {
		// should not use a switch with <=2 branches to avoid needless convolution
		const t = type("'a'|'b'")
		attest(t.json).snap([{ unit: "a" }, { unit: "b" }])
		attest(t.internal.assertHasKind("union").discriminantJson).snap({
			kind: "unit",
			path: [],
			cases: { '"a"': true, '"b"': true }
		})
		attest(t.allows("a")).equals(true)
		attest(t.allows("b")).equals(true)
		attest(t.allows("c")).equals(false)
	})

	it(">2 literal branches", () => {
		const t = type("'a'|'b'|'c'")
		attest(t.json).snap([{ unit: "a" }, { unit: "b" }, { unit: "c" }])
		attest(t.internal.assertHasKind("union").discriminantJson).snap({
			kind: "unit",
			path: [],
			cases: { '"a"': true, '"b"': true, '"c"': true }
		})
		attest(t.allows("a")).equals(true)
		attest(t.allows("b")).equals(true)
		attest(t.allows("c")).equals(true)
		attest(t.allows("d")).equals(false)
	})

	it(">2 domain branches", () => {
		const t = type("string|bigint|number")
		attest(t.json).snap(["bigint", "number", "string"])
		attest(t.internal.assertHasKind("union").discriminantJson).snap({
			kind: "domain",
			path: [],
			cases: { '"bigint"': true, '"number"': true, '"string"': true }
		})
		attest(t.allows("foo")).equals(true)
		attest(t.allows(5n)).equals(true)
		attest(t.allows(5)).equals(true)
		attest(t.allows(true)).equals(false)
	})

	it("literals can be included in domain branches", () => {
		const t = type("string|bigint|true")
		attest(t.json).snap(["bigint", "string", { unit: true }])
		attest(t.internal.assertHasKind("union").discriminantJson).snap({
			kind: "domain",
			path: [],
			cases: { '"bigint"': true, '"string"': true, '"boolean"': { unit: true } }
		})
		attest(t.allows("foo")).equals(true)
		attest(t.allows(5n)).equals(true)
		attest(t.allows(true)).equals(true)
		attest(t.allows(5)).equals(false)
	})

	const getPlaces = () =>
		scope({
			rainForest: {
				climate: "'wet'",
				color: "'green'",
				isRainForest: "true"
			},
			desert: { climate: "'dry'", color: "'brown'", isDesert: "true" },
			sky: { climate: "'dry'", color: "'blue'", isSky: "true" },
			ocean: { climate: "'wet'", color: "'blue'", isOcean: "true" }
		})

	it("nested", () => {
		const $ = getPlaces()
		const climate = $.type("ocean | sky | rainForest | desert")

		const missingLabel = climate({
			climate: "wet",
			color: "blue"
		})

		attest(missingLabel.toString()).snap("isOcean must be true (was missing)")

		const twoMissingKeys = climate({
			color: "blue"
		})

		attest(twoMissingKeys.toString()).snap(
			'climate must be "dry" or "wet" (was undefined)'
		)

		attest(climate.internal.assertHasKind("union").discriminantJson).snap({
			kind: "unit",
			path: ["color"],
			cases: {
				'"blue"': {
					kind: "unit",
					path: ["climate"],
					cases: {
						'"dry"': { required: [{ key: "isSky", value: { unit: true } }] },
						'"wet"': { required: [{ key: "isOcean", value: { unit: true } }] }
					}
				},
				'"brown"': {
					required: [
						{ key: "climate", value: { unit: "dry" } },
						{ key: "isDesert", value: { unit: true } }
					]
				},
				'"green"': {
					required: [
						{ key: "climate", value: { unit: "wet" } },
						{ key: "isRainForest", value: { unit: true } }
					]
				}
			}
		})
	})

	it("indiscriminable", () => {
		const t = getPlaces().type([
			"ocean",
			"|",
			{
				climate: "'wet'",
				color: "'blue'",
				indistinguishableFrom: "ocean"
			}
		])

		attest(t.internal.assertHasKind("union").discriminantJson).equals(null)
	})

	it("discriminate optional key", () => {
		const t = type({
			direction: "'forward' | 'backward'",
			"operator?": "'by'"
		}).or({
			duration: "'s' | 'min' | 'h'",
			operator: "'to'"
		})

		attest(t.internal.assertHasKind("union").discriminantJson).equals(null)
	})

	it("overlapping default case", () => {
		const t = getPlaces().type([
			"ocean|rainForest",
			"|",
			{ temperature: "'hot'" }
		])

		attest(t.internal.assertHasKind("union").discriminantJson).snap({
			kind: "unit",
			path: ["color"],
			cases: {
				'"blue"': [
					{
						required: [
							{ key: "climate", value: { unit: "wet" } },
							{ key: "isOcean", value: { unit: true } }
						]
					},
					{ required: [{ key: "temperature", value: { unit: "hot" } }] }
				],
				'"green"': [
					{
						required: [
							{ key: "climate", value: { unit: "wet" } },
							{ key: "isRainForest", value: { unit: true } }
						]
					},
					{ required: [{ key: "temperature", value: { unit: "hot" } }] }
				],
				default: {
					required: [{ key: "temperature", value: { unit: "hot" } }],
					domain: "object"
				}
			}
		})
	})

	it("discriminable default", () => {
		const t = getPlaces().type([
			{ temperature: "'cold'" },
			"|",
			["ocean|rainForest", "|", { temperature: "'hot'" }]
		])

		attest(t.internal.assertHasKind("union").discriminantJson).snap({
			kind: "unit",
			path: ["color"],
			cases: {
				'"blue"': {
					kind: "unit",
					path: ["temperature"],
					cases: {
						'"cold"': true,
						'"hot"': true,
						default: {
							required: [
								{ key: "climate", value: { unit: "wet" } },
								{ key: "isOcean", value: { unit: true } }
							]
						}
					}
				},
				'"green"': {
					kind: "unit",
					path: ["temperature"],
					cases: {
						'"cold"': true,
						'"hot"': true,
						default: {
							required: [
								{ key: "climate", value: { unit: "wet" } },
								{ key: "isRainForest", value: { unit: true } }
							]
						}
					}
				},
				default: {
					kind: "unit",
					path: ["temperature"],
					cases: { '"cold"': true, '"hot"': true }
				}
			}
		})
	})

	it("won't discriminate between possibly empty arrays", () => {
		const t = type("string[]|boolean[]")
		attest(t.internal.assertHasKind("union").discriminantJson).equals(null)
	})

	it("discriminant path including symbol", () => {
		const s = Symbol("lobmyS")
		const sRef = registeredReference(s)
		const t = type({ [s]: "0" }).or({ [s]: "1" })
		attest(t.internal.assertHasKind("union").discriminantJson).snap({
			kind: "unit",
			path: [sRef],
			cases: {
				"0": true,
				"1": true
			}
		})

		attest(t.allows({ [s]: 0 })).equals(true)
		attest(t.allows({ [s]: -1 })).equals(false)

		attest(t({ [s]: 1 })).equals({ [s]: 1 })
		attest(t({ [s]: 2 }).toString()).snap(
			"value at [Symbol(lobmyS)] must be 0 or 1 (was 2)"
		)
	})

	// https://github.com/arktypeio/arktype/issues/1100
	it("discriminated null + object", () => {
		const company = type({
			id: "number"
		}).or("string | null")

		attest(company(null)).equals(null)
		attest(company({ id: 1 })).equals({ id: 1 })
		attest(company("foo")).equals("foo")
		attest(company(5)?.toString()).snap(
			"must be a string, an object or null (was a number)"
		)
	})

	it("differing inner discriminated paths", () => {
		const discriminated = type(
			{
				innerA: {
					id: "1"
				}
			},
			"|",
			{
				innerB: {
					id: "1"
				}
			}
		)
			.or({ innerA: { id: "2" } })
			.or({ innerB: { id: "2" } })

		const union = discriminated.internal.assertHasKind("union")

		attest(union.discriminantJson).snap({
			kind: "unit",
			path: ["innerA", "id"],
			cases: {
				"1": true,
				"2": true,
				default: {
					kind: "unit",
					path: ["innerB", "id"],
					cases: { "1": true, "2": true }
				}
			}
		})

		attest(union({ innerA: { id: 1 } })).equals({ innerA: { id: 1 } })
		attest(union({ innerB: { id: 1 } })).equals({ innerB: { id: 1 } })
		attest(union({ innerA: { id: 2 } })).equals({ innerA: { id: 2 } })
		attest(union({ innerB: { id: 2 } })).equals({ innerB: { id: 2 } })

		attest(union({})?.toString()).snap(
			"innerB.id must be 1 or 2 (was undefined)"
		)
	})

	it("allows strict discriminated keys", () => {
		const AorB = type({
			type: "'A'"
		})
			.or({
				type: "'B'"
			})
			.onUndeclaredKey("reject")

		attest(AorB.internal.assertHasKind("union").discriminantJson).snap({
			kind: "unit",
			path: ["type"],
			cases: {
				'"A"': { undeclared: "reject", required: [{ key: "type", value: {} }] },
				'"B"': { undeclared: "reject", required: [{ key: "type", value: {} }] }
			}
		})

		attest(AorB({ type: "A" })).equals({ type: "A" })
	})

	it("can discriminated objects with disjoint strict keys", () => {
		const AorB = type({
			"+": "reject",
			something: "'A'"
		}).or({
			"+": "reject",
			something: "'B'",
			somethingelse: "number"
		})

		attest(AorB.internal.assertHasKind("union").discriminantJson).snap({
			kind: "unit",
			path: ["something"],
			cases: {
				'"A"': {
					undeclared: "reject",
					required: [{ key: "something", value: {} }]
				},
				'"B"': {
					undeclared: "reject",
					required: [
						{ key: "something", value: {} },
						{ key: "somethingelse", value: "number" }
					]
				}
			}
		})

		attest(AorB({ something: "A" })).snap({ something: "A" })
	})

	it("includes non-disjoint branches in corresponding cases", () => {
		const t = type({
			id: "0",
			k1: "number"
		})
			.or({ id: "1", k1: "number" })
			.or({
				name: "string"
			})

		attest(t.internal.assertHasKind("union").discriminantJson).snap({
			kind: "unit",
			path: ["id"],
			cases: {
				"0": [
					{ required: [{ key: "k1", value: "number" }] },
					{ required: [{ key: "name", value: "string" }] }
				],
				"1": [
					{ required: [{ key: "k1", value: "number" }] },
					{ required: [{ key: "name", value: "string" }] }
				],
				default: {
					required: [{ key: "name", value: "string" }],
					domain: "object"
				}
			}
		})

		// should hit the case discriminated for id: 1,
		// but still resolve correctly via the { name: string } branch
		attest(t({ name: "foo", id: 1 })).unknown.snap({ name: "foo", id: 1 })
	})

	it("correctly dsicriminated onDeclaredKey: reject in the above scenario", () => {
		const t = type({
			id: "0",
			k1: "number"
		})
			.or({ id: "1", k1: "number" })
			.or({
				"+": "reject",
				name: "string"
			})

		attest(t.internal.assertHasKind("union").discriminantJson).snap({
			kind: "unit",
			path: ["id"],
			cases: {
				"0": { required: [{ key: "k1", value: "number" }] },
				"1": { required: [{ key: "k1", value: "number" }] },
				default: {
					undeclared: "reject",
					required: [{ key: "name", value: "string" }],
					domain: "object"
				}
			}
		})

		// now that we are rejecting undeclared keys, all branches fail
		attest(t({ name: "foo", id: 1 }).toString()).snap(
			"k1 must be a number (was missing)"
		)
	})
})
