import type { Type } from "../main.ts"
import { serializeCase } from "../nodes/discriminate.ts"
import type {
    TraversalEntry,
    TraversalKey,
    TraversalNode
} from "../nodes/node.ts"
import { checkClass } from "../nodes/rules/class.ts"
import { checkDivisor } from "../nodes/rules/divisor.ts"
import type { TraversalPropEntry } from "../nodes/rules/props.ts"
import { checkBound } from "../nodes/rules/range.ts"
import { checkRegex } from "../nodes/rules/regex.ts"
import { precedenceMap } from "../nodes/rules/rules.ts"
import type { SizedData } from "../utils/domains.ts"
import { domainOf, hasDomain, subdomainOf } from "../utils/domains.ts"
import { throwInternalError } from "../utils/errors.ts"
import type { Dict, extend, List } from "../utils/generics.ts"
import { hasKey, keysOf } from "../utils/generics.ts"
import { getPath, Path } from "../utils/paths.ts"
import { stringify } from "../utils/serialize.ts"
import { Problems } from "./problems.ts"

export class TraversalState {
    path = new Path()
    problems = new Problems(this)

    // TODO: name by scope (scope registry?)
    #seen: { [name in string]?: object[] } = {}

    constructor(public type: Type) {}

    traverseResolution(data: unknown, name: string) {
        const lastType = this.type
        if (hasDomain(data, "object")) {
            if (hasKey(this.#seen, name)) {
                if (
                    this.#seen[name].some((checkedData) => data === checkedData)
                ) {
                    // If data has already been checked by this alias during this
                    // traversal, it must be valid or we wouldn't be here, so we can
                    // stop traversing.
                    return
                }
                this.#seen[name].push(data)
            } else {
                this.#seen[name] = [data]
            }
        }
        this.type = this.type.scope.resolve(name)
        traverse(data, this.type.flat, this)
        this.type = lastType
    }

    // TODO: add fast fail mode, use for unions
    traverseBranches(data: unknown, branches: TraversalEntry[][]) {
        const baseProblems = this.problems
        // TODO: Fix
        const subproblems: Problems[] = []
        for (const branch of branches) {
            this.problems = new Problems(this)
            checkEntries(data, branch, this)
            if (!this.problems.length) {
                this.problems = baseProblems
                return
            }
            subproblems.push(this.problems)
        }
        this.problems = baseProblems
        this.problems.add("union", { data })
    }
}

export const traverse = (
    data: unknown,
    node: TraversalNode,
    state: TraversalState
) => {
    if (typeof node === "string") {
        if (domainOf(data) !== node) {
            return state.problems.add("domain", { rule: [node], data })
        }
        return
    }
    return checkEntries(data, node, state)
}

export const checkEntries = (
    data: unknown,
    entries: List<TraversalEntry>,
    state: TraversalState
) => {
    let problemsPrecedence = Number.POSITIVE_INFINITY
    const initialProblemsCount = state.problems.length
    for (const [k, v] of entries) {
        if (precedenceMap[k] > problemsPrecedence) {
            return
        }
        if (k === "morph") {
            if (typeof v === "function") {
                return v(data)
            }
            let out = data
            for (const morph of v) {
                out = morph(out)
            }
            return out
        } else {
            checkers[k](data, v, state)
            if (state.problems.length > initialProblemsCount) {
                problemsPrecedence = precedenceMap[k]
            }
        }
    }
    return data
}

const createPropChecker = <propKind extends "requiredProps" | "optionalProps">(
    propKind: propKind
) =>
    ((data, props, state) => {
        const rootPath = state.path
        for (const [propKey, propNode] of props as TraversalPropEntry[]) {
            state.path.push(propKey)
            if (!hasKey(data, propKey)) {
                if (propKind !== "optionalProps") {
                    // TODO: resolve domains
                    state.problems.add("missing", { rule: [] })
                }
            } else {
                traverse(data[propKey], propNode, state)
            }
            state.path.pop()
        }
        state.path = rootPath
    }) as TraversalCheck<propKind>

const checkRequiredProps = createPropChecker("requiredProps")
const checkOptionalProps = createPropChecker("optionalProps")

export const checkSubdomain: TraversalCheck<"subdomain"> = (
    data,
    rule,
    state
) => {
    const dataSubdomain = subdomainOf(data)
    if (typeof rule === "string") {
        if (dataSubdomain !== rule) {
            return state.problems.add("domain", { rule: [rule], data })
        }
        return
    }
    if (dataSubdomain !== rule[0]) {
        return state.problems.add("domain", { rule: [rule[0]], data })
    }
    if (dataSubdomain === "Array" && typeof rule[2] === "number") {
        const actual = (data as List).length
        const expected = rule[2]
        if (expected !== actual) {
            return state.problems.add("tupleLength", {
                rule: expected,
                data: data as List
            })
        }
    }
    if (dataSubdomain === "Array" || dataSubdomain === "Set") {
        let i = 0
        for (const item of data as List | Set<unknown>) {
            state.path.push(`${i}`)
            traverse(item, rule[1], state)
            state.path.pop()
            i++
        }
    } else {
        return throwInternalError(
            `Unexpected subdomain entry ${stringify(rule)}`
        )
    }
    return true
}

const checkers = {
    regex: checkRegex,
    divisor: checkDivisor,
    domains: (data, domains, state) => {
        const entries = domains[domainOf(data)]
        if (entries) {
            checkEntries(data, entries, state)
        } else {
            state.problems.add("domain", { rule: keysOf(domains), data })
        }
    },
    domain: (data, domain, state) => {
        if (domainOf(data) !== domain) {
            state.problems.add("domain", { rule: [domain], data })
        }
    },
    subdomain: checkSubdomain,
    range: checkBound,
    requiredProps: checkRequiredProps,
    optionalProps: checkOptionalProps,
    branches: (data, branches, state) => state.traverseBranches(data, branches),
    switch: (data, rule, state) => {
        const dataAtPath = getPath(data, rule.path)
        const caseKey = serializeCase(rule.kind, dataAtPath)
        if (hasKey(rule.cases, caseKey)) {
            return checkEntries(data, rule.cases[caseKey], state)
        }
        const lastPath = state.path
        state.path = rule.path
        state.problems.add("union", { data })
        state.path = lastPath
    },
    alias: (data, name, state) => state.traverseResolution(data, name),
    class: checkClass,
    // TODO: add error message syntax.
    narrow: (data, narrow) => narrow(data),
    value: (data, value, state) => {
        if (data !== value) {
            state.problems.add("value", { rule: value, data })
        }
    }
} satisfies {
    [k in ValidationKey]: TraversalCheck<k>
} as {
    // after validating that each checker has the appropriate type, cast to a
    // more permissive type that avoids inferring input as never
    [k in ValidationKey]: TraversalCheck<any>
}

type ValidationKey = Exclude<TraversalKey, "morph">

export type TraversalCheck<k extends TraversalKey> = (
    data: RuleData<k>,
    rule: Extract<TraversalEntry, [k, unknown]>[1],
    state: TraversalState
) => void

export type ConstrainedRuleData = extend<
    { [k in TraversalKey]?: unknown },
    {
        regex: string
        divisor: number
        range: SizedData
        requiredProps: Dict
        optionalProps: Dict
        class: object
    }
>

export type RuleData<k extends TraversalKey> =
    k extends keyof ConstrainedRuleData ? ConstrainedRuleData[k] : unknown
