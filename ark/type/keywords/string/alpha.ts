import type { Nominal, of } from "../inference.ts"
import { regexStringNode } from "./utils.ts"

declare namespace string {
	export type alpha = of<string, Nominal<"alpha">>
}

export const alpha = regexStringNode(/^[A-Za-z]*$/, "only letters")

export type alpha = string.alpha
