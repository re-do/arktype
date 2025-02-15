import { printable, throwInternalError } from "@ark/util"
import type { type } from "arktype"
import * as assert from "node:assert/strict"
import type { TypeRelationshipAssertionData } from "../cache/writeAssertionCache.ts"
import type { AssertionContext } from "./attest.ts"

export type ThrowAssertionErrorContext = {
	message: string
	expected?: unknown
	actual?: unknown
	stack: string
}

export const throwAssertionError = ({
	stack,
	...errorArgs
}: ThrowAssertionErrorContext): never => {
	const e = new assert.AssertionError(errorArgs)
	e.stack = stack
	throw e
}

export type AssertFn = (
	expected: unknown,
	actual: unknown,
	ctx: AssertionContext
) => void

export type MappedTypeAssertionResult = {
	actual: unknown
	expected?: unknown
} | null

export type TypeAssertionMapper = (
	data: TypeRelationshipAssertionData,
	ctx: AssertionContext
) => MappedTypeAssertionResult

export class TypeAssertionMapping {
	fn: TypeAssertionMapper

	constructor(fn: TypeAssertionMapper) {
		this.fn = fn
	}
}

export const versionableAssertion =
	(fn: AssertFn): AssertFn =>
	(expected, actual, ctx) => {
		if (actual instanceof TypeAssertionMapping) {
			if (!ctx.typeRelationshipAssertionEntries) {
				throwInternalError(
					`Unexpected missing typeAssertionEntries when passed a TypeAssertionMapper`
				)
			}
			for (const [version, data] of ctx.typeRelationshipAssertionEntries) {
				let errorMessage = ""
				try {
					const mapped = actual.fn(data, ctx)
					if (mapped !== null) {
						fn(
							"expected" in mapped ? mapped.expected : expected,
							mapped.actual,
							ctx
						)
					}
				} catch (e) {
					errorMessage += `❌TypeScript@${version}:${e}\n`
				}
				if (errorMessage) {
					throwAssertionError({
						stack: ctx.assertionStack,
						message: errorMessage
					})
				}
			}
		} else fn(expected, actual, ctx)
	}

const unversionedAssertEquals: AssertFn = (expected, actual, ctx) => {
	if (expected === actual) return

	try {
		if (
			typeof expected === "object" &&
			expected !== null &&
			typeof actual === "object" &&
			actual !== null
		) {
			if (expected.constructor === actual.constructor)
				assert.deepStrictEqual(actual, expected)
			else {
				const serializedExpected = printable(expected)
				const serializedActual = printable(actual)
				throw new assert.AssertionError({
					message: `Objects did not have the same constructor:
Expected: ${serializedExpected}
Actual: ${serializedActual}`,
					expected: serializedExpected,
					actual: serializedActual
				})
			}
		} else if (
			typeof expected === "object" ||
			typeof expected === "function" ||
			typeof actual === "function" ||
			typeof actual === "function"
		) {
			const serializedExpected = printable(expected)
			const serializedActual = printable(actual)
			throw new assert.AssertionError({
				message: `Assertion including at least one function or object was not between reference eqaul items
Expected: ${serializedExpected}
Actual: ${serializedActual}`,
				expected: serializedExpected,
				actual: serializedActual
			})
			// guaranteed to be two primitives at this point
		} else assert.equal(actual, expected)
	} catch (e: any) {
		// some nonsense to get a good stack trace
		e.stack = ctx.assertionStack
		throw e
	}
}

export const assertEquals: AssertFn = versionableAssertion(
	unversionedAssertEquals
)

const unversionedAssertSatisfies = (
	t: type.Any,
	data: unknown,
	ctx: AssertionContext
) => {
	try {
		t.assert(data)
	} catch (e: any) {
		e.stack = ctx.assertionStack
		throw e
	}
}

export const assertSatisfies = versionableAssertion(
	unversionedAssertSatisfies as never
)

export const typeEqualityMapping: TypeAssertionMapping =
	new TypeAssertionMapping(data => {
		const expected = data.typeArgs[0]
		const actual = data.typeArgs[1] ?? data.args[0]
		if (!expected || !actual)
			throwInternalError(`Unexpected type data ${printable(data)}`)

		if (actual.relationships.typeArgs[0] !== "equality") {
			return {
				expected: expected.type,
				actual:
					expected.type === actual.type ?
						"(serializes to same value)"
					:	actual.type
			}
		}
		return null
	})

export const assertEqualOrMatching: AssertFn = versionableAssertion(
	(expected, actual, ctx) => {
		const assertionArgs = { actual, expected, stack: ctx.assertionStack }
		if (typeof actual !== "string") {
			throwAssertionError({
				message: `Value was of type ${typeof actual} (expected a string).`,
				...assertionArgs
			})
		} else if (typeof expected === "string") {
			if (!actual.includes(expected)) {
				throwAssertionError({
					message: `Expected string '${expected}' did not appear in actual string '${actual}'.`,
					...assertionArgs
				})
			}
		} else if (expected instanceof RegExp) {
			if (!expected.test(actual)) {
				throwAssertionError({
					message: `Actual string '${actual}' did not match regex '${expected.source}'.`,
					...assertionArgs
				})
			}
		} else {
			throw new Error(
				`Expected value for this assertion should be a string or RegExp.`
			)
		}
	}
)

export type AssertedFnCallResult = {
	returned?: unknown
	threw?: string
}
export const getThrownMessage = (
	result: AssertedFnCallResult,
	ctx: AssertionContext
): string | undefined => {
	if (!("threw" in result)) {
		throwAssertionError({
			message: "Function didn't throw",
			stack: ctx.assertionStack
		})
	}

	return result.threw
}
export const callAssertedFunction = (
	asserted: Function
): AssertedFnCallResult => {
	const result: AssertedFnCallResult = {}
	try {
		result.returned = asserted()
	} catch (error) {
		result.threw = String(error)
	}
	return result
}
