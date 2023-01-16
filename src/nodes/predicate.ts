import type { ScopeRoot } from "../scope.ts"
import { checkRules } from "../traverse/check.ts"
import type { Domain, inferDomain, Subdomain } from "../utils/domains.ts"
import { hasSubdomain } from "../utils/domains.ts"
import type {
    CollapsibleList,
    Dict,
    extend,
    stringKeyOf
} from "../utils/generics.ts"
import { collapseIfSingleton, listFrom } from "../utils/generics.ts"
import type { BranchesComparison } from "./branches.ts"
import { compareBranches, isBranchComparison } from "./branches.ts"
import type { KeyReducerFn, SetOperationResult } from "./compose.ts"
import { empty, equal } from "./compose.ts"
import type { Identifier, ValidatorNode } from "./node.ts"
import {
    isExactValuePredicate,
    resolveFlatPredicate,
    resolvePredicateIfIdentifier
} from "./resolve.ts"
import type { RuleSet, TraversalRuleEntry } from "./rules/rules.ts"
import { compileRules, rulesIntersection } from "./rules/rules.ts"

export type Predicate<domain extends Domain = Domain, $ = Dict> = Dict extends $
    ? true | CollapsibleList<Condition>
    : true | CollapsibleList<Condition<domain, $>>

export type TraversalPredicate =
    | TraversalCondition
    | [TraversalBranchesEntry]
    | [DiscriminatedTraversalBranchesEntry]

export type TraversalBranchesEntry = ["branches", readonly TraversalCondition[]]

export type DiscriminatableRuleName = "domain" | "subdomain" | "value"

export type DiscriminatedTraversalBranchesEntry<
    by extends DiscriminatableRuleName = DiscriminatableRuleName
> = ["cases", DiscriminatedTraversalBranches<by>]

export type DiscriminatedTraversalBranches<
    by extends DiscriminatableRuleName = DiscriminatableRuleName
> = {
    readonly path: string[]
    readonly by: by
    readonly cases: TraversalCases<by>
}

export type TraversalCases<
    key extends DiscriminatableRuleName = DiscriminatableRuleName
> = {
    [caseKey in CaseKeys[key]]?: TraversalPredicate
}

type CaseKeys = extend<
    Record<DiscriminatableRuleName, unknown>,
    {
        domain: Domain
        subdomain: Subdomain
        value: string
    }
>

export const compilePredicate = (
    domain: Domain,
    predicate: Predicate,
    $: ScopeRoot
): TraversalPredicate => {
    if (predicate === true) {
        return []
    }
    const branches = listFrom(predicate)
    const flatBranches: TraversalCondition[] = []
    for (const condition of branches) {
        if (typeof condition === "string") {
            flatBranches.push(
                ...branchesOf(resolveFlatPredicate(condition, domain, $))
            )
        } else if (isExactValuePredicate(condition)) {
            flatBranches.push([["value", condition.value]])
        } else {
            flatBranches.push(compileRules(condition, $))
        }
    }
    if (flatBranches.length === 1) {
        return flatBranches[0]
    }
    if (domain === "object") {
        return [
            [
                "cases",
                {
                    path: [],
                    by: "domain",
                    cases: {}
                }
            ]
        ]
    }
    return [["branches", flatBranches]]
}

const branchesOf = (flatPredicate: TraversalPredicate) =>
    (flatPredicate[0][0] === "branches"
        ? flatPredicate.slice(1)
        : [flatPredicate]) as TraversalCondition[]

export type Condition<domain extends Domain = Domain, $ = Dict> =
    | RuleSet<domain, $>
    | ExactValue<domain>
    | Identifier<$>

export type TraversalCondition =
    | readonly TraversalRuleEntry[]
    | [ExactValueEntry]

export type ExactValue<domain extends Domain = Domain> = {
    readonly value: inferDomain<domain>
}

export type ExactValueEntry = ["value", unknown]

export type PredicateContext = {
    domain: Domain
    $: ScopeRoot
}

export type ResolvedPredicate<
    domain extends Domain = Domain,
    $ = Dict
> = Exclude<Predicate<domain, stringKeyOf<$>>, string>

export type PredicateComparison =
    | SetOperationResult<Predicate>
    | BranchesComparison

export const comparePredicates = (
    domain: Domain,
    l: Predicate,
    r: Predicate,
    $: ScopeRoot
): PredicateComparison => {
    const lResolution = resolvePredicateIfIdentifier(domain, l, $)
    const rResolution = resolvePredicateIfIdentifier(domain, r, $)
    if (lResolution === true) {
        return rResolution === true ? equal : r
    }
    if (rResolution === true) {
        return l
    }
    if (
        hasSubdomain(lResolution, "object") &&
        hasSubdomain(rResolution, "object")
    ) {
        return isExactValuePredicate(lResolution)
            ? isExactValuePredicate(rResolution)
                ? lResolution.value === rResolution.value
                    ? equal
                    : empty
                : checkRules(domain, lResolution.value, rResolution, $)
                ? l
                : empty
            : isExactValuePredicate(rResolution)
            ? checkRules(domain, rResolution.value, lResolution, $)
                ? r
                : empty
            : rulesIntersection(lResolution, rResolution, { domain, $ })
    }
    const lComparisons = listFrom(lResolution)
    const rComparisons = listFrom(rResolution)
    const comparison = compareBranches(domain, lComparisons, rComparisons, $)
    if (
        comparison.equalities.length === lComparisons.length &&
        comparison.equalities.length === rComparisons.length
    ) {
        return equal
    }
    if (
        comparison.lSubconditionsOfR.length + comparison.equalities.length ===
        lComparisons.length
    ) {
        return l
    }
    if (
        comparison.rSubconditionsOfL.length + comparison.equalities.length ===
        rComparisons.length
    ) {
        return r
    }
    return comparison
}

export const predicateIntersection: KeyReducerFn<
    Required<ValidatorNode>,
    ScopeRoot
> = (domain, l, r, scope) => {
    const comparison = comparePredicates(domain, l, r, scope)
    if (!isBranchComparison(comparison)) {
        return comparison
    }
    return collapseIfSingleton([
        ...comparison.distinctIntersections,
        ...comparison.equalities.map(
            (indices) => comparison.lConditions[indices[0]]
        ),
        ...comparison.lSubconditionsOfR.map(
            (lIndex) => comparison.lConditions[lIndex]
        ),
        ...comparison.rSubconditionsOfL.map(
            (rIndex) => comparison.rConditions[rIndex]
        )
    ])
}

export const predicateUnion: KeyReducerFn<
    Required<ValidatorNode>,
    ScopeRoot
> = (domain, l, r, scope) => {
    const comparison = comparePredicates(domain, l, r, scope)
    if (!isBranchComparison(comparison)) {
        return comparison === l
            ? r
            : comparison === r
            ? l
            : // If a boolean has multiple branches, neither of which is a
            // subtype of the other, it consists of two opposite literals
            // and can be simplified to a non-literal boolean.
            domain === "boolean"
            ? true
            : ([l, r] as Condition[])
    }
    return collapseIfSingleton([
        ...comparison.lConditions.filter(
            (_, lIndex) =>
                !comparison.lSubconditionsOfR.includes(lIndex) &&
                !comparison.equalities.some(
                    (indexPair) => indexPair[0] === lIndex
                )
        ),
        ...comparison.rConditions.filter(
            (_, rIndex) =>
                !comparison.rSubconditionsOfL.includes(rIndex) &&
                !comparison.equalities.some(
                    (indexPair) => indexPair[1] === rIndex
                )
        )
    ])
}
