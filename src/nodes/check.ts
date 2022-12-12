import type { ScopeRoot } from "../scope.js"
import type { PredicateContext } from "./compare.js"
import type { TypeNode, UnknownConstraints } from "./node.js"

export type AttributeChecker<data, k extends keyof UnknownConstraints> = (
    data: data,
    attribute: UnknownConstraints[k]
) => boolean

export const checkAttributes = (
    data: unknown,
    attributes: UnknownConstraints,
    context: PredicateContext
) => {
    return true
}

export const checkNode = (data: unknown, node: TypeNode, scope: ScopeRoot) => {
    return true
}
