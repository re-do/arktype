import type {
    Identifier,
    TraversalNode,
    TypeNode,
    TypeSet
} from "./nodes/node.ts"
import { compileNode } from "./nodes/node.ts"
import type { inferDefinition, validateDefinition } from "./parse/definition.ts"
import type { Scope } from "./scope.ts"
import { check } from "./traverse/check.ts"
import { Problems } from "./traverse/problems.ts"
import { chainableNoOpProxy } from "./utils/chainableNoOpProxy.ts"
import type {
    defer,
    Dict,
    evaluate,
    isTopType,
    parametersOf,
    returnOf,
    stringKeyOf,
    tailOf,
    xor
} from "./utils/generics.ts"
import type { LazyDynamicWrap } from "./utils/lazyDynamicWrap.ts"

export const nodeToType = (root: TypeSet, $: Scope, config: Traits): Type => {
    const traversal = compileNode(root, $)
    return Object.assign(
        (data: unknown) => {
            const result = check(data, traversal, $)
            return result
                ? { data }
                : { problems: new Problems({ path: "", reason: "invalid" }) }
        },
        {
            config,
            infer: chainableNoOpProxy,
            root,
            flat: traversal
        }
    ) as any
}

export type InferredTypeConstructor<$> = {
    <def>(def: validateDefinition<def, $>): toType<def, $, {}>

    <def, traits extends Traits<inferDefinition<def, $>, $>>(
        def: validateDefinition<def, $>,
        traits: traits
    ): toType<def, $, morphsFrom<traits, $>>
}

export type toType<def, $, morphs extends Morphs> = isTopType<def> extends true
    ? never
    : def extends validateDefinition<def, $>
    ? {} extends morphs
        ? Type<inferDefinition<def, $>>
        : Morphable<inferDefinition<def, $>, morphs>
    : never

export type Traits<data = unknown, $ = Dict> = Morphs<data, $>

export type Morphs<data = unknown, $ = Dict> = {
    from?: Sources<data, $>
    to?: Targets<data, $>
}

export type Sources<data, $> = {
    [name in Identifier<$>]?: (
        source: inferDefinition<name, $>,
        ...args: never[]
    ) => data
}

export type Targets<data, $> = {
    [name in Identifier<$>]?: (
        data: data,
        ...args: never[]
    ) => inferDefinition<name, $>
}

export type morphsFrom<traits extends Traits, $> = evaluate<
    (traits["from"] extends {} ? { from: traits["from"] } : {}) &
        (traits["to"] extends {}
            ? {
                  to: {
                      [name in stringKeyOf<traits["to"]>]: (
                          ...args: parametersOf<traits["to"][name]>
                      ) => InferResult<name, $>
                  }
              }
            : {})
>

type compileOutMorph<morphs extends Morphs> = morphs["to"] extends {}
    ? {
          to: <k extends keyof morphs["to"]>(
              name: k,
              ...args: tailOf<parametersOf<morphs["to"][k]>>
          ) => returnOf<morphs["to"][k]>
      }
    : {}

type DynamicTypeFn = (def: unknown, traits?: Traits) => Morphable

export type TypeConstructor<$> = LazyDynamicWrap<
    InferredTypeConstructor<$>,
    DynamicTypeFn
>

export type Result<data> = xor<{ data: data }, { problems: Problems }>

export type Chainable<data, outMorph> = outMorph & Result<data>

export type InferResult<name extends string, $> = name extends keyof $
    ? // TODO: Fix
      Result<inferDefinition<name, $>> //ReturnType<$[name]>
    : Result<inferDefinition<name, $>>

export type Checker<data, outMorph> = (data: unknown) => outMorph & Result<data>

export type TypeMetadata<data = unknown> = {
    infer: data
    root: TypeNode
    flat: TraversalNode
}

export type Type<data = unknown> = defer<Checker<data, {}> & TypeMetadata<data>>

export type Morphable<data = unknown, morphs extends Morphs = Morphs> = defer<
    Checker<data, compileOutMorph<morphs>> & TypeMetadata<data>
>
