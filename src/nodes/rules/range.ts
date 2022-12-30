import { Scanner } from "../../parse/string/shift/scanner.ts"
import type { CheckState, TraversalCheck } from "../../traverse/check.ts"
import { DiagnosticMessageBuilder, Problems } from "../../traverse/problems.ts"
import { subdomainOf } from "../../utils/domains.ts"
import type { List } from "../../utils/generics.ts"
import { composeIntersection, empty, equal } from "../compose.ts"

export type Range = {
    readonly min?: Bound
    readonly max?: Bound
}

export type Bound = {
    readonly limit: number
    readonly exclusive?: true
}

export const rangeIntersection = composeIntersection<Range>((l, r) => {
    const minComparison = compareStrictness(l.min, r.min, "min")
    const maxComparison = compareStrictness(l.max, r.max, "max")
    if (minComparison === "l") {
        if (maxComparison === "r") {
            return compareStrictness(l.min!, r.max!, "min") === "l"
                ? empty
                : {
                      min: l.min!,
                      max: r.max!
                  }
        }
        return l
    }
    if (minComparison === "r") {
        if (maxComparison === "l") {
            return compareStrictness(l.max!, r.min!, "max") === "l"
                ? empty
                : {
                      min: r.min!,
                      max: l.max!
                  }
        }
        return r
    }
    return maxComparison === "l" ? l : maxComparison === "r" ? r : equal
})

export type BoundableData = number | string | List

export type RangeErrorContext = {
    comparator: Scanner.Comparator
    limit: number
    size: number
    kind: subdomainOf<BoundableData>
}

export const buildRangeError: DiagnosticMessageBuilder<"RangeViolation"> = ({
    comparator,
    limit,
    size,
    kind
}) =>
    `Must be ${Scanner.comparatorDescriptions[comparator]} ${limit} ${
        kind === "string" ? "characters " : kind === "Array" ? "items " : ""
    }(got ${size}).`

export const checkRange = ((state, range) => {
    const { data } = state
    const size = typeof data === "number" ? data : data.length
    if (range.min) {
        if (
            size < range.min.limit ||
            (size === range.min.limit && range.min.exclusive)
        ) {
            state.problems.addProblem(state, {
                comparator: toComparator("min", range.min),
                limit: range.min.limit,
                size,
                kind: subdomainOf(data)
            })
        }
    }
    if (range.max) {
        if (
            size > range.max.limit ||
            (size === range.max.limit && range.max.exclusive)
        ) {
            state.problems.addProblem(state, {
                comparator: toComparator("max", range.max),
                limit: range.max.limit,
                size,
                kind: subdomainOf(data)
            })
        }
    }
}) satisfies TraversalCheck<"range">

export const buildEmptyRangeMessage = (min: Bound, max: Bound) =>
    `the range bounded by ${stringifyBound("min", min)} and ${stringifyBound(
        "max",
        max
    )} is empty`

const stringifyBound = (kind: BoundKind, bound: Bound) =>
    `${toComparator(kind, bound)}${bound.limit}` as const

const toComparator = (kind: BoundKind, bound: Bound) =>
    `${kind === "min" ? ">" : "<"}${bound.exclusive ? "" : "="}` as const

const invertedKinds = {
    min: "max",
    max: "min"
} as const

type BoundKind = keyof typeof invertedKinds

export const compareStrictness = (
    l: Bound | undefined,
    r: Bound | undefined,
    kind: BoundKind
) =>
    !l
        ? !r
            ? "="
            : "r"
        : !r
        ? "l"
        : l.limit === r.limit
        ? l.exclusive
            ? r.exclusive
                ? "="
                : "l"
            : r.exclusive
            ? "r"
            : "="
        : kind === "min"
        ? l.limit > r.limit
            ? "l"
            : "r"
        : l.limit < r.limit
        ? "l"
        : "r"
