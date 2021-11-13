import {
    DiffUnions,
    ElementOf,
    Evaluate,
    Exact,
    ExcludeByValue,
    KeyValuate,
    ListPossibleTypes,
    memoize,
    narrow,
    RequiredKeys,
    SimpleFunction,
    stringify,
    StringifyPossibleTypes,
    transform,
    Unlisted
} from "@re-do/utils"
import { ExtractableDefinition, UnvalidatedTypeSet } from "./common.js"

export type MatchesArgs<DefType = any> = {
    definition: DefType
    typeSet: UnvalidatedTypeSet
}

export type ParseArgs<DefType = any> = {
    definition: DefType
    typeSet: UnvalidatedTypeSet
    path: string[]
    seen: string[]
}

export type BaseArgs<DefType = any> = MatchesArgs<DefType> & {
    path: string[]
    seen: string[]
}

export type AllowsArgs<
    DefType = any,
    Assignment = ExtractableDefinition
> = BaseArgs<DefType> & {
    assignment: Assignment
    ignoreExtraneousKeys: boolean
}

export type AllowsOptions = {
    ignoreExtraneousKeys?: boolean
}

export type ReferencesArgs<DefType = any> = BaseArgs<DefType> & {
    includeBuiltIn: boolean
}

export type ReferencesOptions = {
    includeBuiltIn?: boolean
}

export type GetDefaultArgs<DefType = any> = BaseArgs<DefType> & {
    // By default, we will throw if we encounter a cyclic required type
    // If this options is provided, we will return its value instead
    onRequiredCycle: any
}

export type GetDefaultOptions = {
    // By default, we will throw if we encounter a cyclic required type
    // If this options is provided, we will return its value instead
    onRequiredCycle?: any
}

// Paths at which errors occur mapped to their messages
export type ValidationErrors = Record<string, string>

export type ParentNode<
    DefType = any,
    Implements extends Partial<InheritableParserMethods<DefType>> = Partial<
        InheritableParserMethods<DefType>
    >,
    Inherits extends Partial<InheritableParserMethods<DefType>> = Partial<
        InheritableParserMethods<DefType>
    >
> = {
    type: DefType
    implements: Implements
    inherits: () => Inherits
}

export type NodeInput<
    DefType,
    Parent extends ParentNode,
    Methods extends UnimplementedParserMethods<DefType, Parent>
> = BaseNodeInput<DefType, Parent> & {
    implements?: Methods
}

export type NodeInput2<
    DefType,
    Parent extends ParentNode,
    Methods extends UnimplementedParserMethods2<DefType, Parent>
> = BaseNodeInput<DefType, Parent> & {
    implements?: Methods
}

export type BaseNodeInput<DefType, ParentNode> = {
    type: DefType
    parent: () => ParentNode
    matches: DefinitionMatcher<ParentNode>
}

export type DefinitionMatcher<Parent> = Parent extends ParentNode<
    infer ParentDef
>
    ? (args: MatchesArgs<ParentDef>) => boolean
    : never

export type UnimplementedParserMethods<DefType, Parent> = Omit<
    InheritableParserMethods<DefType>,
    Parent extends ParentNode<
        infer ParentDefType,
        infer Implements,
        infer Inherits
    >
        ? keyof Implements | keyof Inherits
        : never
>

export type UnimplementedParserMethods2<DefType, Parent> = Omit<
    InheritableParserMethods2<DefType>,
    Parent extends ParentNode<
        infer ParentDefType,
        infer Implements,
        infer Inherits
    >
        ? keyof Implements | keyof Inherits
        : never
>

type AnyNode = ParserNode<any, ParentNode, any>

export type ParserNode<
    DefType,
    Parent extends ParentNode,
    Methods extends UnimplementedParserMethods<DefType, Parent>
> = Evaluate<
    BaseNodeInput<DefType, Parent> & {
        inherits: () => Parent extends ParentNode<
            infer DefType,
            infer Implements,
            infer Inherits
        >
            ? Implements & Inherits
            : {}
        implements: RequiredKeys<Methods> extends never ? {} : Methods
    }
>

export type ParserNode2<
    DefType,
    Parent extends ParentNode,
    Methods extends UnimplementedParserMethods2<DefType, Parent>
> = Evaluate<
    BaseNodeInput<DefType, Parent> & {
        inherits: () => Parent extends ParentNode<
            infer DefType,
            infer Implements,
            infer Inherits
        >
            ? Implements & Inherits
            : {}
        implements: RequiredKeys<Methods> extends never ? {} : Methods
    }
>

export type InheritableParserMethods<DefType> = {
    allows?: (args: AllowsArgs<DefType>) => ValidationErrors
    references?: (args: ReferencesArgs<DefType>) => any
    getDefault?: (args: BaseArgs<DefType>) => any
}

export type InheritableParserMethods2<DefType> = {
    allows?: (
        assignmentFrom: ExtractableDefinition,
        options?: AllowsOptions
    ) => ValidationErrors
    references?: (options?: ReferencesOptions) => any
    getDefault?: (options?: GetDefaultOptions) => any
}

// export const createNode = <
//     DefType,
//     Parent extends ParentNode,
//     Methods extends UnimplementedParserMethods<DefType, Parent>
// >(
//     input: NodeInput<DefType, Parent, Methods>
// ): ParserNode<DefType, Parent, Methods> =>
//     ({
//         ...input,
//         implements: input.implements ?? {},
//         inherits: () => ({
//             ...input.parent().inherits(),
//             ...input.parent().implements
//         })
//     } as any)

export const createNode = <
    DefType,
    Parent extends ParentNode,
    Methods extends UnimplementedParserMethods2<DefType, Parent>
>(
    input: NodeInput2<DefType, Parent, Methods>
): ParserNode2<DefType, Parent, Methods> =>
    ({
        ...input,
        implements: input.implements ?? {},
        inherits: () => ({
            ...input.parent().inherits(),
            ...input.parent().implements
        })
    } as any)

export type Parser<DefType, Parent> = Required<
    InheritableParserMethods<DefType>
> & {
    matches: DefinitionMatcher<Parent>
}

export type Parser2<DefType, Parent> = (args: ParseArgs<DefType>) => Required<
    InheritableParserMethods<DefType>
> & {
    matches: boolean
}

type ParserMethodName = keyof InheritableParserMethods<any>

export type ValidateNode<
    Definition extends AnyNode,
    Children extends AnyParser[],
    ImplementedMethodName =
        | keyof Definition["implements"]
        | keyof Definition["inherits"],
    MissingMethodNames extends ParserMethodName[] = ListPossibleTypes<
        Exclude<ParserMethodName, ImplementedMethodName>
    >
> = Children extends never[]
    ? MissingMethodNames extends never[]
        ? Definition
        : `The following methods were never implemented for this branch: ${StringifyPossibleTypes<`'${Unlisted<MissingMethodNames>}'`>}.`
    : Definition

export type ValidateChildren<
    ParentDefType extends AnyNode,
    Children extends AnyParser[]
> = {
    [I in keyof Children]: Children[I] extends Parser<
        infer ChildDefType,
        infer Parent
    >
        ? ChildDefType extends ParentDefType["type"]
            ? Children[I]
            : `Children must have a definition that is assignable to that of their parent.`
        : never
}

export type AnyParser = Parser<any, ParentNode>

export type AnyParser2 = Parser2<any, ParentNode>

const parserMethodNames: ListPossibleTypes<ParserMethodName> = [
    "allows",
    "references",
    "getDefault"
]

// Re:Root, reroute its root to reroot
export const reroot = {
    type: {} as any,
    implements: {},
    inherits: () => ({})
}

// export const createParser = memoize(
//     <
//         Node extends ParserNode<DefType, Parent, Methods>,
//         DefType,
//         Parent extends ParentNode,
//         Methods extends UnimplementedParserMethods<DefType, Parent>,
//         Children extends AnyParser[] = []
//     >(
//         node: ValidateNode<Node, Children>,
//         ...children: ValidateChildren<Node, Children>
//     ): Parser<Node["type"], ReturnType<Node["parent"]>> => {
//         const validatedChildren = children as AnyParser[]
//         const methods: Required<InheritableParserMethods<Node["type"]>> =
//             transform(parserMethodNames, ([i, methodName]) => {
//                 const implemented: Partial<InheritableParserMethods<DefType>> =
//                     node.implements
//                 if (implemented[methodName]) {
//                     return [methodName, implemented[methodName]]
//                 } else if (node.inherits()[methodName]) {
//                     return [methodName, node.inherits()[methodName]]
//                 }
//                 return [
//                     methodName,
//                     (args: ParseArgs<any>) => {
//                         const match = validatedChildren.find((child) =>
//                             child.matches(args)
//                         )
//                         if (!match) {
//                             throw new Error(
//                                 `None of ${stringify(
//                                     validatedChildren
//                                 )} provides a matching parser for ${
//                                     args.definition
//                                 }.`
//                             )
//                         }
//                         match[methodName](args as any)
//                     }
//                 ]
//             })
//         return {
//             matches: node.matches,
//             ...methods
//         }
//     }
// )

export const createParser =
    <
        Node extends ParserNode2<DefType, Parent, Methods>,
        DefType,
        Parent extends ParentNode,
        Methods extends UnimplementedParserMethods2<DefType, Parent>,
        Children extends AnyParser2[] = []
    >(
        node: Node, //ValidateNode<Node, Children>,
        ...children: Children //ValidateChildren<Node, Children>
    ): Parser2<Node["type"], Node["parent"]> =>
    (args) => {
        const validatedChildren = children as AnyParser2[]
        const methods: Required<InheritableParserMethods<Node["type"]>> =
            transform(parserMethodNames, ([i, methodName]) => {
                const implemented: Partial<InheritableParserMethods<DefType>> =
                    node.implements
                if (implemented[methodName]) {
                    return [methodName, implemented[methodName]]
                } else if (node.inherits()[methodName]) {
                    return [methodName, node.inherits()[methodName]]
                }
                const delegate = validatedChildren.find(
                    (child) => child(args).matches
                )
                if (!delegate) {
                    throw new Error(
                        `None of ${stringify(
                            validatedChildren
                        )} provides a matching parser for ${args.definition}.`
                    )
                }
                return [methodName, delegate(args)[methodName]]
            })
        return {
            matches: node.matches(args),
            ...methods
        }
    }
