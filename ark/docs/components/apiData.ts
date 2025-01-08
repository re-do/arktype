import type { ApiDocsByGroup } from "../../repo/jsdocGen.ts"

export const apiDocsByGroup: ApiDocsByGroup = {
	Type: [
		{
			group: "Type",
			name: "$",
			summary: [
				{
					kind: "text",
					value: "The "
				},
				{
					kind: "reference",
					value: "Scope"
				},
				{
					kind: "text",
					value:
						" in which definitions for this Type its chained methods are parsed"
				}
			]
		},
		{
			group: "Type",
			name: "infer",
			summary: [
				{
					kind: "text",
					value: "The type of data this returns"
				}
			],
			example:
				'const parseNumber = type("string").pipe(s => Number.parseInt(s))\ntype ParsedNumber = typeof parseNumber.infer // number\n\n🥸 Inference-only property that will be `undefined` at runtime'
		},
		{
			group: "Type",
			name: "inferIn",
			summary: [
				{
					kind: "text",
					value: "The type of data this expects"
				}
			],
			example:
				'const parseNumber = type("string").pipe(s => Number.parseInt(s))\ntype UnparsedNumber = typeof parseNumber.inferIn // string\n\n🥸 Inference-only property that will be `undefined` at runtime'
		},
		{
			group: "Type",
			name: "json",
			summary: [
				{
					kind: "text",
					value: "The internal JSON representation"
				}
			]
		},
		{
			group: "Type",
			name: "toJsonSchema",
			summary: [
				{
					kind: "text",
					value: "Generate a JSON Schema"
				}
			]
		},
		{
			group: "Type",
			name: "meta",
			summary: [
				{
					kind: "text",
					value: "Metadata like custom descriptions and error messages"
				}
			],
			description: [
				{
					kind: "text",
					value: "The type of this property "
				},
				{
					kind: "link",
					url: "https://arktype.io/docs/configuration#custom",
					value: "can be extended"
				},
				{
					kind: "text",
					value: " by your project."
				}
			]
		},
		{
			group: "Type",
			name: "description",
			summary: [
				{
					kind: "text",
					value: "An English description"
				}
			],
			description: [
				{
					kind: "text",
					value:
						"Best suited for representing __primitives__ to __any English speaker__."
				}
			],
			example:
				'const n = type("0 < number <= 100")\nconsole.log(n.description) // positive and at most 100'
		},
		{
			group: "Type",
			name: "expression",
			summary: [
				{
					kind: "text",
					value: "A syntactic representation similar to native TypeScript"
				}
			],
			description: [
				{
					kind: "text",
					value:
						"Best suited for representing __primitives or structures__ to __other developers__."
				}
			],
			example:
				'const loc = type({ coords: ["number", "number"] })\nconsole.log(loc.expression) // { coords: [number, number] }'
		},
		{
			group: "Type",
			name: "assert",
			summary: [
				{
					kind: "text",
					value:
						"Validate and morph data, throwing a descriptive AggregateError if it fails"
				}
			],
			description: [
				{
					kind: "text",
					value: "Useful to avoid needing to check for "
				},
				{
					kind: "reference",
					value: "type.errors"
				},
				{
					kind: "text",
					value: " if it would be unrecoverable"
				}
			],
			example:
				'const criticalPayload = type({\n    superImportantValue: "string"\n})\n// throws AggregateError: superImportantValue must be a string (was missing)\nconst data = criticalPayload.assert({ irrelevantValue: "whoops" })\nconsole.log(data.superImportantValue) // valid output can be accessed directly'
		},
		{
			group: "Type",
			name: "allows",
			summary: [
				{
					kind: "text",
					value: "Validate input data without applying morphs"
				}
			],
			description: [
				{
					kind: "text",
					value:
						"Highly optimized and best for cases where you need to know if data\nsatisifes a Type's input without needing specific errors on rejection."
				}
			],
			example:
				'const numeric = type("number | bigint")\n// [0, 2n]\nconst numerics = [0, "one", 2n].filter(numeric.allows)'
		},
		{
			group: "Type",
			name: "configure",
			summary: [
				{
					kind: "text",
					value: "Clone and add metadata to shallow references"
				}
			],
			description: [
				{
					kind: "text",
					value: "Does not affect error messages within properties of an object"
				}
			],
			example:
				'const notOdd = type("number % 2").configure({ description: "not odd" })\n// all constraints at the root are affected\nconst odd = notOdd(3) // must be not odd (was 3)\nconst nonNumber = notOdd("two") // must be not odd (was "two")\n\nconst notOddBox = type({\n   // we should have referenced notOdd or added meta here\n   notOdd: "number % 2",\n// but instead chained from the root object\n}).configure({ description: "not odd" })\n// error message at path notOdd is not affected\nconst oddProp = notOddBox({ notOdd: 3 }) // notOdd must be even (was 3)\n// error message at root is affected, leading to a misleading description\nconst nonObject = notOddBox(null) // must be not odd (was null)'
		},
		{
			group: "Type",
			name: "describe",
			summary: [
				{
					kind: "text",
					value: "Clone and add the description to shallow references"
				}
			],
			description: [
				{
					kind: "text",
					value: "Equivalent to `.configure({ description })` (see "
				},
				{
					kind: "reference",
					value: "configure"
				},
				{
					kind: "text",
					value: ")"
				}
			],
			example:
				'const aToZ = type(/^a.*z$/).describe("a string like \'a...z\'")\nconst good = aToZ("alcatraz") // "alcatraz"\n// notice how our description is integrated with other parts of the message\nconst badPattern = aToZ("albatross") // must be a string like \'a...z\' (was "albatross")\nconst nonString = aToZ(123) // must be a string like \'a...z\' (was 123)'
		}
	]
}
