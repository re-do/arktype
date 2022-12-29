import type { TypeNode } from "../nodes/node.ts"
import type { Scope } from "../scope.ts"
import type { Morphable } from "../type.ts"
import { Type } from "../type.ts"
import type { Primitive, Subdomain } from "../utils/domains.ts"
import { subdomainOf } from "../utils/domains.ts"
import { throwParseError } from "../utils/errors.ts"
import type {
    Dict,
    evaluate,
    isAny,
    isTopType,
    List
} from "../utils/generics.ts"
import type { inferRecord } from "./record.ts"
import { parseRecord } from "./record.ts"
import type { inferString, validateString } from "./string/string.ts"
import { parseString } from "./string/string.ts"
import type {
    inferTraitsTuple,
    TraitsTuple,
    validateTraitsTuple
} from "./tuple/traits.ts"
import type {
    inferTuple,
    TupleExpression,
    validateTupleExpression
} from "./tuple/tuple.ts"
import { parseTuple } from "./tuple/tuple.ts"

export const parseDefinition = (def: unknown, scope: Scope): TypeNode => {
    switch (subdomainOf(def)) {
        case "string":
            return parseString(def as string, scope)
        case "object":
            return parseRecord(def as Dict, scope)
        case "Array":
            return parseTuple(def as List, scope)
        case "RegExp":
            return { string: { regex: (def as RegExp).source } }
        default:
            return throwParseError(
                buildBadDefinitionTypeMessage(subdomainOf(def))
            )
    }
}

export type inferRoot<def, scope extends Scope> = def extends TraitsTuple
    ? inferTraitsTuple<def, scope>
    : inferDefinition<def, scope>

export type validateRoot<def, scope extends Scope> = isTopType<def> extends true
    ? buildUninferableDefinitionMessage<def>
    : def extends TraitsTuple
    ? validateTraitsTuple<def, scope>
    : validateDefinition<def, scope>

export type inferDefinition<
    def,
    scope extends Scope
> = isTopType<def> extends true
    ? never
    : def extends string
    ? inferString<def, scope>
    : def extends List
    ? inferTuple<def, scope>
    : def extends Morphable
    ? def["infer"]
    : def extends RegExp
    ? string
    : def extends Dict
    ? inferRecord<def, scope>
    : never

export type validateDefinition<
    def,
    scope extends Scope
> = isTopType<def> extends true
    ? buildUninferableDefinitionMessage<def>
    : def extends []
    ? []
    : def extends string
    ? validateString<def, scope>
    : def extends TupleExpression
    ? validateTupleExpression<def, scope>
    : def extends TerminalObject
    ? def
    : def extends BadDefinitionType
    ? buildBadDefinitionTypeMessage<subdomainOf<def>>
    : evaluate<{
          [k in keyof def]: validateDefinition<def[k], scope>
      }>

export type buildUninferableDefinitionMessage<def> =
    `Cannot statically parse a definition inferred as ${isAny<def> extends true
        ? "any"
        : "unknown"}. Use 'type.dynamic(...)' instead.`

export type TerminalObject = Morphable | RegExp

export type BadDefinitionType = Exclude<Primitive, string> | Function

export const buildBadDefinitionTypeMessage = <actual extends Subdomain>(
    actual: actual
): buildBadDefinitionTypeMessage<actual> =>
    `Type definitions must be strings or objects (was ${actual})`

export type buildBadDefinitionTypeMessage<actual extends Subdomain> =
    `Type definitions must be strings or objects (was ${actual})`
