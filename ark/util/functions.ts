import { throwInternalError } from "./errors.js"
import { NoopBase } from "./records.js"

// export const cached = <T>(thunk: () => T): (() => T) => {
// 	let isCached = false
// 	let result: T | undefined
// 	return () => {
// 		if (!isCached) {
// 			result = thunk()
// 			isCached = true
// 		}
// 		return result as T
// 	}
// }

export const isThunk = <value>(
	value: value
): value is Extract<value, Thunk> extends never ? value & Thunk
:	Extract<value, Thunk> => typeof value === "function" && value.length === 0

export type Thunk<ret = unknown> = () => ret

export type thunkable<t> = t | Thunk<t>

export const DynamicFunction = class extends Function {
	constructor(...args: [string, ...string[]]) {
		const params = args.slice(0, -1)
		const body = args.at(-1)!
		try {
			super(...params, body)
		} catch (e) {
			return throwInternalError(
				`Encountered an unexpected error while compiling your definition:
                Message: ${e} 
                Source: (${args.slice(0, -1)}) => {
                    ${args.at(-1)}
                }`
			)
		}
	}
} as DynamicFunction

export type DynamicFunction = new <f extends (...args: never[]) => unknown>(
	...args: ConstructorParameters<typeof Function>
) => f & {
	apply(thisArg: null, args: Parameters<f>): ReturnType<f>

	call(thisArg: null, ...args: Parameters<f>): ReturnType<f>
}

export type CachedDecorator = {
	<self, returns>(
		target: (this: self) => returns,
		ctx: ClassGetterDecoratorContext<self, returns>
	): (this: self) => returns

	<self, returns>(
		target: (this: self) => returns,
		ctx: ClassMethodDecoratorContext<self, () => returns>
	): (this: self) => returns
}

export const cached: CachedDecorator = (target, ctx) =>
	function () {
		const value = target.call(this)
		Object.defineProperty(
			this,
			ctx.name,
			ctx.kind === "getter" ?
				{ value, enumerable: true }
			:	{
					value: (() => value).bind(this)
				}
		)
		return value
	}

export type CallableOptions<attachments extends object> = {
	attach?: attachments
	bind?: object
}

/** @ts-expect-error required to cast function type */
export class Callable<
	f extends (...args: never[]) => unknown,
	attachments extends object = {}
> extends NoopBase<f & attachments> {
	constructor(f: f, opts?: CallableOptions<attachments>) {
		super()
		const self = Object.setPrototypeOf(
			f.bind(opts?.bind ?? this),
			this.constructor.prototype
		)

		if (opts?.attach)
			Object.defineProperties(
				self,
				Object.getOwnPropertyDescriptors(opts.attach)
			)

		return self
	}
}

export type Guardable<input = unknown, narrowed extends input = input> =
	| ((In: input) => In is narrowed)
	| ((In: input) => boolean)
