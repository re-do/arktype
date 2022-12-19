import type { ScopeRoot } from "../scope.js"
import { checkRules } from "../traverse/check.js"
import type { Domain, inferDomain } from "../utils/domains.js"
import { hasKind } from "../utils/domains.js"
import type { CollapsibleTuple, Dict } from "../utils/generics.js"
import { toArray } from "../utils/generics.js"
import type { BranchComparison } from "./branches.js"
import { compareBranches } from "./branches.js"
import type { SetOperationResult } from "./compose.js"
import { empty, equal } from "./compose.js"
import type { Identifier } from "./node.js"
import type { RuleSet } from "./rules/rules.js"
import { rulesIntersection } from "./rules/rules.js"
import { isExactValuePredicate, resolvePredicateIfIdentifier } from "./utils.js"

export type Predicate<
    domain extends Domain = Domain,
    scope extends Dict = Dict
> = true | CollapsibleTuple<Condition<domain, scope>>

export type Condition<
    domain extends Domain = Domain,
    scope extends Dict = Dict
> = RuleSet<domain, scope> | ExactValue<domain> | Identifier<scope>

export type ExactValue<domain extends Domain = Domain> = {
    readonly value: inferDomain<domain>
}

export type PredicateContext = {
    domain: Domain
    scope: ScopeRoot
}

export type ResolvedPredicate<
    domain extends Domain = Domain,
    scope extends Dict = Dict
> = Exclude<Predicate<domain, scope>, string>

export type PredicateComparison =
    | SetOperationResult<Predicate>
    | BranchComparison

export const comparePredicates = (
    domain: Domain,
    l: Predicate,
    r: Predicate,
    scope: ScopeRoot
): PredicateComparison => {
    const lResolution = resolvePredicateIfIdentifier(domain, l, scope)
    const rResolution = resolvePredicateIfIdentifier(domain, r, scope)
    if (lResolution === true) {
        return rResolution === true ? equal : r
    }
    if (rResolution === true) {
        return l
    }
    if (hasKind(lResolution, "Object") && hasKind(rResolution, "Object")) {
        return isExactValuePredicate(lResolution)
            ? isExactValuePredicate(rResolution)
                ? lResolution.value === rResolution.value
                    ? equal
                    : empty
                : checkRules(domain, lResolution.value, rResolution, scope)
                ? l
                : empty
            : isExactValuePredicate(rResolution)
            ? checkRules(domain, rResolution.value, lResolution, scope)
                ? r
                : empty
            : rulesIntersection(lResolution, rResolution, { domain, scope })
    }
    const lComparisons = toArray(lResolution)
    const rComparisons = toArray(rResolution)
    const comparison = compareBranches(
        domain,
        lComparisons,
        rComparisons,
        scope
    )
    if (
        comparison.equalPairs.length === lComparisons.length &&
        comparison.equalPairs.length === rComparisons.length
    ) {
        return equal
    }
    if (
        comparison.lSubconditionsOfR.length + comparison.equalPairs.length ===
        lComparisons.length
    ) {
        return l
    }
    if (
        comparison.rSubconditionsOfL.length + comparison.equalPairs.length ===
        rComparisons.length
    ) {
        return r
    }
    return comparison
}
