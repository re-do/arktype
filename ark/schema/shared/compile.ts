import {
	CastableBase,
	DynamicFunction,
	hasDomain,
	isDotAccessible,
	serializePrimitive
} from "@ark/util"
import type { BaseNode } from "../node.ts"
import type { NodeId } from "../parse.ts"
import { registeredReference } from "./registry.ts"
import type { TraversalKind } from "./traversal.ts"

export type CoercibleValue = string | number | boolean | null | undefined

export class CompiledFunction<
	args extends readonly string[]
> extends CastableBase<{
	[k in args[number]]: k
}> {
	readonly argNames: args
	readonly body = ""

	constructor(...args: args) {
		super()
		this.argNames = args
		for (const arg of args) {
			if (arg in this) {
				throw new Error(
					`Arg name '${arg}' would overwrite an existing property on FunctionBody`
				)
			}
			;(this as any)[arg] = arg
		}
	}

	indentation = 0
	indent(): this {
		this.indentation += 4
		return this
	}

	dedent(): this {
		this.indentation -= 4
		return this
	}

	prop(key: PropertyKey, optional = false): string {
		return compileLiteralPropAccess(key, optional)
	}

	index(key: string | number, optional = false): string {
		return indexPropAccess(`${key}`, optional)
	}

	line(statement: string): this {
		;(this.body as any) += `${" ".repeat(this.indentation)}${statement}\n`
		return this
	}

	const(identifier: string, expression: CoercibleValue): this {
		this.line(`const ${identifier} = ${expression}`)
		return this
	}

	let(identifier: string, expression: CoercibleValue): this {
		return this.line(`let ${identifier} = ${expression}`)
	}

	set(identifier: string, expression: CoercibleValue): this {
		return this.line(`${identifier} = ${expression}`)
	}

	if(condition: string, then: (self: this) => this): this {
		return this.block(`if (${condition})`, then)
	}

	elseIf(condition: string, then: (self: this) => this): this {
		return this.block(`else if (${condition})`, then)
	}

	else(then: (self: this) => this): this {
		return this.block("else", then)
	}

	/** Current index is "i" */
	for(
		until: string,
		body: (self: this) => this,
		initialValue: CoercibleValue = 0
	): this {
		return this.block(`for (let i = ${initialValue}; ${until}; i++)`, body)
	}

	/** Current key is "k" */
	forIn(object: string, body: (self: this) => this): this {
		return this.block(`for (const k in ${object})`, body)
	}

	block(prefix: string, contents: (self: this) => this, suffix = ""): this {
		this.line(`${prefix} {`)
		this.indent()
		contents(this)
		this.dedent()
		return this.line(`}${suffix}`)
	}

	return(expression: CoercibleValue = ""): this {
		return this.line(`return ${expression}`)
	}

	write(name = "anonymous"): string {
		return `${name}(${this.argNames.join(", ")}) {
${this.body}}`
	}

	compile<
		f extends (
			...args: {
				[i in keyof args]: never
			}
		) => unknown
	>(): f {
		return new DynamicFunction(...this.argNames, this.body)
	}
}

export const compileSerializedValue = (value: unknown): string =>
	hasDomain(value, "object") || typeof value === "symbol" ?
		registeredReference(value)
	:	serializePrimitive(value as never)

export const compileLiteralPropAccess = (
	key: PropertyKey,
	optional = false
): string => {
	if (typeof key === "string" && isDotAccessible(key))
		return `${optional ? "?" : ""}.${key}`

	return indexPropAccess(serializeLiteralKey(key), optional)
}

export const serializeLiteralKey = (key: PropertyKey): string =>
	typeof key === "symbol" ? registeredReference(key) : JSON.stringify(key)

export const indexPropAccess = (key: string, optional = false): string =>
	`${optional ? "?." : ""}[${key}]`

export interface InvokeOptions extends ReferenceOptions {
	arg?: string
}

export interface ReferenceOptions {
	kind?: TraversalKind
	bind?: string
}

export declare namespace NodeCompiler {
	export interface Context {
		kind: TraversalKind
		optimistic?: true
	}
}

export class NodeCompiler extends CompiledFunction<["data", "ctx"]> {
	traversalKind: TraversalKind
	optimistic: boolean

	constructor(ctx: NodeCompiler.Context) {
		super("data", "ctx")
		this.traversalKind = ctx.kind
		this.optimistic = ctx.optimistic === true
	}

	invoke(node: BaseNode | NodeId, opts?: InvokeOptions): string {
		const arg = opts?.arg ?? this.data
		const requiresContext =
			typeof node === "string" ? true : this.requiresContextFor(node)
		const id = typeof node === "string" ? node : node.id
		if (requiresContext)
			return `${this.referenceToId(id, opts)}(${arg}, ${this.ctx})`

		return `${this.referenceToId(id, opts)}(${arg})`
	}

	referenceToId(id: NodeId, opts?: ReferenceOptions): string {
		const invokedKind = opts?.kind ?? this.traversalKind
		const base = `this.${id}${invokedKind}`
		return opts?.bind ? `${base}.bind(${opts?.bind})` : base
	}

	requiresContextFor(node: BaseNode): boolean {
		return this.traversalKind === "Apply" || node.allowsRequiresContext
	}

	initializeErrorCount(): this {
		return this.const("errorCount", "ctx.currentErrorCount")
	}

	returnIfFail(): this {
		return this.if("ctx.currentErrorCount > errorCount", () => this.return())
	}

	returnIfFailFast(): this {
		return this.if("ctx.failFast && ctx.currentErrorCount > errorCount", () =>
			this.return()
		)
	}

	traverseKey(
		keyExpression: string,
		accessExpression: string,
		node: BaseNode
	): this {
		const requiresContext = this.requiresContextFor(node)
		if (requiresContext) this.line(`${this.ctx}.path.push(${keyExpression})`)

		this.check(node, {
			arg: accessExpression
		})
		if (requiresContext) this.line(`${this.ctx}.path.pop()`)

		return this
	}

	check(node: BaseNode, opts?: InvokeOptions): this {
		return this.traversalKind === "Allows" ?
				this.if(`!${this.invoke(node, opts)}`, () => this.return(false))
			:	this.line(this.invoke(node, opts))
	}
}
