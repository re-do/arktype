import {
	ArkErrors,
	intrinsic,
	node,
	rootSchema,
	type IntersectionNode,
	type Morph,
	type Traversal
} from "@ark/schema"
import {
	flatMorph,
	numericStringMatcher,
	wellFormedIntegerMatcher,
	type Json
} from "@ark/util"
import type { To } from "../attributes.ts"
import type { Module, Submodule } from "../module.ts"
import { Scope } from "../scope.ts"
import { number } from "./number.ts"

// Non-trivial expressions should have an explanation or attribution

export const regexStringNode = (
	regex: RegExp,
	description: string
): IntersectionNode =>
	node("intersection", {
		domain: "string",
		pattern: {
			rule: regex.source,
			flags: regex.flags,
			meta: description
		}
	}) as never

const stringIntegerRoot = regexStringNode(
	wellFormedIntegerMatcher,
	"a well-formed integer string"
)

export const stringInteger: stringInteger.module = Scope.module(
	{
		root: stringIntegerRoot,
		parse: rootSchema({
			in: stringIntegerRoot,
			morphs: (s: string, ctx: Traversal) => {
				const parsed = Number.parseInt(s)
				return Number.isSafeInteger(parsed) ? parsed : (
						ctx.error(
							"an integer in the range Number.MIN_SAFE_INTEGER to Number.MAX_SAFE_INTEGER"
						)
					)
			},
			declaredOut: intrinsic.integer
		})
	},
	{
		name: "string.integer"
	}
)

export declare namespace stringInteger {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: string
		parse: (In: string) => To<number>
	}
}

const base64 = Scope.module(
	{
		root: regexStringNode(
			/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
			"base64-encoded"
		),
		url: regexStringNode(
			/^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}(?:==|%3D%3D)?|[A-Za-z0-9_-]{3}(?:=|%3D)?)?$/,
			"base64url-encoded"
		)
	},
	{
		name: "string.base64"
	}
)

declare namespace base64 {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: string
		url: string
	}
}

const preformattedCapitalize = regexStringNode(/^[A-Z].*$/, "capitalized")

export const capitalize: capitalize.module = Scope.module(
	{
		root: rootSchema({
			in: "string",
			morphs: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
			declaredOut: preformattedCapitalize
		}),
		preformatted: preformattedCapitalize
	},
	{
		name: "string.capitalize"
	}
)

export declare namespace capitalize {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: (In: string) => To<string>
		preformatted: string
	}
}

// https://github.com/validatorjs/validator.js/blob/master/src/lib/isLuhnNumber.js
export const isLuhnValid = (creditCardInput: string): boolean => {
	const sanitized = creditCardInput.replace(/[- ]+/g, "")
	let sum = 0
	let digit: string
	let tmpNum: number
	let shouldDouble = false
	for (let i = sanitized.length - 1; i >= 0; i--) {
		digit = sanitized.substring(i, i + 1)
		tmpNum = Number.parseInt(digit, 10)
		if (shouldDouble) {
			tmpNum *= 2
			if (tmpNum >= 10) sum += (tmpNum % 10) + 1
			else sum += tmpNum
		} else sum += tmpNum

		shouldDouble = !shouldDouble
	}
	return !!(sum % 10 === 0 ? sanitized : false)
}

// https://github.com/validatorjs/validator.js/blob/master/src/lib/isCreditCard.js
const creditCardMatcher: RegExp =
	/^(?:4[0-9]{12}(?:[0-9]{3,6})?|5[1-5][0-9]{14}|(222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12}|6(?:011|5[0-9][0-9])[0-9]{12,15}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11}|6[27][0-9]{14}|^(81[0-9]{14,17}))$/

export const creditCard = rootSchema({
	domain: "string",
	pattern: {
		meta: "a credit card number",
		rule: creditCardMatcher.source
	},
	predicate: {
		meta: "a credit card number",
		predicate: isLuhnValid
	}
})

type DayDelimiter = "." | "/" | "-"

const dayDelimiterMatcher = /^[./-]$/

type DayPart = DayPatterns[PartKey]

type PartKey = keyof DayPatterns

type DayPatterns = {
	y: "yy" | "yyyy"
	m: "mm" | "m"
	d: "dd" | "d"
}

type fragment<part extends DayPart, delimiter extends DayDelimiter> =
	| `${delimiter}${part}`
	| ""

export type DayPattern<delimiter extends DayDelimiter = DayDelimiter> =
	delimiter extends unknown ?
		{
			[k1 in keyof DayPatterns]: {
				[k2 in Exclude<keyof DayPatterns, k1>]: `${DayPatterns[k1]}${fragment<
					DayPatterns[k2],
					delimiter
				>}${fragment<
					DayPatterns[Exclude<keyof DayPatterns, k1 | k2>],
					delimiter
				>}`
			}[Exclude<keyof DayPatterns, k1>]
		}[keyof DayPatterns]
	:	never

export type DateFormat = "iso" | DayPattern

export type DateOptions = {
	format?: DateFormat
}

// ISO 8601 date/time modernized from https://github.com/validatorjs/validator.js/blob/master/src/lib/isISO8601.js
// Based on https://tc39.es/ecma262/#sec-date-time-string-format, the T
// delimiter for date/time is mandatory. Regex from validator.js strict matcher:
export const iso8601Matcher =
	/^([+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-3])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T]((([01]\d|2[0-3])((:?)[0-5]\d)?|24:?00)([.,]\d+(?!:))?)?(\17[0-5]\d([.,]\d+)?)?([zZ]|([+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/

type ParsedDayParts = {
	y?: string
	m?: string
	d?: string
}

const isValidDateInstance = (date: Date) => !Number.isNaN(+date)

const writeFormattedExpected = (format: DateFormat) =>
	`a ${format}-formatted date`

export const tryParseDatePattern = (
	data: string,
	opts?: DateOptions
): Date | string => {
	if (!opts?.format) {
		const result = new Date(data)
		return isValidDateInstance(result) ? result : "a valid date"
	}
	if (opts.format === "iso") {
		return iso8601Matcher.test(data) ?
				new Date(data)
			:	writeFormattedExpected("iso")
	}
	const dataParts = data.split(dayDelimiterMatcher)
	// will be the first delimiter matched, if there is one
	const delimiter: string | undefined = data[dataParts[0].length]
	const formatParts = delimiter ? opts.format.split(delimiter) : [opts.format]

	if (dataParts.length !== formatParts.length)
		return writeFormattedExpected(opts.format)

	const parsedParts: ParsedDayParts = {}
	for (let i = 0; i < formatParts.length; i++) {
		if (
			dataParts[i].length !== formatParts[i].length &&
			// if format is "m" or "d", data is allowed to be 1 or 2 characters
			!(formatParts[i].length === 1 && dataParts[i].length === 2)
		)
			return writeFormattedExpected(opts.format)

		parsedParts[formatParts[i][0] as PartKey] = dataParts[i]
	}

	const date = new Date(`${parsedParts.m}/${parsedParts.d}/${parsedParts.y}`)

	if (`${date.getDate()}` === parsedParts.d) return date

	return writeFormattedExpected(opts.format)
}

const isParsableDate = (s: string) => !Number.isNaN(new Date(s).valueOf())

const parsableDate = rootSchema({
	domain: "string",
	predicate: {
		meta: "a parsable date",
		predicate: isParsableDate
	}
}).assertHasKind("intersection")

const epochRoot = stringInteger.root.internal
	.narrow((s, ctx) => {
		// we know this is safe since it has already
		// been validated as an integer string
		const n = Number.parseInt(s)
		const out = number.epoch(n)
		if (out instanceof ArkErrors) {
			ctx.errors.merge(out)
			return false
		}
		return true
	})
	.withMeta({
		description: "an integer string representing a safe Unix timestamp"
	})
	.assertHasKind("intersection")

const epoch = Scope.module(
	{
		root: epochRoot,
		parse: rootSchema({
			in: epochRoot,
			morphs: (s: string) => new Date(s),
			declaredOut: intrinsic.Date
		})
	},
	{
		name: "string.date.epoch"
	}
)

const isoRoot = regexStringNode(
	iso8601Matcher,
	"an ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ) date"
).internal.assertHasKind("intersection")

const iso = Scope.module(
	{
		root: isoRoot,
		parse: rootSchema({
			in: isoRoot,
			morphs: (s: string) => new Date(s),
			declaredOut: intrinsic.Date
		})
	},
	{
		name: "string.date.iso"
	}
)

export const stringDate: stringDate.module = Scope.module(
	{
		root: parsableDate,
		parse: rootSchema({
			declaredIn: parsableDate,
			in: "string",
			morphs: (s: string, ctx: Traversal) => {
				const date = new Date(s)
				if (Number.isNaN(date.valueOf())) return ctx.error("a parsable date")
				return date
			},
			declaredOut: intrinsic.Date
		}),
		iso,
		epoch
	},
	{
		name: "string.date"
	}
)

export declare namespace stringDate {
	export type module = Module<stringDate.submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: string
		parse: (In: string) => To<Date>
		iso: iso.submodule
		epoch: epoch.submodule
	}

	export namespace iso {
		export type submodule = Submodule<$>

		export type $ = {
			root: string
			parse: (In: string) => To<Date>
		}
	}

	export namespace epoch {
		export type submodule = Submodule<$>

		export type $ = {
			root: string
			parse: (In: string) => To<Date>
		}
	}
}

const email = regexStringNode(
	// https://www.regular-expressions.info/email.html
	/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
	"an email address"
)

// Based on https://github.com/validatorjs/validator.js/blob/master/src/lib/isIP.js
// Adjusted to incorporate unmerged fix in https://github.com/validatorjs/validator.js/pull/2083
const ipv4Segment = "(?:[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])"
const ipv4Address = `(${ipv4Segment}[.]){3}${ipv4Segment}`
const ipv4Matcher = new RegExp(`^${ipv4Address}$`)

const ipv6Segment = "(?:[0-9a-fA-F]{1,4})"
const ipv6Matcher = new RegExp(
	"^(" +
		`(?:${ipv6Segment}:){7}(?:${ipv6Segment}|:)|` +
		`(?:${ipv6Segment}:){6}(?:${ipv4Address}|:${ipv6Segment}|:)|` +
		`(?:${ipv6Segment}:){5}(?::${ipv4Address}|(:${ipv6Segment}){1,2}|:)|` +
		`(?:${ipv6Segment}:){4}(?:(:${ipv6Segment}){0,1}:${ipv4Address}|(:${ipv6Segment}){1,3}|:)|` +
		`(?:${ipv6Segment}:){3}(?:(:${ipv6Segment}){0,2}:${ipv4Address}|(:${ipv6Segment}){1,4}|:)|` +
		`(?:${ipv6Segment}:){2}(?:(:${ipv6Segment}){0,3}:${ipv4Address}|(:${ipv6Segment}){1,5}|:)|` +
		`(?:${ipv6Segment}:){1}(?:(:${ipv6Segment}){0,4}:${ipv4Address}|(:${ipv6Segment}){1,6}|:)|` +
		`(?::((?::${ipv6Segment}){0,5}:${ipv4Address}|(?::${ipv6Segment}){1,7}|:))` +
		")(%[0-9a-zA-Z.]{1,})?$"
)

export const ip: ip.module = Scope.module(
	{
		root: ["v4 | v6", "@", "an IP address"],
		v4: regexStringNode(ipv4Matcher, "an IPv4 address"),
		v6: regexStringNode(ipv6Matcher, "an IPv6 address")
	},
	{
		name: "string.ip"
	}
)

export declare namespace ip {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: string
		v4: string
		v6: string
	}
}

const jsonStringDescription = "a JSON string"

export const writeJsonSyntaxErrorProblem = (error: unknown): string => {
	if (!(error instanceof SyntaxError)) throw error
	return `must be ${jsonStringDescription} (${error})`
}

const jsonRoot = rootSchema({
	meta: jsonStringDescription,
	domain: "string",
	predicate: {
		meta: jsonStringDescription,
		predicate: (s: string, ctx) => {
			try {
				JSON.parse(s)
				return true
			} catch (e) {
				return ctx.reject({
					code: "predicate",
					expected: jsonStringDescription,
					problem: writeJsonSyntaxErrorProblem(e)
				})
			}
		}
	}
})

const parseJson: Morph<string> = (s: string, ctx: Traversal) => {
	if (s.length === 0) {
		return ctx.error({
			code: "predicate",
			expected: jsonStringDescription,
			actual: "empty"
		})
	}
	try {
		return JSON.parse(s)
	} catch (e) {
		return ctx.error({
			code: "predicate",
			expected: jsonStringDescription,
			problem: writeJsonSyntaxErrorProblem(e)
		})
	}
}

export const json: stringJson.module = Scope.module(
	{
		root: jsonRoot,
		parse: rootSchema({
			meta: "safe JSON string parser",
			in: "string",
			morphs: parseJson,
			declaredOut: intrinsic.jsonObject
		})
	},
	{
		name: "string.json"
	}
)

export declare namespace stringJson {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: string
		parse: (In: string) => To<Json>
	}
}

const preformattedLower = regexStringNode(/^[a-z]*$/, "only lowercase letters")

const lower: lower.module = Scope.module(
	{
		root: rootSchema({
			in: "string",
			morphs: (s: string) => s.toLowerCase(),
			declaredOut: preformattedLower
		}),
		preformatted: preformattedLower
	},
	{
		name: "string.lower"
	}
)

export declare namespace lower {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: (In: string) => To<string>
		preformatted: string
	}
}

export const normalizedForms = ["NFC", "NFD", "NFKC", "NFKD"] as const

export type NormalizedForm = (typeof normalizedForms)[number]

const preformattedNodes = flatMorph(
	normalizedForms,
	(i, form) =>
		[
			form,
			rootSchema({
				domain: "string",
				predicate: (s: string) => s.normalize(form) === s,
				meta: `${form}-normalized unicode`
			})
		] as const
)

const normalizeNodes = flatMorph(
	normalizedForms,
	(i, form) =>
		[
			form,
			rootSchema({
				in: "string",
				morphs: (s: string) => s.normalize(form),
				declaredOut: preformattedNodes[form]
			})
		] as const
)

export const NFC = Scope.module(
	{
		root: normalizeNodes.NFC,
		preformatted: preformattedNodes.NFC
	},
	{
		name: "string.normalize.NFC"
	}
)

export const NFD = Scope.module(
	{
		root: normalizeNodes.NFD,
		preformatted: preformattedNodes.NFD
	},
	{
		name: "string.normalize.NFD"
	}
)

export const NFKC = Scope.module(
	{
		root: normalizeNodes.NFKC,
		preformatted: preformattedNodes.NFKC
	},
	{
		name: "string.normalize.NFKC"
	}
)

export const NFKD = Scope.module(
	{
		root: normalizeNodes.NFKD,
		preformatted: preformattedNodes.NFKD
	},
	{
		name: "string.normalize.NFKD"
	}
)

export const normalize = Scope.module(
	{
		root: "NFC",
		NFC,
		NFD,
		NFKC,
		NFKD
	},
	{
		name: "string.normalize"
	}
)

export declare namespace normalize {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: (In: string) => To<string>
		NFC: NFC.submodule
		NFD: NFD.submodule
		NFKC: NFKC.submodule
		NFKD: NFKD.submodule
	}

	export namespace NFC {
		export type submodule = Submodule<$>

		export type $ = {
			root: (In: string) => To<string>
			preformatted: string
		}
	}

	export namespace NFD {
		export type submodule = Submodule<$>

		export type $ = {
			root: (In: string) => To<string>
			preformatted: string
		}
	}

	export namespace NFKC {
		export type submodule = Submodule<$>

		export type $ = {
			root: (In: string) => To<string>
			preformatted: string
		}
	}

	export namespace NFKD {
		export type submodule = Submodule<$>

		export type $ = {
			root: (In: string) => To<string>
			preformatted: string
		}
	}
}

const numericRoot = regexStringNode(
	numericStringMatcher,
	"a well-formed numeric string"
)

export const numeric: stringNumeric.module = Scope.module(
	{
		root: numericRoot,
		parse: rootSchema({
			in: numericRoot,
			morphs: (s: string) => Number.parseFloat(s),
			declaredOut: intrinsic.number
		})
	},
	{
		name: "string.numeric"
	}
)

export declare namespace stringNumeric {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: string
		parse: (In: string) => To<number>
	}
}

// https://semver.org/
const semverMatcher =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

const semver = regexStringNode(
	semverMatcher,
	"a semantic version (see https://semver.org/)"
)

const preformattedTrim = regexStringNode(
	// no leading or trailing whitespace
	/^\S.*\S$|^\S?$/,
	"trimmed"
)

const trim: trim.module = Scope.module(
	{
		root: rootSchema({
			in: "string",
			morphs: (s: string) => s.trim(),
			declaredOut: preformattedTrim
		}),
		preformatted: preformattedTrim
	},
	{
		name: "string.trim"
	}
)

export declare namespace trim {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: (In: string) => To<string>
		preformatted: string
	}
}

const preformattedUpper = regexStringNode(/^[A-Z]*$/, "only uppercase letters")

const upper: upper.module = Scope.module(
	{
		root: rootSchema({
			in: "string",
			morphs: (s: string) => s.toUpperCase(),
			declaredOut: preformattedUpper
		}),
		preformatted: preformattedUpper
	},
	{
		name: "string.upper"
	}
)

declare namespace upper {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: (In: string) => To<string>
		preformatted: string
	}
}

const isParsableUrl = (s: string) => {
	if (URL.canParse as unknown) return URL.canParse(s)
	// Can be removed once Node 18 is EOL
	try {
		new URL(s)
		return true
	} catch {
		return false
	}
}

const urlRoot = rootSchema({
	domain: "string",
	predicate: {
		meta: "a URL string",
		predicate: isParsableUrl
	}
})

export const url: url.module = Scope.module(
	{
		root: urlRoot,
		parse: rootSchema({
			declaredIn: urlRoot,
			in: "string",
			morphs: (s: string, ctx: Traversal) => {
				try {
					return new URL(s)
				} catch {
					return ctx.error("a URL string")
				}
			},
			declaredOut: rootSchema(URL)
		})
	},
	{
		name: "string.url"
	}
)

export declare namespace url {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: string
		parse: (In: string) => To<URL>
	}
}

// Based on https://github.com/validatorjs/validator.js/blob/master/src/lib/isUUID.js
export const uuid = Scope.module(
	{
		// the meta tuple expression ensures the error message does not delegate
		// to the individual branches, which are too detailed
		root: ["versioned | nil | max", "@", "a UUID"],
		"#nil": "'00000000-0000-0000-0000-000000000000'",
		"#max": "'ffffffff-ffff-ffff-ffff-ffffffffffff'",
		"#versioned":
			/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
		v1: regexStringNode(
			/^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			"a UUIDv1"
		),
		v2: regexStringNode(
			/^[0-9a-f]{8}-[0-9a-f]{4}-2[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			"a UUIDv2"
		),
		v3: regexStringNode(
			/^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			"a UUIDv3"
		),
		v4: regexStringNode(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			"a UUIDv4"
		),
		v5: regexStringNode(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			"a UUIDv5"
		),
		v6: regexStringNode(
			/^[0-9a-f]{8}-[0-9a-f]{4}-6[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			"a UUIDv6"
		),
		v7: regexStringNode(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			"a UUIDv7"
		),
		v8: regexStringNode(
			/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			"a UUIDv8"
		)
	},
	{
		name: "string.uuid"
	}
)

export declare namespace uuid {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: string
		v1: string
		v2: string
		v3: string
		v4: string
		v5: string
		v6: string
		v7: string
		v8: string
	}

	export namespace $ {
		export type flat = {}
	}
}

export const string = Scope.module(
	{
		root: intrinsic.string,
		alpha: regexStringNode(/^[A-Za-z]*$/, "only letters"),
		alphanumeric: regexStringNode(
			/^[A-Za-z\d]*$/,
			"only letters and digits 0-9"
		),
		base64,
		capitalize,
		creditCard,
		date: stringDate,
		digits: regexStringNode(/^\d*$/, "only digits 0-9"),
		email,
		integer: stringInteger,
		ip,
		json,
		lower,
		normalize,
		numeric,
		semver,
		trim,
		upper,
		url,
		uuid
	},
	{
		name: "string"
	}
)

export declare namespace string {
	export type module = Module<string.submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: string
		alpha: string
		alphanumeric: string
		base64: base64.submodule
		capitalize: capitalize.submodule
		creditCard: string
		date: stringDate.submodule
		digits: string
		email: string
		integer: stringInteger.submodule
		ip: ip.submodule
		json: stringJson.submodule
		lower: lower.submodule
		normalize: normalize.submodule
		numeric: stringNumeric.submodule
		semver: string
		trim: trim.submodule
		upper: upper.submodule
		url: url.submodule
		uuid: uuid.submodule
	}
}
