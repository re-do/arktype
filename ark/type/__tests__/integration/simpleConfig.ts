import { configure } from "arktype/config"

export const config = configure({
	numberAllowsNaN: true,
	keywords: {
		null: {
			description: "configured null"
		},
		string: {
			description: "a configured string"
		},
		"string.numeric": {
			description: "a configured numeric string"
		},
		"string.trim.preformatted": {
			description: "a configured trimmed string"
		}
	},
	onUndeclaredKey: "delete"
})
