import type { GuardablePredicate } from "./functions.ts"
import type { anyOrNever, conform } from "./generics.ts"
import type { isDisjoint } from "./intersections.ts"
import type { parseNonNegativeInteger } from "./numbers.ts"

type DuplicateData<val = unknown> = { element: val; indices: number[] }

/**
 * Extracts duplicated elements and their indices from an array, returning them.
 *
 * @param arr The array to extract duplicate elements from.
 */ export const getDuplicatesOf = <const arr extends array>(
	arr: arr,
	opts?: ComparisonOptions<arr[number]>
): DuplicateData<arr[number]>[] => {
	const isEqual = opts?.isEqual ?? ((l, r) => l === r)

	const seenElements: Set<arr[number]> = new Set()
	const duplicates: DuplicateData<arr[number]>[] = []

	arr.forEach((element, indx) => {
		if (seenElements.has(element)) {
			const duplicatesEntryIndx = duplicates.findIndex((l, r) =>
				isEqual(l.element, r)
			)
			if (duplicatesEntryIndx === -1)
				duplicates.push({ element, indices: [indx] })
			else duplicates[duplicatesEntryIndx].indices.push(indx)
		} else seenElements.add(element)
	})
	return duplicates
}

export type pathToString<
	segments extends string[],
	delimiter extends string = "/"
> = segments extends [] ? "/" : join<segments, delimiter>

export const join = <segments extends array<string>, delimiter extends string>(
	segments: segments,
	delimiter: delimiter
): join<segments, delimiter> => segments.join(delimiter) as never

export type join<
	segments extends array<string>,
	delimiter extends string,
	result extends string = ""
> =
	segments extends (
		readonly [infer head extends string, ...infer tail extends string[]]
	) ?
		join<
			tail,
			delimiter,
			result extends "" ? head : `${result}${delimiter}${head}`
		>
	:	result

export const getPath = (root: unknown, path: string[]): unknown => {
	let result: any = root
	for (const segment of path) {
		if (typeof result !== "object" || result === null) return undefined

		result = result[segment]
	}
	return result
}

export const intersectUniqueLists = <item>(
	l: readonly item[],
	r: readonly item[]
): item[] => {
	const intersection = [...l]
	for (const item of r) if (!l.includes(item)) intersection.push(item)

	return intersection
}

export type filter<t extends array, constraint, result extends unknown[] = []> =
	t extends readonly [infer head, ...infer tail] ?
		filter<
			tail,
			constraint,
			head extends constraint ? [...result, head] : result
		>
	:	result

export type array<t = unknown> = readonly t[]

export type listable<t> = t | readonly t[]

export type flattenListable<t> = t extends array<infer element> ? element : t

export type NonEmptyList<t = unknown> = readonly [t, ...t[]]

export type repeat<t extends array, count extends number> = _repeat<
	t,
	[],
	count,
	[]
>

type _repeat<
	base extends array,
	result extends array,
	maxDepth extends number,
	depth extends 1[]
> =
	depth["length"] extends maxDepth ? result
	:	_repeat<base, [...result, ...base], maxDepth, [...depth, 1]>

export type CollapsingList<t = unknown> =
	| readonly []
	| t
	| readonly [t, t, ...t[]]

export type headOf<t extends array> = t[0]

export type tailOf<t extends array> =
	t extends readonly [unknown, ...infer tail] ? tail : never

export type lastIndexOf<t extends array> = tailOf<t>["length"]

export type lastOf<t extends array> = t[lastIndexOf<t>]

export type initOf<t extends array> =
	t extends readonly [...infer init, unknown] ? init : never

export type numericStringKeyOf<t extends array> = Extract<keyof t, `${number}`>

export type arrayIndexOf<a extends array> =
	keyof a extends infer k ? parseNonNegativeInteger<k & string> : never

export type liftArray<t> =
	t extends array ?
		[t] extends [anyOrNever] ?
			t[]
		:	t
	:	t[]

export const liftArray = <t>(data: t): liftArray<t> =>
	(Array.isArray(data) ? data : [data]) as never

/**
 * Splits an array into two arrays based on the result of a predicate
 *
 * @param predicate - The guard function used to determine which items to include.
 * @returns A tuple containing two arrays:
 * 				- the first includes items for which `predicate` returns true
 * 				- the second includes items for which `predicate` returns false
 *
 * @example
 * const list = [1, "2", "3", 4, 5];
 * const [numbers, strings] = spliterate(list, (x) => typeof x === "number");
 * // Type: number[]
 * // Output: [1, 4, 5]
 * console.log(evens);
 * // Type: string[]
 * // Output: ["2", "3"]
 * console.log(odds);
 */
export const spliterate = <item, included extends item>(
	arr: readonly item[],
	predicate: GuardablePredicate<item, included>
): [
	included: included[],
	excluded: [item] extends [included] ? item[] : Exclude<item, included>[]
] => {
	const result: [unknown[], unknown[]] = [[], []]
	for (const item of arr) {
		if (predicate(item)) result[0].push(item)
		else result[1].push(item)
	}
	return result as never
}

export const ReadonlyArray = Array as unknown as new <T>(
	...args: ConstructorParameters<typeof Array<T>>
) => ReadonlyArray<T>

export const includes = <a extends array>(
	array: a,
	element: unknown
): element is a[number] => array.includes(element)

export const range = (length: number, offset = 0): number[] =>
	[...new Array(length)].map((_, i) => i + offset)

export type AppendOptions = {
	/** If true, adds the element to the beginning of the array instead of the end */
	prepend?: boolean
}

/**
 * Adds a value or array to an array, returning the concatenated result
 */
export const append = <
	to extends unknown[] | undefined,
	value extends appendableValue<to>
>(
	to: to,
	value: value,
	opts?: AppendOptions
): to & {} => {
	if (to === undefined) {
		return (
			value === undefined ? []
			: Array.isArray(value) ? value
			: [value]) as never
	}

	if (opts?.prepend) {
		if (Array.isArray(value)) to.unshift(...value)
		else to.unshift(value as never)
	} else {
		if (Array.isArray(value)) to.push(...value)
		else to.push(value as never)
	}

	return to as never
}

// ensure a nested array element is not treated as a list to append
export type appendableValue<to extends array | undefined> =
	to extends array<infer element> ?
		element extends array ?
			array<element>
		:	listable<element>
	:	never

/**
 * Concatenates an element or list with a readonly list
 */
export const conflatenate = <element>(
	to: readonly element[] | undefined | null,
	elementOrList: appendableValue<readonly element[]> | undefined | null
): readonly element[] => {
	if (elementOrList === undefined || elementOrList === null)
		return to ?? ([] as never)

	if (to === undefined || to === null) return liftArray(elementOrList) as never

	return to.concat(elementOrList) as never
}

/**
 * Concatenates a variadic list of elements or lists with a readonly list
 */
export const conflatenateAll = <element>(
	...elementsOrLists: (listable<element> | undefined | null)[]
): readonly element[] =>
	elementsOrLists.reduce<readonly element[]>(conflatenate as never, [])

export interface ComparisonOptions<t = unknown> {
	isEqual?: (l: t, r: t) => boolean
}

/**
 * Appends a value or concatenates an array to an array if it is not already included, returning the array
 */
export const appendUnique = <to extends unknown[]>(
	to: to | undefined,
	value: NoInfer<Readonly<to> | to[number]>,
	opts?: ComparisonOptions<to[number]>
): to => {
	if (to === undefined)
		return Array.isArray(value) ? (value as never) : ([value] as never)

	const isEqual = opts?.isEqual ?? ((l, r) => l === r)
	liftArray(value).forEach(v => {
		if (!to.some(existing => isEqual(existing as never, v as never))) to.push(v)
	})

	return to
}

export type groupableKeyOf<o> =
	keyof o extends infer k ?
		k extends keyof o ?
			o[k] extends PropertyKey ?
				k
			:	never
		:	never
	:	never

export type groupBy<element, discriminant extends groupableKeyOf<element>> = {
	[k in element[discriminant] & PropertyKey]?: (element extends unknown ?
		isDisjoint<element[discriminant], k> extends true ?
			never
		:	element
	:	never)[]
} & unknown

export const groupBy = <element, discriminant extends groupableKeyOf<element>>(
	array: readonly element[],
	discriminant: discriminant
): groupBy<element, discriminant> =>
	array.reduce<Record<PropertyKey, any>>((result, item) => {
		const key = item[discriminant] as never
		result[key] = append(result[key], item)
		return result
	}, {}) as never

export const arrayEquals = <element>(
	l: array<element>,
	r: array<element>,
	opts?: ComparisonOptions<element>
): boolean =>
	l.length === r.length &&
	l.every(
		opts?.isEqual ?
			(lItem, i) => opts.isEqual!(lItem, r[i])
		:	(lItem, i) => lItem === r[i]
	)

export type validateExhaustiveKeys<
	keys extends readonly PropertyKey[],
	expectedKey extends PropertyKey
> =
	keys extends readonly [infer head, ...infer tail extends PropertyKey[]] ?
		readonly [
			conform<head, expectedKey>,
			...validateExhaustiveKeys<tail, Exclude<expectedKey, head>>
		]
	: [expectedKey] extends [never] ? []
	: [expectedKey]
