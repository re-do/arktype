import type { PartialRecord, TypeGuard } from "@ark/util"
import type { mutableNormalizedRootOfKind, nodeOfKind } from "../kinds.ts"
import type { BaseNode } from "../node.ts"
import type { Morph } from "../roots/morph.ts"
import type { BaseRoot } from "../roots/root.ts"
import type { Union } from "../roots/union.ts"
import type { BaseScope } from "../scope.ts"
import type { BaseMeta } from "./declare.ts"
import { Disjoint } from "./disjoint.ts"
import {
	rootKinds,
	type IntersectionContext,
	type RootKind,
	type UnknownIntersectionResult
} from "./implement.ts"
import { isNode } from "./utils.ts"

const intersectionCache: PartialRecord<string, UnknownIntersectionResult> = {}

type InternalNodeIntersection<ctx> = <l extends BaseNode, r extends BaseNode>(
	l: l,
	r: r,
	ctx: ctx
) => l["kind"] | r["kind"] extends RootKind ? BaseRoot | Disjoint
:	BaseNode | Disjoint | null

export const intersectNodesRoot: InternalNodeIntersection<BaseScope> = (
	l,
	r,
	$
) =>
	intersectOrPipeNodes(l, r, {
		$,
		invert: false,
		pipe: false
	})

export const pipeNodesRoot: InternalNodeIntersection<BaseScope> = (l, r, $) =>
	intersectOrPipeNodes(l, r, {
		$,
		invert: false,
		pipe: true
	})

export const intersectOrPipeNodes: InternalNodeIntersection<IntersectionContext> =
	((
		l: BaseNode,
		r: BaseNode,
		ctx: IntersectionContext
	): BaseNode | Disjoint | null => {
		const operator = ctx.pipe ? "|>" : "&"
		const lrCacheKey = `${l.hash}${operator}${r.hash}`
		if (intersectionCache[lrCacheKey] !== undefined)
			return intersectionCache[lrCacheKey]! as never

		if (!ctx.pipe) {
			// we can only use this for the commutative & operator
			const rlCacheKey = `${r.hash}${operator}${l.hash}`
			if (intersectionCache[rlCacheKey] !== undefined) {
				// if the cached result was a Disjoint and the operands originally
				// appeared in the opposite order, we need to invert it to match
				const rlResult = intersectionCache[rlCacheKey]!
				const lrResult =
					rlResult instanceof Disjoint ? rlResult.invert() : rlResult
				// add the lr result to the cache directly to bypass this check in the future
				intersectionCache[lrCacheKey] = lrResult
				return lrResult
			}
		}

		const isPureIntersection =
			!ctx.pipe || (!l.includesTransform && !r.includesTransform)

		if (isPureIntersection && l.equals(r)) return l

		let result =
			isPureIntersection ? _intersectNodes(l, r, ctx)
			: l.hasKindIn(...rootKinds) ?
				// if l is a RootNode, r will be as well
				_pipeNodes(l, r as never, ctx)
			:	_intersectNodes(l, r, ctx)

		if (isNode(result)) {
			// if the result equals one of the operands, preserve its metadata by
			// returning the original reference
			if (l.equals(result)) result = l
			else if (r.equals(result)) result = r
		}

		intersectionCache[lrCacheKey] = result
		return result as never
	}) as never

const _intersectNodes = (
	l: BaseNode,
	r: BaseNode,
	ctx: IntersectionContext
) => {
	const leftmostKind = l.precedence < r.precedence ? l.kind : r.kind
	const implementation =
		l.impl.intersections[r.kind] ?? r.impl.intersections[l.kind]
	if (implementation === undefined) {
		// should be two ConstraintNodes that have no relation
		// this could also happen if a user directly intersects a Type and a ConstraintNode,
		// but that is not allowed by the external function signature
		return null
	} else if (leftmostKind === l.kind) return implementation(l, r, ctx)
	else {
		let result = implementation(r, l, { ...ctx, invert: !ctx.invert })
		if (result instanceof Disjoint) result = result.invert()
		return result
	}
}

const _pipeNodes = (
	l: nodeOfKind<RootKind>,
	r: nodeOfKind<RootKind>,
	ctx: IntersectionContext
) =>
	l.includesTransform || r.includesTransform ?
		ctx.invert ?
			pipeMorphed(r, l, ctx)
		:	pipeMorphed(l, r, ctx)
	:	_intersectNodes(l, r, ctx)

const pipeMorphed = (
	from: nodeOfKind<RootKind>,
	to: nodeOfKind<RootKind>,
	ctx: IntersectionContext
) =>
	from.distribute(
		fromBranch => _pipeMorphed(fromBranch, to, ctx),
		results => {
			const viableBranches = results.filter(
				isNode as TypeGuard<unknown, Morph.Node>
			)

			if (viableBranches.length === 0)
				return Disjoint.init("union", from.branches, to.branches)

			// if the input type has changed, create a new node without preserving metadata
			if (
				viableBranches.length < from.branches.length ||
				!from.branches.every((branch, i) =>
					branch.in.equals(viableBranches[i].in)
				)
			)
				return ctx.$.parseSchema(viableBranches)

			// otherwise, the input has not changed so preserve metadata

			let meta: BaseMeta | undefined

			if (viableBranches.length === 1) {
				const onlyBranch = viableBranches[0]
				if (!meta) return onlyBranch
				return ctx.$.node("morph", {
					...onlyBranch.inner,
					in: onlyBranch.in.withMeta(meta)
				})
			}

			const schema: mutableNormalizedRootOfKind<"union"> = {
				branches: viableBranches
			}

			if (meta) schema.meta = meta

			return ctx.$.parseSchema(schema)
		}
	)

const _pipeMorphed = (
	from: Union.ChildNode,
	to: nodeOfKind<RootKind>,
	ctx: IntersectionContext
): Morph.Node | Disjoint => {
	const fromIsMorph = from.hasKind("morph")

	if (fromIsMorph) {
		const morphs = [...from.morphs]
		if (from.lastMorphIfNode) {
			// still piped from context, so allows appending additional morphs
			const outIntersection = intersectOrPipeNodes(
				from.lastMorphIfNode,
				to,
				ctx
			)
			if (outIntersection instanceof Disjoint) return outIntersection
			morphs[morphs.length - 1] = outIntersection
		} else morphs.push(to)

		return ctx.$.node("morph", {
			morphs,
			in: from.inner.in as any
		})
	}

	if (to.hasKind("morph")) {
		const inTersection = intersectOrPipeNodes(from, to.in, ctx)
		if (inTersection instanceof Disjoint) return inTersection

		return ctx.$.node("morph", {
			morphs: [to],
			in: inTersection
		})
	}

	return ctx.$.node("morph", {
		morphs: [to],
		in: from
	})
}
