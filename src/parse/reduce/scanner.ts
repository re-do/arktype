import type { Dictionary } from "../../utils/generics.js"

export class Scanner<Lookahead extends string = string> {
    private chars: string[]
    private i: number
    finalized = false

    constructor(def: string) {
        this.chars = [...def]
        this.i = 0
    }

    /** Get lookahead and advance scanner by one */
    shift() {
        return (this.chars[this.i++] ?? "") as Lookahead
    }

    get lookahead() {
        return (this.chars[this.i] ?? "") as Lookahead
    }

    shiftUntil(condition: Scanner.UntilCondition): string {
        let shifted = ""
        while (!condition(this, shifted) && this.lookahead) {
            shifted += this.shift()
        }
        return shifted
    }

    shiftUntilNextTerminator() {
        this.shiftUntil(Scanner.lookaheadIsNotWhitespace)
        return this.shiftUntil(Scanner.lookaheadIsTerminator)
    }

    get unscanned() {
        return this.chars.slice(this.i, this.chars.length).join("")
    }

    lookaheadIs<Char extends Lookahead>(char: Char): this is Scanner<Char> {
        return this.lookahead === char
    }

    lookaheadIsIn<Tokens extends Dictionary>(
        tokens: Tokens
    ): this is Scanner<Extract<keyof Tokens, string>> {
        return this.lookahead in tokens
    }
}

export namespace Scanner {
    export type UntilCondition = (scanner: Scanner, shifted: string) => boolean

    export type OnInputEndFn = (scanner: Scanner, shifted: string) => string

    export type ShiftUntilOptions = {
        onInputEnd?: OnInputEndFn
    }

    export const lookaheadIsTerminator: UntilCondition = (scanner: Scanner) =>
        scanner.lookahead in terminatingChars

    export const lookaheadIsNotWhitespace: UntilCondition = (
        scanner: Scanner
    ) => scanner.lookahead !== " "

    export const comparatorStartChars = {
        "<": true,
        ">": true,
        "=": true
    } as const

    export const terminatingChars = {
        ...comparatorStartChars,
        "|": true,
        "&": true,
        ")": true,
        "[": true,
        "%": true,
        " ": true
    } as const

    export type TerminatingChar = keyof typeof Scanner.terminatingChars

    export const comparators = {
        "<": true,
        ">": true,
        "<=": true,
        ">=": true,
        "==": true
    } as const

    export type Comparator = keyof typeof comparators

    export const pairableComparators = {
        "<": true,
        "<=": true
    } as const

    export type PairableComparator = keyof typeof pairableComparators

    export type ComparatorStartChar = keyof typeof comparatorStartChars

    export const oneCharComparators = {
        "<": true,
        ">": true
    } as const

    export type OneCharComparator = keyof typeof oneCharComparators

    export const comparatorDescriptions = {
        "<": "less than",
        ">": "greater than",
        "<=": "at most",
        ">=": "at least",
        "==": "exactly"
    } as const

    export const invertedComparators = {
        "<": ">",
        ">": "<",
        "<=": ">=",
        ">=": "<=",
        "==": "=="
    } as const

    export type invertedComparators = typeof invertedComparators

    export const branchTokens = {
        "|": true,
        "&": true
    } as const

    export type BranchToken = keyof typeof branchTokens

    export type InfixToken = BranchToken | Comparator | "%"

    export type PostfixToken = "[]"

    export type OperatorToken = InfixToken | PostfixToken

    export type finalized = "{done}"

    export type shift<
        Lookahead extends string,
        Unscanned extends string
    > = `${Lookahead}${Unscanned}`

    export type tailOf<S> = S extends `${string}${infer Tail}` ? Tail : ""

    export type shiftUntil<
        Unscanned extends string,
        Terminator extends string,
        InvertTerminatorComparison extends boolean = false,
        Scanned extends string = ""
    > = Unscanned extends Scanner.shift<infer Lookahead, infer NextUnscanned>
        ? DoneShifting<
              Lookahead,
              Terminator,
              InvertTerminatorComparison
          > extends true
            ? [Scanned, Unscanned]
            : shiftUntil<
                  NextUnscanned,
                  Terminator,
                  InvertTerminatorComparison,
                  `${Scanned}${Lookahead}`
              >
        : [Scanned, ""]

    type DoneShifting<
        Lookahead extends string,
        Terminator extends string,
        InvertTerminatorComparison extends boolean
    > = InvertTerminatorComparison extends true
        ? Terminator extends Lookahead
            ? false
            : true
        : Lookahead extends Terminator
        ? true
        : false

    export type shiftUntilNextTerminator<Unscanned extends string> = shiftUntil<
        skipWhitespace<Unscanned>,
        TerminatingChar
    >

    export type skipWhitespace<Unscanned extends string> = shiftUntil<
        Unscanned,
        " ",
        true
    >[1]

    export type shiftResult<
        scanned extends string,
        unscanned extends string
    > = [scanned, unscanned]
}
