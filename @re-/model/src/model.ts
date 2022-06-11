import { isEmpty } from "@re-/tools"
import { Root } from "./nodes/index.js"
import { ConfiguredSpace } from "./space.js"
import { Common } from "#common"

/*
 * Just use unknown for now since we don't have all the definitions yet
 * but we still want to allow references to other declared types
 */
export type CheckReferences<
    Def,
    DeclaredTypeName extends string
> = Root.Validate<
    Def,
    {
        [TypeName in DeclaredTypeName]: "unknown"
    }
>

export type GenerateConfig = {
    /*
     * By default, generate will throw if it encounters a cyclic required type
     * If this options is provided, it will return its value instead
     */
    onRequiredCycle?: any
}

export interface ParseConfig {
    eager?: boolean
}

export interface BaseOptions {
    parse?: ParseConfig
    validate?: ValidateOptions
    generate?: GenerateConfig
}

export type ValidateOptions = {
    ignoreExtraneousKeys?: boolean
    validator?: CustomValidator
    verbose?: boolean
}

export const errorsFromCustomValidator = (
    customValidator: CustomValidator,
    args: Parameters<CustomValidator>
): Common.ErrorsByPath => {
    const result = customValidator(...args)
    if (result && typeof result === "string") {
        // @ts-ignore
        return validationError({ path: args[2].ctx.path, message: result })
    } else if (result) {
        return result as Common.ErrorsByPath
    }
    return {}
}

export type CustomValidator = (
    value: unknown,
    errors: Common.ErrorsByPath,
    ctx: Common.ParseContext
) => string | Common.ErrorsByPath

export type AssertOptions = ValidateOptions

export type ValidateFunction<ModeledType> = (
    value: unknown,
    options?: ValidateOptions
) => {
    data?: ModeledType
    error?: string
    errorsByPath?: Common.ErrorsByPath
}

export type AssertFunction<ModeledType> = (
    value: unknown,
    options?: ValidateOptions
) => asserts value is ModeledType

export type GenerateFunction<ModeledType> = (
    options?: GenerateConfig
) => ModeledType

export type ModelFunction<Dict = {}> = <Def>(
    definition: Root.Validate<Def, Dict>,
    options?: BaseOptions
) => ModelFrom<Def, Parse<Def, Dict>>

export type ModelFrom<Def, ModeledType> = {
    definition: Def
    type: ModeledType
    validate: ValidateFunction<ModeledType>
    assert: AssertFunction<ModeledType>
    generate: GenerateFunction<ModeledType>
}

/**
 * Create a model.
 * @param definition {@as string} Document this.
 * @param options {@as ModelConfig?} And that.
 * @returns {@as any} The result.
 */
export const model: ModelFunction = (definition, options) =>
    new Model(definition, options) as any

export const eager: ModelFunction = (definition, options = {}) => {
    options.parse = { eager: true }
    return new Model(definition, options) as any
}

export type Parse<Def, Dict> = Root.Parse<Def, Dict, {}>

export class Model<Def, Dict = {}> implements ModelFrom<Def, Parse<Def, Dict>> {
    public readonly definition: Def
    private root: Common.Node<unknown>

    constructor(
        definition: Root.Validate<Def, Dict>,
        options?: BaseOptions,
        space?: ConfiguredSpace
    ) {
        this.definition = definition as Def
        this.root = Root.parse(definition, {
            ...Common.defaultParseContext,
            ...options?.parse,
            space: space ?? { dictionary: {}, config: {} }
        })
    }

    get type(): Parse<Def, Dict> {
        return Common.typeDefProxy
    }

    validate(value: unknown) {
        const errorsByPath = this.root.validateByPath(value)
        return isEmpty(errorsByPath)
            ? { data: value as Parse<Def, Dict> }
            : { error: Common.stringifyErrors(errorsByPath), errorsByPath }
    }

    assert(value: unknown): asserts value is Parse<Def, Dict> {
        const { error } = this.validate(value)
        if (error) {
            throw new Error(error)
        }
    }

    generate() {
        return this.root.generate() as Parse<Def, Dict>
    }
}
