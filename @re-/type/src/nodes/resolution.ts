import { deepMerge } from "@re-/tools"
import { initializeParseContext } from "../parser/common.js"
import { Root } from "../parser/root.js"
import type { SpaceMeta } from "../space.js"
import { getResolutionDefAndOptions } from "../space.js"
import { Allows } from "./allows.js"
import { Base } from "./base.js"
import { Generate } from "./generate.js"
import type { References } from "./references.js"
import type { Traverse } from "./traverse.js"

export class ResolutionNode extends Base.node {
    public root: Base.node
    public rootDef: unknown

    constructor(public alias: string, space: SpaceMeta) {
        // If this is the first time we've seen the alias,
        // create a Node that will be used for future resolutions.
        const defAndOptions = getResolutionDefAndOptions(
            space.dictionary[alias]
        )
        const context = initializeParseContext(
            defAndOptions.options
                ? deepMerge(space.options, defAndOptions.options)
                : space.options,
            space
        )
        const root = Root.parse(defAndOptions.def, context)
        super(alias, root.ast, context)
        this.root = root
        this.rootDef = defAndOptions.def
    }

    toString() {
        return this.root.toString()
    }

    collectReferences(
        opts: References.Options<string, boolean>,
        collected: References.Collection
    ) {
        this.root.collectReferences(opts, collected)
    }

    references(opts: References.Options<string, boolean>) {
        return this.root.references(opts)
    }

    check(args: Allows.Args) {
        const nextArgs = this.nextArgs(args, this.context.validate)
        if (typeof args.data === "object" && args.data !== null) {
            if (
                args.context.checkedValuesByAlias[this.alias]?.includes(
                    args.data
                )
            ) {
                // If we've already seen this value, it must not have any errors or else we wouldn't be here
                return true
            }
            if (!args.context.checkedValuesByAlias[this.alias]) {
                nextArgs.context.checkedValuesByAlias[this.alias] = [args.data]
            } else {
                nextArgs.context.checkedValuesByAlias[this.alias].push(
                    args.data
                )
            }
        }
        const customValidator =
            nextArgs.cfg.validator ??
            nextArgs.context.modelCfg.validator ??
            "default"
        if (customValidator !== "default") {
            // TODO: Check custom validator format.
            Allows.checkCustomValidator(customValidator, this, nextArgs)
            return
        }
        this.root.check(nextArgs)
    }

    generate(args: Generate.Args) {
        const nextArgs = this.nextArgs(args, this.context.generate)
        if (args.context.seen.includes(this.alias)) {
            const onRequiredCycle =
                nextArgs.cfg.onRequiredCycle ??
                nextArgs.context.modelCfg.onRequiredCycle
            if (onRequiredCycle) {
                return onRequiredCycle
            }
            throw new Generate.RequiredCycleError(this.alias, args.context.seen)
        }
        return this.root.generate(nextArgs)
    }

    private nextArgs<
        Args extends {
            context: Traverse.Context<any>
            cfg: any
        }
    >(args: Args, aliasCfg: any): Args {
        return {
            ...args,
            context: {
                ...args.context,
                seen: [...args.context.seen, this.alias],
                modelCfg: { ...args.context.modelCfg, ...aliasCfg }
            }
        }
    }
}
