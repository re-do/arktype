import {
    chainableNoOpProxy,
    ElementOf,
    Evaluate,
    Iteration,
    Merge,
    MutuallyExclusiveProps
} from "@re-/tools"
import { Base, Root } from "./nodes/index.js"

/**
 * Create a model.
 * @param definition {@as string} Document this.
 * @param options {@as ModelConfig?} And that.
 * @returns {@as any} The result.
 */
export const model: ModelFunction = (definition, options) => {
    const root = Root.parse(definition, Base.Parsing.createContext(options))
    return new Model(root, options) as any
}

export const eager: ModelFunction = (definition, options = {}) => {
    options.parse = { eager: true }
    return model(definition, options) as any
}

export type ModelFunction<Dict = {}> = <Def>(
    definition: Root.Validate<Def, Dict>,
    options?: Base.ModelOptions
) => ModelFrom<Def, Parse<Root.Validate<Def, Dict>, Dict>>

export type ModelFrom<Def, ModeledType> = Evaluate<{
    definition: Def
    type: ModeledType
    validate: ValidateFunction<ModeledType>
    assert: AssertFunction<ModeledType>
    generate: GenerateFunction<ModeledType>
    references: ReferencesFunction<Def>
}>

export class Model implements ModelFrom<unknown, unknown> {
    definition: unknown

    constructor(
        public root: Base.Parsing.Node,
        public config: Base.ModelOptions = {}
    ) {
        this.definition = root.def
    }

    get type() {
        return chainableNoOpProxy
    }

    validate(value: unknown, options?: Base.Validation.Options) {
        const args = Base.Validation.createArgs(
            value,
            options,
            this.config.validate
        )
        const customValidator =
            args.cfg.validator ?? args.ctx.modelCfg.validator ?? "default"
        if (customValidator !== "default") {
            Base.Validation.customValidatorAllows(
                customValidator,
                this.root,
                args
            )
        } else {
            this.root.allows(args)
        }
        return args.errors.isEmpty()
            ? { data: value }
            : {
                  error: new Base.Validation.ValidationError(args.errors)
              }
    }

    assert(value: unknown, options?: Base.Validation.Options) {
        const validationResult = this.validate(value, options)
        if (validationResult.error) {
            throw validationResult.error
        }
        return validationResult.data
    }

    generate(options?: Base.Generation.Options) {
        return this.root.generate(
            Base.Generation.createArgs(options, this.config.generate)
        )
    }

    references(options?: Base.References.Options) {
        return this.root.references(options ?? {}) as any
    }
}

export type AssertOptions = Base.Validation.Options

export type ValidateFunction<ModeledType> = (
    value: unknown,
    options?: Base.Validation.Options
) => ValidationResult<ModeledType>

export type ValidationResult<ModeledType> = MutuallyExclusiveProps<
    { data: ModeledType },
    {
        error: Base.Validation.ValidationError
    }
>

export type AssertFunction<ModeledType> = (
    value: unknown,
    options?: Base.Validation.Options
) => ModeledType

export type GenerateFunction<ModeledType> = (
    options?: Base.Generation.Options
) => ModeledType

export type ReferencesFunction<Def> = <
    Options extends Base.References.Options = {}
>(
    options?: Options
) => Merge<
    {
        filter: Base.References.FilterFunction<string>
        preserveStructure: false
    },
    Options
> extends Base.References.Options<infer Filter, infer PreserveStructure>
    ? TransformReferences<
          Root.References<Def, PreserveStructure>,
          Filter,
          "list"
      >
    : []

export type Parse<Def, Dict> = Root.Parse<Def, Dict, {}>

export type References<
    Def,
    Options extends Base.References.TypeOptions = {}
> = Merge<
    { filter: string; preserveStructure: false; format: "list" },
    Options
> extends Base.References.TypeOptions<
    infer Filter,
    infer PreserveStructure,
    infer Format
>
    ? TransformReferences<
          Root.References<Def, PreserveStructure>,
          Filter,
          Format
      >
    : {}

type TransformReferences<
    References,
    Filter extends string,
    Format extends Base.References.TypeFormat
> = References extends string[]
    ? FormatReferenceList<FilterReferenceList<References, Filter, []>, Format>
    : {
          [K in keyof References]: TransformReferences<
              References[K],
              Filter,
              Format
          >
      }

type FilterReferenceList<
    References extends string[],
    Filter extends string,
    Result extends string[]
> = References extends Iteration<string, infer Current, infer Remaining>
    ? FilterReferenceList<
          Remaining,
          Filter,
          Current extends Filter ? [...Result, Current] : Result
      >
    : Result

type FormatReferenceList<
    References extends string[],
    Format extends Base.References.TypeFormat
> = Format extends "tuple"
    ? References
    : Format extends "list"
    ? ElementOf<References>[]
    : ElementOf<References>
