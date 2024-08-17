import type { Module, Submodule } from "../module.js"
import { scope } from "../scope.js"

const submodule: Module<arkTypedArray.submodule> = scope(
	{
		Int8: ["instanceof", Int8Array],
		Uint8: ["instanceof", Uint8Array],
		Uint8Clamped: ["instanceof", Uint8ClampedArray],
		Int16: ["instanceof", Int16Array],
		Uint16: ["instanceof", Uint16Array],
		Int32: ["instanceof", Int32Array],
		Uint32: ["instanceof", Uint32Array],
		Float32: ["instanceof", Float32Array],
		Float64: ["instanceof", Float64Array],
		BigInt64: ["instanceof", BigInt64Array],
		BigUint64: ["instanceof", BigUint64Array]
	},
	{ prereducedAliases: true }
).export()

export const arkTypedArray = {
	submodule
}

export declare namespace arkTypedArray {
	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray
	export type submodule = Submodule<{
		Int8: Int8Array
		Uint8: Uint8Array
		Uint8Clamped: Uint8ClampedArray
		Int16: Int16Array
		Uint16: Uint16Array
		Int32: Int32Array
		Uint32: Uint32Array
		Float32: Float32Array
		Float64: Float64Array
		BigInt64: BigInt64Array
		BigUint64: BigUint64Array
	}>
}
