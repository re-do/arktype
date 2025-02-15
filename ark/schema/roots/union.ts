import {
	appendUnique,
	arrayEquals,
	domainDescriptions,
	flatMorph,
	groupBy,
	isArray,
	jsTypeOfDescriptions,
	printable,
	range,
	throwParseError,
	unset,
	type JsTypeOf,
	type JsonStructure,
	type SerializedPrimitive,
	type array,
	type show
} from "@ark/util"
import type { NodeSchema, RootSchema, nodeOfKind } from "../kinds.ts"
import type { BaseNode } from "../node.ts"
import type { BaseScope } from "../scope.ts"
import {
	compileLiteralPropAccess,
	compileSerializedValue,
	type NodeCompiler
} from "../shared/compile.ts"
import type {
	BaseErrorContext,
	BaseNormalizedSchema,
	declareNode
} from "../shared/declare.ts"
import { Disjoint } from "../shared/disjoint.ts"
import type { ArkError } from "../shared/errors.ts"
import {
	implementNode,
	type IntersectionContext,
	type RootKind,
	type UnionChildKind,
	type nodeImplementationOf
} from "../shared/implement.ts"
import {
	intersectNodesRoot,
	intersectOrPipeNodes
} from "../shared/intersections.ts"
import type { JsonSchema } from "../shared/jsonSchema.ts"
import {
	$ark,
	registeredReference,
	type RegisteredReference
} from "../shared/registry.ts"
import {
	Traversal,
	type TraverseAllows,
	type TraverseApply
} from "../shared/traversal.ts"
import { hasArkKind } from "../shared/utils.ts"
import type { Domain } from "./domain.ts"
import type { Morph } from "./morph.ts"
import { BaseRoot } from "./root.ts"
import type { Unit } from "./unit.ts"
import { defineRightwardIntersections } from "./utils.ts"

export declare namespace Union {
	export type ChildKind = UnionChildKind

	export type ChildSchema = NodeSchema<ChildKind>

	export type ChildNode = nodeOfKind<ChildKind>

	export type Schema = NormalizedSchema | readonly RootSchema[]

	export interface NormalizedSchema extends BaseNormalizedSchema {
		readonly branches: array<RootSchema>
		readonly ordered?: true
	}

	export interface Inner {
		readonly branches: readonly ChildNode[]
		readonly ordered?: true
	}

	export interface ErrorContext extends BaseErrorContext<"union"> {
		errors: readonly ArkError[]
	}

	export interface Declaration
		extends declareNode<{
			kind: "union"
			schema: Schema
			normalizedSchema: NormalizedSchema
			inner: Inner
			errorContext: ErrorContext
			reducibleTo: RootKind
			childKind: UnionChildKind
		}> {}

	export type Node = UnionNode
}

const implementation: nodeImplementationOf<Union.Declaration> =
	implementNode<Union.Declaration>({
		kind: "union",
		hasAssociatedError: true,
		collapsibleKey: "branches",
		keys: {
			ordered: {},
			branches: {
				child: true,
				parse: (schema, ctx) => {
					const branches: Union.ChildNode[] = []
					schema.forEach(branchSchema => {
						const branchNodes =
							hasArkKind(branchSchema, "root") ?
								branchSchema.branches
							:	ctx.$.parseSchema(branchSchema).branches
						branchNodes.forEach(node => {
							if (node.hasKind("morph")) {
								const matchingMorphIndex = branches.findIndex(
									matching =>
										matching.hasKind("morph") && matching.hasEqualMorphs(node)
								)
								if (matchingMorphIndex === -1) branches.push(node)
								else {
									const matchingMorph = branches[
										matchingMorphIndex
									] as Morph.Node
									branches[matchingMorphIndex] = ctx.$.node("morph", {
										...matchingMorph.inner,
										in: matchingMorph.in.rawOr(node.in)
									})
								}
							} else branches.push(node)
						})
					})

					if (!ctx.def.ordered)
						branches.sort((l, r) => (l.hash < r.hash ? -1 : 1))

					return branches
				}
			}
		},
		normalize: schema => (isArray(schema) ? { branches: schema } : schema),
		reduce: (inner, $) => {
			const reducedBranches = reduceBranches(inner)
			if (reducedBranches.length === 1) return reducedBranches[0]

			if (reducedBranches.length === inner.branches.length) return

			return $.node(
				"union",
				{
					...inner,
					branches: reducedBranches
				},
				{ prereduced: true }
			)
		},
		defaults: {
			description: node =>
				node.distribute(branch => branch.description, describeBranches),
			expected: ctx => {
				const byPath = groupBy(ctx.errors, "propString") as Record<
					string,
					ArkError[]
				>
				const pathDescriptions = Object.entries(byPath).map(
					([path, errors]) => {
						const branchesAtPath: string[] = []
						errors.forEach(errorAtPath =>
							// avoid duplicate messages when multiple branches
							// are invalid due to the same error
							appendUnique(branchesAtPath, errorAtPath.expected)
						)
						const expected = describeBranches(branchesAtPath)
						// if there are multiple actual descriptions that differ,
						// just fall back to printable, which is the most specific
						const actual =
							errors.every(e => e.actual === errors[0].actual) ?
								errors[0].actual
							:	printable(errors[0].data)
						return `${path && `${path} `}must be ${expected}${
							actual && ` (was ${actual})`
						}`
					}
				)
				return describeBranches(pathDescriptions)
			},
			problem: ctx => ctx.expected,
			message: ctx => ctx.problem
		},
		intersections: {
			union: (l, r, ctx) => {
				if (l.isNever !== r.isNever) {
					// if exactly one operand is never, we can use it to discriminate based on presence
					return Disjoint.init("presence", l, r)
				}
				let resultBranches: readonly Union.ChildNode[] | Disjoint
				if (l.ordered) {
					if (r.ordered) {
						throwParseError(
							writeOrderedIntersectionMessage(l.expression, r.expression)
						)
					}

					resultBranches = intersectBranches(r.branches, l.branches, ctx)
					if (resultBranches instanceof Disjoint) resultBranches.invert()
				} else resultBranches = intersectBranches(l.branches, r.branches, ctx)

				if (resultBranches instanceof Disjoint) return resultBranches

				return ctx.$.parseSchema(
					l.ordered || r.ordered ?
						{
							branches: resultBranches,
							ordered: true as const
						}
					:	{ branches: resultBranches }
				)
			},
			...defineRightwardIntersections("union", (l, r, ctx) => {
				const branches = intersectBranches(l.branches, [r], ctx)
				if (branches instanceof Disjoint) return branches

				if (branches.length === 1) return branches[0]

				return ctx.$.parseSchema(
					l.ordered ? { branches, ordered: true } : { branches }
				)
			})
		}
	})

export class UnionNode extends BaseRoot<Union.Declaration> {
	isBoolean: boolean =
		this.branches.length === 2 &&
		this.branches[0].hasUnit(false) &&
		this.branches[1].hasUnit(true)

	get branchGroups(): BaseRoot[] {
		const branchGroups: BaseRoot[] = []
		let firstBooleanIndex = -1
		this.branches.forEach(branch => {
			if (branch.hasKind("unit") && branch.domain === "boolean") {
				if (firstBooleanIndex === -1) {
					firstBooleanIndex = branchGroups.length
					branchGroups.push(branch)
				} else branchGroups[firstBooleanIndex] = $ark.intrinsic.boolean
				return
			}
			branchGroups.push(branch)
		})

		return branchGroups as never
	}

	unitBranches = this.branches.filter((n): n is Unit.Node | Morph.Node =>
		n.in.hasKind("unit")
	)

	discriminant = this.discriminate()
	discriminantJson =
		this.discriminant ? discriminantToJson(this.discriminant) : null

	expression: string = this.distribute(
		n => n.nestableExpression,
		expressBranches
	)

	createBranchedOptimisticRootApply(): BaseNode["rootApply"] {
		return (data, onFail) => {
			const optimisticResult = this.traverseOptimistic(data)
			if (optimisticResult !== unset) return optimisticResult

			const ctx = new Traversal(data, this.$.resolvedConfig)
			this.traverseApply(data, ctx)
			return ctx.finalize(onFail)
		}
	}

	get shallowMorphs(): array<Morph> {
		return this.branches.reduce(
			(morphs, branch) => appendUnique(morphs, branch.shallowMorphs),
			[] as Morph[]
		)
	}

	get shortDescription(): string {
		return this.distribute(branch => branch.shortDescription, describeBranches)
	}

	protected innerToJsonSchema(): JsonSchema {
		return {
			anyOf: this.branchGroups.map(group =>
				// special case to simplify { const: true } | { const: false }
				// to the canonical JSON Schema representation { type: "boolean" }
				group.equals($ark.intrinsic.boolean) ?
					{ type: "boolean" }
				:	group.toJsonSchema()
			)
		}
	}

	traverseAllows: TraverseAllows = (data, ctx) =>
		this.branches.some(b => b.traverseAllows(data, ctx))

	traverseApply: TraverseApply = (data, ctx) => {
		const errors: ArkError[] = []
		for (let i = 0; i < this.branches.length; i++) {
			ctx.pushBranch()
			this.branches[i].traverseApply(data, ctx)
			if (!ctx.hasError()) {
				if (this.branches[i].includesTransform)
					return ctx.queuedMorphs.push(...ctx.popBranch()!.queuedMorphs)
				return ctx.popBranch()
			}
			errors.push(ctx.popBranch()!.error!)
		}
		ctx.errorFromNodeContext({ code: "union", errors, meta: this.meta })
	}

	traverseOptimistic = (data: unknown): unknown => {
		for (let i = 0; i < this.branches.length; i++) {
			const branch = this.branches[i]
			if ((branch.traverseAllows as any)(data)) {
				if (branch.contextFreeMorph) return branch.contextFreeMorph(data)
				// if we're calling this function and the matching branch didn't have
				// a context-free morph, it shouldn't have morphs at all
				return data
			}
		}
		return unset
	}

	compile(js: NodeCompiler): void {
		if (
			!this.discriminant ||
			// if we have a union of two units like `boolean`, the
			// undiscriminated compilation will be just as fast
			(this.unitBranches.length === this.branches.length &&
				this.branches.length === 2)
		)
			return this.compileIndiscriminable(js)

		// we need to access the path as optional so we don't throw if it isn't present
		let condition = this.discriminant.optionallyChainedPropString

		if (this.discriminant.kind === "domain")
			condition = `typeof ${condition} === "object" ? ${condition} === null ? "null" : "object" : typeof ${condition} === "function" ? "object" : typeof ${condition}`

		const cases = this.discriminant.cases

		const caseKeys = Object.keys(cases)

		const { optimistic } = js
		// only the first layer can be optimistic
		js.optimistic = false

		js.block(`switch(${condition})`, () => {
			for (const k in cases) {
				const v = cases[k]
				const caseCondition = k === "default" ? k : `case ${k}`
				js.line(
					`${caseCondition}: return ${
						v === true ?
							optimistic ? js.data
							:	v
						: optimistic ?
							`${js.invoke(v)} ? ${v.contextFreeMorph ? `${registeredReference(v.contextFreeMorph)}(${js.data})` : js.data} : "${unset}"`
						:	js.invoke(v)
					}`
				)
			}

			return js
		})

		if (js.traversalKind === "Allows") {
			js.return(optimistic ? `"${unset}"` : false)
			return
		}

		const expected = describeBranches(
			this.discriminant.kind === "domain" ?
				caseKeys.map(k => {
					const jsTypeOf = k.slice(1, -1) as JsTypeOf
					return jsTypeOf === "function" ?
							domainDescriptions.object
						:	domainDescriptions[jsTypeOf]
				})
			:	caseKeys
		)

		const serializedPathSegments = this.discriminant.path.map(k =>
			typeof k === "symbol" ? registeredReference(k) : JSON.stringify(k)
		)

		const serializedExpected = JSON.stringify(expected)
		const serializedActual =
			this.discriminant.kind === "domain" ?
				`${serializedTypeOfDescriptions}[${condition}]`
			:	`${serializedPrintable}(${condition})`

		// TODO: should have its own error code
		js.line(`ctx.errorFromNodeContext({
	code: "predicate",
	expected: ${serializedExpected},
	actual: ${serializedActual},
	relativePath: [${serializedPathSegments}],
	meta: ${this.compiledMeta}
})`)
	}

	private compileIndiscriminable(js: NodeCompiler): void {
		if (js.traversalKind === "Apply") {
			js.const("errors", "[]")
			this.branches.forEach(branch =>
				js
					.line("ctx.pushBranch()")
					.line(js.invoke(branch))
					.if("!ctx.hasError()", () =>
						js.return(
							branch.includesTransform ?
								"ctx.queuedMorphs.push(...ctx.popBranch().queuedMorphs)"
							:	"ctx.popBranch()"
						)
					)
					.line("errors.push(ctx.popBranch().error)")
			)
			js.line(
				`ctx.errorFromNodeContext({ code: "union", errors, meta: ${this.compiledMeta} })`
			)
		} else {
			const { optimistic } = js
			// only the first layer can be optimistic
			js.optimistic = false
			this.branches.forEach(branch =>
				js.if(`${js.invoke(branch)}`, () =>
					js.return(
						optimistic ?
							branch.contextFreeMorph ?
								`${registeredReference(branch.contextFreeMorph)}(${js.data})`
							:	js.data
						:	true
					)
				)
			)
			js.return(optimistic ? `"${unset}"` : false)
		}
	}

	get nestableExpression(): string {
		// avoid adding unnecessary parentheses around boolean since it's
		// already collapsed to a single keyword
		return this.isBoolean ? "boolean" : `(${this.expression})`
	}

	discriminate(): Discriminant | null {
		if (this.branches.length < 2) return null
		if (this.unitBranches.length === this.branches.length) {
			const cases = flatMorph(this.unitBranches, (i, n) => [
				`${(n.in as Unit.Node).serializedValue}`,
				n.hasKind("morph") ? n : (true as const)
			])

			return {
				kind: "unit",
				path: [],
				optionallyChainedPropString: "data",
				cases
			}
		}
		const candidates: DiscriminantCandidate[] = []
		for (let lIndex = 0; lIndex < this.branches.length - 1; lIndex++) {
			const l = this.branches[lIndex]
			for (let rIndex = lIndex + 1; rIndex < this.branches.length; rIndex++) {
				const r = this.branches[rIndex]
				const result = intersectNodesRoot(l.in, r.in, l.$)
				if (!(result instanceof Disjoint)) continue

				for (const entry of result) {
					if (!entry.kind || entry.optional) continue

					let lSerialized: string
					let rSerialized: string

					if (entry.kind === "domain") {
						const lValue = entry.l as Domain.Node | Domain.Enumerable
						const rValue = entry.r as Domain.Node | Domain.Enumerable
						lSerialized = `"${typeof lValue === "string" ? lValue : lValue.domain}"`
						rSerialized = `"${typeof rValue === "string" ? rValue : rValue.domain}"`
					} else if (entry.kind === "unit") {
						lSerialized = (entry.l as Unit.Node).serializedValue
						rSerialized = (entry.r as Unit.Node).serializedValue
					} else continue

					const matching = candidates.find(
						d => arrayEquals(d.path, entry.path) && d.kind === entry.kind
					)

					if (!matching) {
						candidates.push({
							kind: entry.kind,
							cases: {
								[lSerialized]: {
									branchIndices: [lIndex],
									condition: entry.l as never
								},
								[rSerialized]: {
									branchIndices: [rIndex],
									condition: entry.r as never
								}
							},
							path: entry.path
						})
					} else {
						if (matching.cases[lSerialized]) {
							matching.cases[lSerialized].branchIndices = appendUnique(
								matching.cases[lSerialized].branchIndices,
								lIndex
							)
						} else {
							matching.cases[lSerialized] ??= {
								branchIndices: [lIndex],
								condition: entry.l as never
							}
						}

						if (matching.cases[rSerialized]) {
							matching.cases[rSerialized].branchIndices = appendUnique(
								matching.cases[rSerialized].branchIndices,
								rIndex
							)
						} else {
							matching.cases[rSerialized] ??= {
								branchIndices: [rIndex],
								condition: entry.r as never
							}
						}
					}
				}
			}
		}

		const orderedCandidates =
			this.ordered ? orderCandidates(candidates, this.branches) : candidates

		if (!orderedCandidates.length) return null

		const ctx = createCaseResolutionContext(orderedCandidates, this)

		const cases: DiscriminatedCases = {}

		for (const k in ctx.best.cases) {
			const resolution = resolveCase(ctx, k)

			if (resolution === null) {
				cases[k] = true
				continue
			}

			// if all the branches ended up back in pruned, we'd loop if we continued
			// so just bail out- nothing left to discriminate
			if (resolution.length === this.branches.length) return null

			if (this.ordered) {
				// ensure the original order of the pruned branches is preserved
				resolution.sort((l, r) => l.originalIndex - r.originalIndex)
			}

			const branches = resolution.map(entry => entry.branch)

			const caseNode =
				branches.length === 1 ?
					branches[0]
				:	this.$.node(
						"union",
						this.ordered ? { branches, ordered: true } : branches
					)

			Object.assign(this.referencesById, caseNode.referencesById)
			cases[k] = caseNode
		}

		if (ctx.defaultEntries.length) {
			// we don't have to worry about order here as it is always preserved
			// within defaultEntries
			const branches = ctx.defaultEntries.map(entry => entry.branch)
			cases.default = this.$.node(
				"union",
				this.ordered ? { branches, ordered: true } : branches,
				{
					prereduced: true
				}
			)

			Object.assign(this.referencesById, cases.default.referencesById)
		}

		return Object.assign(ctx.location, {
			cases
		})
	}
}
// New context object to carry discrimination state between functions.
type CaseResolutionContext = {
	best: DiscriminantCandidate
	location: DiscriminantLocation
	defaultEntries: BranchEntry[]
	node: Union.Node
}

type BranchEntry = {
	originalIndex: number
	branch: BaseRoot
}

const createCaseResolutionContext = (
	orderedCandidates: DiscriminantCandidate[],
	node: Union.Node
): CaseResolutionContext => {
	const best = orderedCandidates.sort(
		(l, r) => Object.keys(r.cases).length - Object.keys(l.cases).length
	)[0]

	const location: DiscriminantLocation = {
		kind: best.kind,
		path: best.path,
		optionallyChainedPropString: optionallyChainPropString(best.path)
	}

	const defaultEntries = node.branches.map(
		(branch, originalIndex): BranchEntry => ({
			originalIndex,
			branch
		})
	)

	return {
		best,
		location,
		defaultEntries,
		node
	}
}

const resolveCase = (
	ctx: CaseResolutionContext,
	key: CaseKey
): BranchEntry[] | null => {
	const caseCtx = ctx.best.cases[key]
	const discriminantNode = discriminantCaseToNode(
		caseCtx.condition,
		ctx.location.path,
		ctx.node.$
	)

	let resolvedEntries: BranchEntry[] | null = []
	const nextDefaults: BranchEntry[] = []

	for (let i = 0; i < ctx.defaultEntries.length; i++) {
		const entry = ctx.defaultEntries[i]
		if (caseCtx.branchIndices.includes(entry.originalIndex)) {
			const pruned = pruneDiscriminant(
				ctx.node.branches[entry.originalIndex],
				ctx.location
			)
			if (pruned === null) {
				// if any branch of the union has no constraints (i.e. is
				// unknown), the others won't affect the resolution type, but could still
				// remove additional cases from defaultEntries
				resolvedEntries = null
			} else {
				resolvedEntries?.push({
					originalIndex: entry.originalIndex,
					branch: pruned
				})
			}
		} else if (
			// we shouldn't need a special case for alias to avoid the below
			// once alias resolution issues are improved:
			// https://github.com/arktypeio/arktype/issues/1026
			entry.branch.hasKind("alias") &&
			discriminantNode.hasKind("domain") &&
			discriminantNode.domain === "object"
		)
			resolvedEntries?.push(entry)
		else {
			if (entry.branch.in.overlaps(discriminantNode)) {
				// include cases where an object not including the
				// discriminant path might have that value present as an undeclared key
				const overlapping = pruneDiscriminant(entry.branch, ctx.location)!
				resolvedEntries?.push({
					originalIndex: entry.originalIndex,
					branch: overlapping
				})
			}
			nextDefaults.push(entry)
		}
	}

	ctx.defaultEntries = nextDefaults
	return resolvedEntries
}

const orderCandidates = (
	candidates: DiscriminantCandidate[],
	originalBranches: readonly Union.ChildNode[]
): DiscriminantCandidate[] => {
	const viableCandidates = candidates.filter(candidate => {
		const caseGroups = Object.values(candidate.cases).map(
			caseCtx => caseCtx.branchIndices
		)

		// compare each group against all subsequent groups.
		for (let i = 0; i < caseGroups.length - 1; i++) {
			const currentGroup = caseGroups[i]
			for (let j = i + 1; j < caseGroups.length; j++) {
				const nextGroup = caseGroups[j]

				// for each group pair, check for branches whose order was reversed
				for (const currentIndex of currentGroup) {
					for (const nextIndex of nextGroup) {
						if (currentIndex > nextIndex) {
							if (
								originalBranches[currentIndex].overlaps(
									originalBranches[nextIndex]
								)
							) {
								// if the order was not preserved and the branches overlap,
								// this is not a viable discriminant as it cannot guarantee the same behavior
								return false
							}
						}
					}
				}
			}
		}

		// branch groups preserved order for non-disjoint pairs and is viable
		return true
	})

	return viableCandidates
}

const discriminantCaseToNode = (
	caseDiscriminant: CaseDiscriminant,
	path: PropertyKey[],
	$: BaseScope
): BaseRoot => {
	let node: BaseRoot =
		caseDiscriminant === "undefined" ? $.node("unit", { unit: undefined })
		: caseDiscriminant === "null" ? $.node("unit", { unit: null })
		: caseDiscriminant === "boolean" ? $.units([true, false])
		: caseDiscriminant
	for (let i = path.length - 1; i >= 0; i--) {
		const key = path[i]
		node = $.node(
			"intersection",
			typeof key === "number" ?
				{
					proto: "Array",
					// create unknown for preceding elements (could be optimized with safe imports)
					sequence: [...range(key).map(_ => ({})), node]
				}
			:	{
					domain: "object",
					required: [{ key, value: node }]
				}
		)
	}
	return node
}

const optionallyChainPropString = (path: PropertyKey[]): string =>
	path.reduce<string>(
		(acc, k) => acc + compileLiteralPropAccess(k, true),
		"data"
	)

const serializedTypeOfDescriptions = registeredReference(jsTypeOfDescriptions)

const serializedPrintable = registeredReference(printable)

export const Union = {
	implementation,
	Node: UnionNode
}

const discriminantToJson = (discriminant: Discriminant): JsonStructure => ({
	kind: discriminant.kind,
	path: discriminant.path.map(k =>
		typeof k === "string" ? k : compileSerializedValue(k)
	),
	cases: flatMorph(discriminant.cases, (k, node) => [
		k,
		node === true ? node
		: node.hasKind("union") && node.discriminantJson ? node.discriminantJson
		: node.json
	])
})

type DescribeBranchesOptions = {
	delimiter?: string
	finalDelimiter?: string
}

const describeExpressionOptions: DescribeBranchesOptions = {
	delimiter: " | ",
	finalDelimiter: " | "
}

const expressBranches = (expressions: string[]) =>
	describeBranches(expressions, describeExpressionOptions)

const describeBranches = (
	descriptions: string[],
	opts?: DescribeBranchesOptions
) => {
	const delimiter = opts?.delimiter ?? ", "
	const finalDelimiter = opts?.finalDelimiter ?? " or "

	if (descriptions.length === 0) return "never"

	if (descriptions.length === 1) return descriptions[0]
	if (
		(descriptions.length === 2 &&
			descriptions[0] === "false" &&
			descriptions[1] === "true") ||
		(descriptions[0] === "true" && descriptions[1] === "false")
	)
		return "boolean"

	// keep track of seen descriptions to avoid duplication
	const seen: Record<string, true | undefined> = {}
	const unique = descriptions.filter(s => (seen[s] ? false : (seen[s] = true)))
	const last = unique.pop()!

	return `${unique.join(delimiter)}${unique.length ? finalDelimiter : ""}${last}`
}

export const intersectBranches = (
	l: readonly Union.ChildNode[],
	r: readonly Union.ChildNode[],
	ctx: IntersectionContext
): readonly Union.ChildNode[] | Disjoint => {
	// If the corresponding r branch is identified as a subtype of an l branch, the
	// value at rIndex is set to null so we can avoid including previous/future
	// inersections in the reduced result.
	const batchesByR: (BaseRoot[] | null)[] = r.map(() => [])
	for (let lIndex = 0; lIndex < l.length; lIndex++) {
		let candidatesByR: { [rIndex: number]: BaseRoot } = {}
		for (let rIndex = 0; rIndex < r.length; rIndex++) {
			if (batchesByR[rIndex] === null) {
				// rBranch is a subtype of an lBranch and
				// will not yield any distinct intersection
				continue
			}
			if (l[lIndex].equals(r[rIndex])) {
				// Combination of subtype and supertype cases
				batchesByR[rIndex] = null
				candidatesByR = {}
				break
			}
			const branchIntersection = intersectOrPipeNodes(l[lIndex], r[rIndex], ctx)
			if (branchIntersection instanceof Disjoint) {
				// Doesn't tell us anything useful about their relationships
				// with other branches
				continue
			}
			if (branchIntersection.equals(l[lIndex])) {
				// If the current l branch is a subtype of r, intersections
				// with previous and remaining branches of r won't lead to
				// distinct intersections.
				batchesByR[rIndex]!.push(l[lIndex])
				candidatesByR = {}
				break
			}
			if (branchIntersection.equals(r[rIndex])) {
				// If the current r branch is a subtype of l, set its batch to
				// null, removing any previous intersections and preventing any
				// of its remaining intersections from being computed.
				batchesByR[rIndex] = null
			} else {
				// If neither l nor r is a subtype of the other, add their
				// intersection as a candidate (could still be removed if it is
				// determined l or r is a subtype of a remaining branch).
				candidatesByR[rIndex] = branchIntersection
			}
		}
		for (const rIndex in candidatesByR) {
			// batchesByR at rIndex should never be null if it is in candidatesByR
			batchesByR[rIndex]![lIndex] = candidatesByR[rIndex]
		}
	}
	// Compile the reduced intersection result, including:
	// 		1. Remaining candidates resulting from distinct intersections or strict subtypes of r
	// 		2. Original r branches corresponding to indices with a null batch (subtypes of l)
	const resultBranches = batchesByR.flatMap(
		// ensure unions returned from branchable intersections like sequence are flattened
		(batch, i) => batch?.flatMap(branch => branch.branches) ?? r[i]
	)
	return resultBranches.length === 0 ?
			Disjoint.init("union", l, r)
		:	resultBranches
}

export const reduceBranches = ({
	branches,
	ordered
}: Union.Inner): readonly Union.ChildNode[] => {
	if (branches.length < 2) return branches

	const uniquenessByIndex: Record<number, boolean> = branches.map(() => true)
	for (let i = 0; i < branches.length; i++) {
		for (
			let j = i + 1;
			j < branches.length && uniquenessByIndex[i] && uniquenessByIndex[j];
			j++
		) {
			if (branches[i].equals(branches[j])) {
				// if the two branches are equal, only "j" is marked as
				// redundant so at least one copy could still be included in
				// the final set of branches.
				uniquenessByIndex[j] = false
				continue
			}
			const intersection = intersectNodesRoot(
				branches[i].in,
				branches[j].in,
				branches[0].$
			)!
			if (intersection instanceof Disjoint) continue

			if (!ordered) assertDeterminateOverlap(branches[i], branches[j])

			if (intersection.equals(branches[i].in)) {
				// preserve ordered branches that are a subtype of a subsequent branch
				uniquenessByIndex[i] = !!ordered
			} else if (intersection.equals(branches[j].in))
				uniquenessByIndex[j] = false
		}
	}
	return branches.filter((_, i) => uniquenessByIndex[i])
}

const assertDeterminateOverlap = (l: Union.ChildNode, r: Union.ChildNode) => {
	if (!l.includesTransform && !r.includesTransform) return

	if (!arrayEquals(l.shallowMorphs as Morph[], r.shallowMorphs as Morph[])) {
		throwParseError(
			writeIndiscriminableMorphMessage(l.expression, r.expression)
		)
	}

	if (
		!arrayEquals(l.flatMorphs, r.flatMorphs, {
			isEqual: (l, r) =>
				l.propString === r.propString && l.node.hasEqualMorphs(r.node)
		})
	) {
		throwParseError(
			writeIndiscriminableMorphMessage(l.expression, r.expression)
		)
	}
}

export type CaseKey<kind extends DiscriminantKind = DiscriminantKind> =
	DiscriminantKind extends kind ? string : DiscriminantKinds[kind] | "default"

type DiscriminantLocation<kind extends DiscriminantKind = DiscriminantKind> = {
	path: PropertyKey[]
	optionallyChainedPropString: string
	kind: kind
}

export interface Discriminant<kind extends DiscriminantKind = DiscriminantKind>
	extends DiscriminantLocation<kind> {
	cases: DiscriminatedCases<kind>
}

type DiscriminantCandidate<kind extends DiscriminantKind = DiscriminantKind> = {
	path: PropertyKey[]
	kind: kind
	cases: CandidateCases<kind>
}

type CandidateCases<kind extends DiscriminantKind = DiscriminantKind> = {
	[caseKey in CaseKey<kind>]: CaseContext
}

export type CaseContext = {
	branchIndices: number[]
	condition: nodeOfKind<DiscriminantKind> | Domain.Enumerable
}

export type CaseDiscriminant = nodeOfKind<DiscriminantKind> | Domain.Enumerable

export type DiscriminatedCases<
	kind extends DiscriminantKind = DiscriminantKind
> = {
	[caseKey in CaseKey<kind>]: BaseRoot | true
}

export type DiscriminantKinds = {
	domain: Domain
	unit: SerializedPrimitive | RegisteredReference
}

export type DiscriminantKind = show<keyof DiscriminantKinds>

export const pruneDiscriminant = (
	discriminantBranch: BaseRoot,
	discriminantCtx: DiscriminantLocation
): BaseRoot | null =>
	discriminantBranch.transform(
		(nodeKind, inner) => {
			if (nodeKind === "domain" || nodeKind === "unit") return null

			return inner
		},
		{
			shouldTransform: (node, ctx) => {
				// safe to cast here as index nodes are never discriminants
				const propString = optionallyChainPropString(ctx.path as PropertyKey[])

				if (!discriminantCtx.optionallyChainedPropString.startsWith(propString))
					return false

				if (node.hasKind("domain") && node.domain === "object")
					// if we've already checked a path at least as long as the current one,
					// we don't need to revalidate that we're in an object
					return true

				if (
					(node.hasKind("domain") || discriminantCtx.kind === "unit") &&
					propString === discriminantCtx.optionallyChainedPropString
				)
					// if the discriminant has already checked the domain at the current path
					// (or a unit literal, implying a domain), we don't need to recheck it
					return true

				// we don't need to recurse into index nodes as they will never
				// have a required path therefore can't be used to discriminate
				return node.children.length !== 0 && node.kind !== "index"
			}
		}
	)

export const writeIndiscriminableMorphMessage = (
	lDescription: string,
	rDescription: string
): string =>
	`An unordered union of a type including a morph and a type with overlapping input is indeterminate:
Left: ${lDescription}
Right: ${rDescription}`

export const writeOrderedIntersectionMessage = (
	lDescription: string,
	rDescription: string
): string => `The intersection of two ordered unions is indeterminate:
Left: ${lDescription}
Right: ${rDescription}`
