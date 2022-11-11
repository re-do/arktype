import type { Config } from "./arktype.js"
import { Type } from "./arktype.js"
import { parseRoot } from "./parse/parse.js"
import type { Attributes } from "./parse/state/attributes/attributes.js"
import type { inferRoot } from "./traverse/infer.js"
import type { validateRoot } from "./traverse/validate.js"
import { chainableNoOpProxy } from "./utils/chainableNoOpProxy.js"
import { deepClone } from "./utils/deepClone.js"
import type { dictionary } from "./utils/dynamicTypes.js"
import type { evaluate } from "./utils/generics.js"
import type { LazyDynamicWrap } from "./utils/lazyDynamicWrap.js"
import { lazyDynamicWrap } from "./utils/lazyDynamicWrap.js"

const rawScope = (aliases: dictionary, config: Config = {}) => {
    const root = new ScopeRoot(aliases, config)
    const compiled: Scope<dictionary> = { $: root as any }
    for (const name in aliases) {
        const attributes = parseRoot(aliases[name], compiled)
        root.attributes[name] = attributes
        root.parseCache.set(name, attributes)
        compiled[name] = new Type(attributes, config, compiled)
    }
    return compiled
}

export const scope = lazyDynamicWrap(rawScope) as any as LazyDynamicWrap<
    InferredScopeFn,
    DynamicScopeFn
>

type InferredScopeFn = <aliases, inferredParent extends dictionary = {}>(
    aliases: validateAliases<
        aliases,
        inferAliases<aliases, inferredParent> & inferredParent
    >,
    config?: Config<inferredParent>
) => Scope<inferAliases<aliases, inferredParent>>

type DynamicScopeFn = <aliases>(
    aliases: aliases,
    config?: Config
) => Scope<aliases>

export type Scope<inferred> = {
    $: ScopeRoot<inferred>
} & inferredScopeToArktypes<inferred>

export type DynamicScope = Scope<dictionary>

type inferredScopeToArktypes<inferred> = {
    [name in keyof inferred]: Type<inferred[name]>
}

export class ScopeRoot<inferred> {
    parseCache = new ParseCache()

    attributes = {} as Record<keyof inferred, Attributes>

    constructor(
        public aliases: Record<keyof inferred, unknown>,
        public config: Config<dictionary>
    ) {}

    get infer(): inferred {
        return chainableNoOpProxy
    }
}

export class ParseCache {
    private cache: dictionary<Attributes | undefined> = {}

    constructor() {}

    get(definition: string) {
        if (definition in this.cache) {
            return deepClone(this.cache[definition])
        }
    }

    set(definition: string, attributes: Attributes) {
        this.cache[definition] = attributes
    }
}

type validateAliases<aliases, scope extends dictionary> = evaluate<{
    [name in keyof aliases]: validateRoot<aliases[name], scope>
}>

type inferAliases<aliases, scope extends dictionary> = evaluate<{
    [name in keyof aliases]: inferRoot<aliases[name], scope, aliases>
}>
