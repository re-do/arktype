import { ReadonlyPath, stringifyPath, type array } from "@ark/util"
import type { ResolvedConfig } from "../config.ts"
import type { Morph } from "../roots/morph.ts"
import {
	ArkError,
	ArkErrors,
	type ArkErrorCode,
	type ArkErrorContextInput,
	type ArkErrorInput,
	type NodeErrorContextInput
} from "./errors.ts"
import { isNode } from "./utils.ts"

export type MorphsAtPath = {
	path: ReadonlyPath
	morphs: array<Morph>
}

export type BranchTraversal = {
	error: ArkError | undefined
	queuedMorphs: MorphsAtPath[]
}

// avoid sugar methods internally
export type InternalTraversal = Omit<Traversal, "error" | "mustBe" | "reject">

export class Traversal {
	/**
	 * #### the path being validated or morphed
	 *
	 * ✅ array indices represented as numbers
	 * ⚠️ mutated during traversal - use `path.slice(0)` to snapshot
	 * 🔗 use {@link propString} for a stringified version
	 */
	path: PropertyKey[] = []

	/**
	 * #### {@link ArkErrors} that will be part of this traversal's finalized result
	 *
	 * ✅ will always be an empty array for a valid traversal
	 */
	errors: ArkErrors = new ArkErrors(this)

	/**
	 * #### the original value being traversed
	 */
	root: unknown

	/**
	 * #### configuration for this traversal
	 *
	 * ✅ options can affect traversal results and error messages
	 * ✅ defaults < global config < scope config
	 * ✅ does not include options configured on individual types
	 */
	config: ResolvedConfig

	queuedMorphs: MorphsAtPath[] = []
	branches: BranchTraversal[] = []
	seen: { [id in string]?: unknown[] } = {}

	constructor(root: unknown, config: ResolvedConfig) {
		this.root = root
		this.config = config
	}

	/**
	 * #### the data being validated or morphed
	 *
	 * ✅ extracted from {@link root} at {@link path}
	 */
	get data(): unknown {
		let result: any = this.root
		for (const segment of this.path) result = result?.[segment]

		return result
	}

	/**
	 * #### a string representing {@link path}
	 *
	 * @propString
	 */
	get propString(): string {
		return stringifyPath(this.path)
	}

	/**
	 * #### add an {@link ArkError} and return `false`
	 *
	 * ✅ useful for predicates like `.narrow`
	 */
	reject(input: ArkErrorInput): false {
		this.error(input)
		return false
	}

	/**
	 * #### add an {@link ArkError} from a description and return `false`
	 *
	 * ✅ useful for predicates like `.narrow`
	 * 🔗 equivalent to {@link reject}({ expected })
	 */
	mustBe(expected: string): false {
		this.error(expected)
		return false
	}

	/**
	 * #### add and return an {@link ArkError}
	 *
	 * ✅ useful for morphs like `.pipe`
	 */
	error<input extends ArkErrorInput>(
		input: input
	): ArkError<
		input extends { code: ArkErrorCode } ? input["code"] : "predicate"
	>
	error(input: ArkErrorInput): ArkError {
		const errCtx: ArkErrorContextInput =
			typeof input === "object" ?
				input.code ?
					input
				:	{ ...input, code: "predicate" }
			:	{ code: "predicate", expected: input }
		return this.errorFromContext(errCtx)
	}

	/**
	 * #### whether {@link currentBranch} (or the traversal root, outside a union) has one or more errors
	 */
	hasError(): boolean {
		return this.currentErrorCount !== 0
	}

	get currentBranch(): BranchTraversal | undefined {
		return this.branches.at(-1)
	}

	queueMorphs(morphs: array<Morph>): void {
		const input: MorphsAtPath = {
			path: new ReadonlyPath(...this.path),
			morphs
		}
		if (this.currentBranch) this.currentBranch.queuedMorphs.push(input)
		else this.queuedMorphs.push(input)
	}

	finalize(onFail?: ArkErrors.Handler | null): unknown {
		if (this.queuedMorphs.length) {
			if (
				typeof this.root === "object" &&
				this.root !== null &&
				this.config.clone
			)
				this.root = this.config.clone(this.root)

			this.applyQueuedMorphs()
		}

		if (this.hasError()) return onFail ? onFail(this.errors) : this.errors

		return this.root
	}

	get currentErrorCount(): number {
		return (
			this.currentBranch ?
				this.currentBranch.error ?
					1
				:	0
			:	this.errors.count
		)
	}

	get failFast(): boolean {
		return this.branches.length !== 0
	}

	pushBranch(): void {
		this.branches.push({
			error: undefined,
			queuedMorphs: []
		})
	}

	popBranch(): BranchTraversal | undefined {
		return this.branches.pop()
	}

	/**
	 * @internal
	 * Convenience for casting from InternalTraversal to Traversal
	 * for cases where the extra methods on the external type are expected, e.g.
	 * a morph or predicate.
	 */
	get external(): this {
		return this
	}

	/**
	 * @internal
	 */
	errorFromNodeContext<input extends NodeErrorContextInput>(
		input: input
	): ArkError<input["code"]>
	errorFromNodeContext(input: NodeErrorContextInput): ArkError {
		return this.errorFromContext(input)
	}

	private errorFromContext(errCtx: ArkErrorContextInput): ArkError {
		const error = new ArkError(errCtx, this)
		if (this.currentBranch) this.currentBranch.error = error
		else this.errors.add(error)

		return error as never
	}

	private applyQueuedMorphs() {
		// invoking morphs that are Nodes will reuse this context, potentially
		// adding additional morphs, so we have to continue looping until
		// queuedMorphs is empty rather than iterating over the list once
		while (this.queuedMorphs.length) {
			const queuedMorphs = this.queuedMorphs
			this.queuedMorphs = []
			for (const { path, morphs } of queuedMorphs) {
				// even if we already have an error, apply morphs that are not at a path
				// with errors to capture potential validation errors
				if (this.errors.affectsPath(path)) continue
				this.applyMorphsAtPath(path, morphs)
			}
		}
	}

	private applyMorphsAtPath(path: ReadonlyPath, morphs: array<Morph>): void {
		const key = path.at(-1)

		let parent: any

		if (key !== undefined) {
			// find the object on which the key to be morphed exists
			parent = this.root
			for (let pathIndex = 0; pathIndex < path.length - 1; pathIndex++)
				parent = parent[path[pathIndex]]
		}

		this.path = [...path]

		for (const morph of morphs) {
			const morphIsNode = isNode(morph)

			const result = morph(
				parent === undefined ? this.root : parent[key!],
				this
			)

			if (result instanceof ArkError) {
				// if an ArkError was returned, ensure it has been added to errors
				this.errors.add(result)
				// skip any remaining morphs at the current path
				break
			}
			if (result instanceof ArkErrors) {
				// if the morph was a direct reference to another node,
				// errors will have been added directly via this piped context
				if (!morphIsNode) {
					// otherwise, we have to ensure each error has been added
					this.errors.merge(result)
				}
				// skip any remaining morphs at the current path
				break
			}

			// if the morph was successful, assign the result to the
			// corresponding property, or to root if path is empty
			if (parent === undefined) this.root = result
			else parent[key!] = result

			// if the current morph queued additional morphs,
			// applying them before subsequent morphs
			this.applyQueuedMorphs()
		}
	}
}

export const traverseKey = <result>(
	key: PropertyKey,
	fn: () => result,
	// ctx will be undefined if this node isn't context-dependent
	ctx: InternalTraversal | undefined
): result => {
	if (!ctx) return fn()

	ctx.path.push(key)
	const result = fn()
	ctx.path.pop()
	return result
}

export type TraversalMethodsByKind<input = unknown> = {
	Allows: TraverseAllows<input>
	Apply: TraverseApply<input>
}

export type TraversalKind = keyof TraversalMethodsByKind

export type TraverseAllows<data = unknown> = (
	data: data,
	ctx: InternalTraversal
) => boolean

export type TraverseApply<data = unknown> = (
	data: data,
	ctx: InternalTraversal
) => void
