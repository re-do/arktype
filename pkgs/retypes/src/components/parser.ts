import { ValueOf } from "@re-do/utils"
import {
    DiffUnions,
    ElementOf,
    Evaluate,
    // Exact,
    ExcludeByValue,
    Func,
    KeyValuate,
    ListPossibleTypes,
    memoize,
    narrow,
    RequiredKeys,
    stringify,
    StringifyPossibleTypes,
    transform,
    Unlisted
} from "@re-do/utils"
import { Function as ToolbeltFunction } from "ts-toolbelt"
import { unknownTypeError } from "../errors.js"
import type {
    ExtractableDefinition,
    Root,
    UnvalidatedTypeSet
} from "./common.js"
import { Shallow } from "./shallow/shallow.js"

export type MatchesArgs<DefType> = {
    definition: DefType
    typeSet: UnvalidatedTypeSet
}

export type ParseContext<DefType> = {
    typeSet: UnvalidatedTypeSet
    path: string[]
    seen: string[]
    depth: number
}

export type ParseArgs<DefType> = [
    definition: DefType,
    context: ParseContext<DefType>
]

export type AllowsOptions = {
    ignoreExtraneousKeys?: boolean
}

export type ReferencesOptions = {
    includeBuiltIn?: boolean
}

export type GenerateOptions = {
    // By default, we will throw if we encounter a cyclic required type
    // If this options is provided, we will return its value instead
    onRequiredCycle?: any
}

// Paths at which errors occur mapped to their messages
export type ValidationErrors = Record<string, string>

export type ParentParser<
    DefType = unknown,
    Inherits extends Partial<ParserInputMethods<DefType>> = Partial<
        ParserInputMethods<DefType>
    >,
    Implements extends Partial<ParserInputMethods<DefType>> = Partial<
        ParserInputMethods<DefType>
    >
> = {
    meta: {
        type: DefType
        inherits: Inherits
        implements: Implements
    }
}

export type ParserInput<DefType, Parent, Children extends DefType[]> = {
    type: DefType
    parent: () => Parent
    matches: DefinitionMatcher<Parent>
    parts?: (...args: ParseArgs<DefType>) => ValidateResult<any>[]
    children?: () => Children
    // What to do if no children match (defaults to throwing unparsable error)
    fallback?: (...args: ParseArgs<DefType>) => any
} & ImplementsInput<DefType, Parent, Children>

export type DefinitionMatcher<Parent> = Parent extends ParentParser<
    infer ParentDef
>
    ? (...args: ParseArgs<ParentDef>) => boolean
    : never

export type ImplementsInput<
    DefType,
    Parent,
    Children,
    Unimplemented = UnimplementedParserMethods<DefType, Parent>
> = Children extends never[]
    ? { implements: Unimplemented }
    : { implements?: Partial<Unimplemented> }

export type PartArgs<DefType> = [
    args: {
        def: DefType
        ctx: ParseContext<DefType>
        parts: ValidateResult<any>[]
    }
]

export type ParserInputMethods<DefType> = {
    allows: (
        ...args: [
            ...args: PartArgs<DefType>,
            assignment: ExtractableDefinition,
            options: AllowsOptions
        ]
    ) => ValidationErrors
    references: (
        ...args: [...args: PartArgs<DefType>, options: ReferencesOptions]
    ) => Shallow.Definition[]
    generate: (
        ...args: [...args: PartArgs<DefType>, options: GenerateOptions]
    ) => any
}

export type UnimplementedParserMethods<DefType, Parent> = Omit<
    ParserInputMethods<DefType>,
    keyof GetInheritedMethods<Parent>
>

export type ValidateFunction<DefType> = (
    ...args: ParseArgs<DefType>
) => ValidateResult<DefType>

export type ValidateResult<DefType> = {
    definition: DefType
    context: ParseContext<DefType>
    matches: boolean
} & {
    [MethodName in keyof ParserInputMethods<DefType>]: TransformInputMethod<
        ParserInputMethods<DefType>[MethodName]
    >
}

export type TransformInputMethod<
    Method extends ValueOf<ParserInputMethods<any>>
> = Method extends (
    ...args: [infer ParseResult, ...infer Rest, infer Opts]
) => infer Return
    ? (...args: [...rest: Rest, opts?: Opts]) => Return
    : Method

export type GetInheritedMethods<Parent> = Parent extends ParentParser<
    unknown,
    infer Inherits,
    infer Implements
>
    ? Inherits & Implements
    : {}

export type ParserMetadata<
    DefType,
    Parent,
    Methods,
    Inherits extends Partial<
        ParserInputMethods<DefType>
    > = GetInheritedMethods<Parent>,
    Implements extends Partial<
        ParserInputMethods<DefType>
    > = Methods extends undefined ? {} : Methods
> = Evaluate<{
    type: DefType
    inherits: Inherits
    implements: Implements
}>

export type Parser<DefType, Parent, Methods> = Evaluate<
    {
        meta: ParserMetadata<DefType, Parent, Methods>
    } & ValidateFunction<DefType>
>

export type ParserMethodName = keyof ParserInputMethods<any>

const parserMethodNames: ListPossibleTypes<ParserMethodName> = [
    "allows",
    "references",
    "generate"
]

// Re:Root, reroot its root by rerouting to reroot
export const reroot = {
    meta: {
        type: {} as Root.Definition,
        inherits: {},
        implements: {}
    }
}

type AnyParser = Parser<any, any, any>

export const createParser = <
    Input,
    DefType,
    Parent,
    Children extends DefType[] = []
>(
    config: ToolbeltFunction.Exact<
        Input,
        ParserInput<DefType, Parent, Children>
    >
): Parser<DefType, Parent, KeyValuate<Input, "implements">> => {
    const input = config as ParserInput<DefType, Parent, Children>
    const parent = input.parent() as any as ParentParser<DefType>
    const validatedChildren: AnyParser[] = (input.children?.() as any) ?? []
    const implemented: Partial<ParserInputMethods<DefType>> =
        input.implements ?? {}
    const inherited: Partial<ParserInputMethods<DefType>> = {
        ...parent.meta.inherits,
        ...parent.meta.implements
    }
    const parse = (
        definition: DefType,
        context: ParseContext<DefType>
    ): ValidateResult<DefType> => {
        const args: ParseArgs<DefType> = [
            definition,
            { ...context, depth: context.depth + 1 }
        ]
        let matchingChild: AnyParser
        if (validatedChildren.length) {
            const match = validatedChildren.find(
                (child) => child(...args).matches
            )
            if (!match) {
                if (input.fallback) {
                    return input.fallback(...args)
                }
                throw new Error(unknownTypeError(definition))
            }
            matchingChild = match
        }
        const methods: ParserInputMethods<DefType> = transform(
            parserMethodNames,
            ([i, methodName]) => {
                if (methodName in implemented) {
                    return [methodName, implemented[methodName]]
                }
                if (methodName in inherited) {
                    return [methodName, inherited[methodName]]
                }
                return [methodName, matchingChild(...args)[methodName]]
            }
        )
        return {
            matches: input.matches(...args),
            definition,
            context,
            ...methods
        } as any
    }
    return Object.assign(parse, {
        meta: {
            type: input.type,
            inherits: inherited,
            implements: input.implements
        }
    }) as any
}
