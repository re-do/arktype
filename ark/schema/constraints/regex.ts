import { isArray } from "@arktype/util"
import type { Orthogonal } from "../node.js"
import { orthogonal } from "../node.js"
import { ConstraintSet } from "./constraint.js"

type PatternIntersection = readonly PatternConstraint<RegExp>[]

export class PatternConstraint<
	rule extends RegExp | PatternIntersection = RegExp | PatternIntersection
> extends ConstraintSet<{
	leaf: RegExp
	intersection: PatternIntersection
	rule: rule
	attributes: {}
	disjoinable: false
}> {
	readonly kind = "pattern"
	readonly literal = `${this.rule}` as `/${string}/${string}`

	writeDefaultDescription() {
		return isArray(this.rule)
			? this.rule.join(" and ")
			: `matched by ${this.rule}`
	}

	intersectRule(): Orthogonal {
		return orthogonal
	}
}

// converting a regex to a string alphabetizes the flags for us
export const serializeRegex = (regex: RegExp) =>
	`${regex}` as SerializedRegexLiteral

export type SerializedRegexLiteral = `/${string}/${string}`

export const sourceFromRegexLiteral = (literal: SerializedRegexLiteral) =>
	literal.slice(1, literal.lastIndexOf("/"))
