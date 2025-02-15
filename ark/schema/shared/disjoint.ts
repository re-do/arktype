import { isArray, stringifyPath, throwParseError, type Key } from "@ark/util"
import type { nodeOfKind } from "../kinds.ts"
import type { BaseNode } from "../node.ts"
import type { Domain } from "../roots/domain.ts"
import type { BaseRoot } from "../roots/root.ts"
import type { Prop } from "../structure/prop.ts"
import type { BoundKind } from "./implement.ts"
import { $ark } from "./registry.ts"
import { isNode } from "./utils.ts"

export interface DisjointEntry<kind extends DisjointKind = DisjointKind> {
	kind: kind
	l: OperandsByDisjointKind[kind]
	r: OperandsByDisjointKind[kind]
	path: Key[]
	optional: boolean
}

type OperandsByDisjointKind = {
	domain: nodeOfKind<"domain"> | Domain.Enumerable
	unit: nodeOfKind<"unit">
	proto: nodeOfKind<"proto">
	presence: BaseRoot
	range: nodeOfKind<BoundKind>
	assignability: BaseNode
	union: readonly BaseRoot[]
}

export type DisjointEntryContext = {
	path?: Key[]
	optional?: true
}

export class Disjoint extends Array<DisjointEntry> {
	static init<kind extends DisjointKind>(
		kind: kind,
		l: OperandsByDisjointKind[kind],
		r: OperandsByDisjointKind[kind],
		ctx?: DisjointEntryContext
	): Disjoint {
		return new Disjoint({
			kind,
			l,
			r,
			path: ctx?.path ?? [],
			optional: ctx?.optional ?? false
		})
	}

	add<kind extends DisjointKind>(
		kind: kind,
		l: OperandsByDisjointKind[kind],
		r: OperandsByDisjointKind[kind],
		ctx?: DisjointEntryContext
	): Disjoint {
		this.push({
			kind,
			l,
			r,
			path: ctx?.path ?? [],
			optional: ctx?.optional ?? false
		})
		return this
	}

	get summary(): string {
		return this.describeReasons()
	}

	describeReasons(): string {
		if (this.length === 1) {
			const { path, l, r } = this[0]
			const pathString = stringifyPath(path)
			return writeUnsatisfiableExpressionError(
				`Intersection${
					pathString && ` at ${pathString}`
				} of ${describeReasons(l, r)}`
			)
		}
		return `The following intersections result in unsatisfiable types:\n• ${this.map(
			({ path, l, r }) => `${path}: ${describeReasons(l, r)}`
		).join("\n• ")}`
	}

	throw(): never {
		return throwParseError(this.describeReasons())
	}

	invert(): Disjoint {
		return this.map(entry => ({
			...entry,
			l: entry.r,
			r: entry.l
		})) as Disjoint
	}

	withPrefixKey(key: PropertyKey, kind: Prop.Kind): Disjoint {
		return this.map(entry => ({
			...entry,
			path: [key, ...entry.path],
			optional: entry.optional || kind === "optional"
		})) as Disjoint
	}

	toNeverIfDisjoint(): BaseRoot {
		return $ark.intrinsic.never as never
	}
}

export type DisjointKind = keyof OperandsByDisjointKind

const describeReasons = (l: unknown, r: unknown): string =>
	`${describeReason(l)} and ${describeReason(r)}`

const describeReason = (value: unknown): string =>
	isNode(value) ? value.expression
	: isArray(value) ? value.map(describeReason).join(" | ") || "never"
	: String(value)

export const writeUnsatisfiableExpressionError = <expression extends string>(
	expression: expression
): writeUnsatisfiableExpressionError<expression> =>
	`${expression} results in an unsatisfiable type`

export type writeUnsatisfiableExpressionError<expression extends string> =
	`${expression} results in an unsatisfiable type`
