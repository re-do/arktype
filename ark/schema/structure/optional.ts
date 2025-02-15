import {
	hasDomain,
	isThunk,
	printable,
	throwParseError,
	type requireKeys
} from "@ark/util"
import type { Morph } from "../roots/morph.ts"
import type { BaseRoot } from "../roots/root.ts"
import { compileSerializedValue } from "../shared/compile.ts"
import type { declareNode } from "../shared/declare.ts"
import { ArkErrors } from "../shared/errors.ts"
import {
	defaultValueSerializer,
	implementNode,
	type nodeImplementationOf
} from "../shared/implement.ts"
import { registeredReference } from "../shared/registry.ts"
import { traverseKey } from "../shared/traversal.ts"
import { BaseProp, intersectProps, type Prop } from "./prop.ts"

export declare namespace Optional {
	export interface Schema extends Prop.Schema {
		default?: unknown
	}

	export interface Inner extends Prop.Inner {
		default?: unknown
	}

	export type Declaration = declareNode<
		Prop.Declaration<"optional"> & {
			schema: Schema
			normalizedSchema: Schema
			inner: Inner
		}
	>

	export type Node = OptionalNode

	export namespace Node {
		export type withDefault = requireKeys<
			Node,
			"default" | "defaultValueMorph" | "defaultValueMorphRef"
		>
	}
}

const implementation: nodeImplementationOf<Optional.Declaration> =
	implementNode<Optional.Declaration>({
		kind: "optional",
		hasAssociatedError: false,
		intersectionIsOpen: true,
		keys: {
			key: {},
			value: {
				child: true,
				parse: (schema, ctx) => ctx.$.parseSchema(schema)
			},
			default: {
				preserveUndefined: true
			}
		},
		normalize: schema => schema,
		defaults: {
			description: node => `${node.compiledKey}?: ${node.value.description}`
		},
		intersections: {
			optional: intersectProps
		}
	})

export class OptionalNode extends BaseProp<"optional"> {
	constructor(...args: ConstructorParameters<typeof BaseProp>) {
		super(...args)
		if ("default" in this.inner)
			assertDefaultValueAssignability(this.value, this.inner.default, this.key)
	}

	get outProp(): Prop.Node {
		if (!this.hasDefault()) return this
		const { default: defaultValue, ...requiredInner } = this.inner

		return this.cacheGetter(
			"outProp",
			this.$.node("required", requiredInner, { prereduced: true }) as never
		)
	}

	expression: string =
		this.hasDefault() ?
			`${this.compiledKey}: ${this.value.expression} = ${printable(this.inner.default)}`
		:	`${this.compiledKey}?: ${this.value.expression}`

	defaultValueMorph: Morph | undefined = getDefaultableMorph(this)

	defaultValueMorphRef: string | undefined =
		this.defaultValueMorph && registeredReference(this.defaultValueMorph)
}

export const Optional = {
	implementation,
	Node: OptionalNode
}

const defaultableMorphCache: Record<string, Morph | undefined> = {}

const getDefaultableMorph = (node: Optional.Node): Morph | undefined => {
	if (!node.hasDefault()) return

	const cacheKey = `{${node.compiledKey}: ${node.value.id} = ${defaultValueSerializer(node.default)}}`

	return (defaultableMorphCache[cacheKey] ??= computeDefaultValueMorph(
		node.key,
		node.value,
		node.default
	))
}

export const computeDefaultValueMorph = (
	key: PropertyKey,
	value: BaseRoot,
	defaultInput: unknown
): Morph => {
	if (typeof defaultInput === "function") {
		// if the value has a morph, pipe context through it
		return value.includesTransform ?
				(data, ctx) => {
					traverseKey(key, () => value((data[key] = defaultInput()), ctx), ctx)
					return data
				}
			:	data => {
					data[key] = defaultInput()
					return data
				}
	}

	// non-functional defaults can be safely cached as long as the morph is
	// guaranteed to be pure and the output is primitive
	const precomputedMorphedDefault =
		value.includesTransform ? value.assert(defaultInput) : defaultInput

	return hasDomain(precomputedMorphedDefault, "object") ?
			// the type signature only allows this if the value was morphed
			(data, ctx) => {
				traverseKey(key, () => value((data[key] = defaultInput), ctx), ctx)
				return data
			}
		:	data => {
				data[key] = precomputedMorphedDefault
				return data
			}
}

export const assertDefaultValueAssignability = (
	node: BaseRoot,
	value: unknown,
	key: PropertyKey | null
): unknown => {
	const wrapped = isThunk(value)

	if (hasDomain(value, "object") && !wrapped)
		throwParseError(writeNonPrimitiveNonFunctionDefaultValueMessage(key))

	const out = node.in(wrapped ? value() : value)

	if (out instanceof ArkErrors) {
		if (key === null) {
			// e.g. "Default must be assignable to number (was string)"
			throwParseError(`Default ${out.summary}`)
		}

		const atPath = out.transform(e =>
			e.transform(input => ({ ...input, prefixPath: [key] }) as never)
		)

		// e.g. "Default for bar must be assignable to number (was string)"
		// e.g. "Default for value at [0] must be assignable to number (was string)"
		throwParseError(`Default for ${atPath.summary}`)
	}

	return value
}

export type writeUnassignableDefaultValueMessage<
	baseDef extends string,
	defaultValue extends string
> = `Default value ${defaultValue} must be assignable to ${baseDef}`

export const writeNonPrimitiveNonFunctionDefaultValueMessage = (
	key: PropertyKey | null
): string => {
	const keyDescription =
		key === null ? ""
		: typeof key === "number" ? `for value at [${key}] `
		: `for ${compileSerializedValue(key)} `
	return `Non-primitive default ${keyDescription}must be specified as a function like () => ({my: 'object'})`
}
