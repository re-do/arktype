import { config } from "./simpleConfig.ts"

import { type } from "arktype"
import { deepStrictEqual, strictEqual } from "node:assert/strict"
import { cases } from "./util.ts"

cases({
	NaN: () => {
		strictEqual(type("number").allows(Number.NaN), true)
	},
	onUndeclaredKey: () => {
		const o = type({ a: "number" })
		const out = o.assert({ a: 1, b: 2 })
		deepStrictEqual(out, { a: 1 })
	},
	shallowLeafKeyword: () => {
		const expected = config.keywords.null.description
		strictEqual(type.null.description, expected)
		strictEqual(
			type.null(undefined)?.toString(),
			`must be ${expected} (was undefined)`
		)
	},
	shallowModuleKeyword: () => {
		const expected = config.keywords.string.description
		strictEqual(type.string.description, expected)
		strictEqual(type.string(5).toString(), `must be ${expected} (was a number)`)
	},
	deepModuleKeyword: () => {
		const numeric = type.keywords.string.numeric.root
		const expected = config.keywords["string.numeric"].description
		strictEqual(numeric.description, expected)
		strictEqual(numeric("abc").toString(), `must be ${expected} (was "abc")`)
	},
	deepLeafKeyword: () => {
		const pretrimmed = type.keywords.string.trim.preformatted
		const expected = config.keywords["string.trim.preformatted"].description
		strictEqual(pretrimmed.description, expected)
		strictEqual(pretrimmed(" ").toString(), `must be ${expected} (was " ")`)
	}
})
