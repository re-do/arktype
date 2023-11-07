import { attest } from "@arktype/attest"
import { lazily } from "@arktype/util"
import type { Ark, Module } from "arktype"
import { scope, type } from "arktype"
import { suite, test } from "mocha"

suite("scope imports", () => {
	const threeSixtyNoScope = lazily(() =>
		scope({
			three: "3",
			sixty: "60",
			no: "'no'"
		})
	)
	const yesScope = lazily(() => scope({ yes: "'yes'" }))

	const threeSixtyNoModule = lazily(() => threeSixtyNoScope.export())
	const yesModule = lazily(() => yesScope.export())

	test("single", () => {
		const $ = scope({
			...threeSixtyNoModule
		}).scope({ threeSixtyNo: "three|sixty|no" })
		attest<{ threeSixtyNo: 3 | 60 | "no" }>($.infer)
	})

	test("multiple", () => {
		const base = scope({
			...threeSixtyNoModule,
			...yesModule,
			extra: "true"
		})

		const imported = base.scope({
			a: "three|sixty|no|yes|extra"
		})

		attest<{ a: 3 | 60 | "no" | "yes" | true }>(imported.infer)
	})

	// TODO: fix, tests for more duplicate scenarios
	// test("duplicate alias", () => {
	//     attest(() =>
	//         scope({ a: "boolean" })
	//             .scope(
	//                 // @ts-expect-error
	//                 { a: "string" }
	//             )
	//             .export()
	//     ).throwsAndHasTypeError(writeDuplicateAliasesMessage("a"))
	// })

	test("import & export", () => {
		const threeSixtyNoScope = scope({
			three: "3",
			sixty: "60",
			no: "'no'"
		})

		const scopeCreep = scope({
			hasCrept: "true"
		})

		const types = scope({
			...threeSixtyNoScope.import("three", "no"),
			...scopeCreep.export(),
			public: "hasCrept|three|no|private",
			"#private": "uuid"
		}).export()

		attest(Object.keys(types)).equals(["hasCrept", "public"])

		attest(types.public.condition).equals(type("3|'no'|uuid|true").condition)

		attest<
			Module<{
				exports: {
					hasCrept: true
					public: string | true | 3
				}
				locals: {
					three: 3
					no: "no"
					private: string
				}
				ambient: Ark
			}>
		>(types)
	})
})

suite("private aliases", () => {
	test("non-generic", () => {
		const types = scope({
			foo: "bar[]",
			"#bar": "boolean"
		}).export()
		attest(Object.keys(types)).equals(["foo"])
		attest(types.foo.condition).equals(type("boolean[]").condition)
		attest<
			Module<{
				exports: { foo: boolean[] }
				locals: { bar: boolean }
				ambient: Ark
			}>
		>(types)
	})
	test("generic", () => {
		const types = scope({
			foo: "bar<string>[]",
			"#bar<t>": ["t"]
		}).export()
		attest<[string][]>(types.foo.infer)
	})
})
