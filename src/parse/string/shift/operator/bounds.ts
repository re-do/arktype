import { stringifyRange } from "../../../../nodes/node.ts"
import type { DomainsJson } from "../../../../nodes/node.ts"
import type {
    Bound,
    Range,
    Comparator,
    MaxComparator
} from "../../../../nodes/rules/range.ts"
import {
    maxComparators,
    minComparators
} from "../../../../nodes/rules/range.ts"
import { throwInternalError } from "../../../../utils/errors.ts"
import type { error, keySet, mutable } from "../../../../utils/generics.ts"
import { isKeyOf, keysOf, listFrom } from "../../../../utils/generics.ts"
import type { NumberLiteral } from "../../../../utils/numericLiterals.ts"
import { tryParseWellFormedNumber } from "../../../../utils/numericLiterals.ts"
import { writeUnboundableMessage } from "../../../ast/bound.ts"
import type { DynamicState } from "../../reduce/dynamic.ts"
import { writeUnpairableComparatorMessage } from "../../reduce/shared.ts"
import type { state, StaticState } from "../../reduce/static.ts"
import type { Scanner } from "../scanner.ts"

export const parseBound = (s: DynamicState, start: ComparatorStartChar) => {
    const comparator = shiftComparator(s, start)
    const maybeMin = s.ejectRootIfLimit()
    return maybeMin === undefined
        ? parseRightBound(s, comparator)
        : s.reduceLeftBound(maybeMin, comparator)
}

export type parseBound<
    s extends StaticState,
    start extends ComparatorStartChar,
    unscanned extends string
> = shiftComparator<start, unscanned> extends infer shiftResultOrError
    ? shiftResultOrError extends Scanner.shiftResult<
          infer comparator extends Comparator,
          infer nextUnscanned
      >
        ? s["root"] extends NumberLiteral
            ? state.reduceLeftBound<s, s["root"], comparator, nextUnscanned>
            : parseRightBound<s, comparator, nextUnscanned>
        : shiftResultOrError
    : never

const oneCharComparators = {
    "<": true,
    ">": true
} as const

type OneCharComparator = keyof typeof oneCharComparators

export type ComparatorStartChar = Comparator extends `${infer char}${string}`
    ? char
    : never

export const comparatorStartChars: keySet<ComparatorStartChar> = {
    "<": true,
    ">": true,
    "=": true
}

const shiftComparator = (
    s: DynamicState,
    start: ComparatorStartChar
): Comparator =>
    s.scanner.lookaheadIs("=")
        ? `${start}${s.scanner.shift()}`
        : isKeyOf(start, oneCharComparators)
        ? start
        : s.error(singleEqualsMessage)

type shiftComparator<
    start extends ComparatorStartChar,
    unscanned extends string
> = unscanned extends `=${infer nextUnscanned}`
    ? [`${start}=`, nextUnscanned]
    : start extends OneCharComparator
    ? [start, unscanned]
    : error<singleEqualsMessage>

export const singleEqualsMessage = `= is not a valid comparator. Use == to check for equality`
type singleEqualsMessage = typeof singleEqualsMessage

export const parseRightBound = (s: DynamicState, comparator: Comparator) => {
    const limitToken = s.scanner.shiftUntilNextTerminator()
    const limit = tryParseWellFormedNumber(
        limitToken,
        writeInvalidLimitMessage(comparator, limitToken + s.scanner.unscanned)
    )
    const openRange = s.ejectRangeIfOpen()
    const rightBound = { comparator, limit }
    const range: Range = openRange
        ? !hasComparatorIn(rightBound, maxComparators)
            ? s.error(writeUnpairableComparatorMessage(comparator))
            : compareStrictness("min", openRange, rightBound) === "l"
            ? s.error(
                  writeEmptyRangeMessage({ min: openRange, max: rightBound })
              )
            : {
                  min: openRange,
                  max: rightBound
              }
        : hasComparator(rightBound, "==")
        ? rightBound
        : hasComparatorIn(rightBound, minComparators)
        ? { min: rightBound }
        : hasComparatorIn(rightBound, maxComparators)
        ? { max: rightBound }
        : throwInternalError(`Unexpected comparator '${rightBound.comparator}'`)
    s.intersect(distributeRange(range, s))
}

const distributeRange = (range: Range, s: DynamicState) => {
    const resolution = s.resolveRoot()
    const domains = keysOf(resolution)
    const distributedRange: mutable<DomainsJson> = {}
    const rangePredicate = { range } as const
    const isBoundable = domains.every((domain) => {
        switch (domain) {
            case "string":
                distributedRange.string = rangePredicate
                return true
            case "number":
                distributedRange.number = rangePredicate
                return true
            case "object":
                distributedRange.object = rangePredicate
                if (resolution.object === true) {
                    return false
                }
                return listFrom(resolution.object!).every(
                    (branch) =>
                        "instance" in branch && branch.instance === Array
                )
            default:
                return false
        }
    })
    if (!isBoundable) {
        s.error(writeUnboundableMessage(s.rootToString()))
    }
    return distributedRange
}

const hasComparator = <comparator extends Comparator>(
    bound: Bound,
    comparator: comparator
): bound is Bound<comparator> => bound.comparator === comparator

const hasComparatorIn = <comparators extends keySet<Comparator>>(
    bound: Bound,
    comparators: comparators
): bound is Bound<keyof comparators> => bound.comparator in comparators

export type parseRightBound<
    s extends StaticState,
    comparator extends Comparator,
    unscanned extends string
> = Scanner.shiftUntilNextTerminator<unscanned> extends Scanner.shiftResult<
    infer scanned,
    infer nextUnscanned
>
    ? tryParseWellFormedNumber<
          scanned,
          writeInvalidLimitMessage<comparator, scanned>
      > extends infer limit
        ? limit extends number
            ? s["branches"]["range"] extends {}
                ? comparator extends MaxComparator
                    ? state.reduceRange<
                          s,
                          s["branches"]["range"]["limit"],
                          s["branches"]["range"]["comparator"],
                          comparator,
                          `${limit}`,
                          nextUnscanned
                      >
                    : error<writeUnpairableComparatorMessage<comparator>>
                : state.reduceSingleBound<
                      s,
                      comparator,
                      `${limit}`,
                      nextUnscanned
                  >
            : error<limit & string>
        : never
    : never

export const writeInvalidLimitMessage = <
    comparator extends Comparator,
    limit extends string
>(
    comparator: comparator,
    limit: limit
): writeInvalidLimitMessage<comparator, limit> =>
    `Comparator ${comparator} must be followed by a number literal (was '${limit}')`

export type writeInvalidLimitMessage<
    comparator extends Comparator,
    limit extends string
> = `Comparator ${comparator} must be followed by a number literal (was '${limit}')`

export const writeEmptyRangeMessage = (range: Range) =>
    `${stringifyRange(range)} is empty`

export type BoundableDomain = "string" | "number" | "object"
