import type { GenericNode } from "../generic.js"
import type { jsObjects } from "./jsObjects.js"
import type { tsKeywords } from "./tsKeywords.js"
import type { spaceFromExports } from "./utils/utils.js"
import type { validation } from "./validation.js"

type TsGenericsExports<$ = Ark> = {
	Record: GenericNode<
		["K", "V"],
		{
			"[K]": "V"
		},
		// as long as the generics in the root scope don't reference one
		// another, they shouldn't need a bound local scope
		$
	>
}

export const keywordNodes: spaceFromExports<Ark> = {} as never

// this type is redundant with the inferred definition of ark but allow types
// derived from the default scope to be calulated more efficiently
export interface Ark
	extends tsKeywords.exports,
		jsObjects.exports,
		validation.exports,
		TsGenericsExports {
	// parse: Module<parsing.exports>
}
