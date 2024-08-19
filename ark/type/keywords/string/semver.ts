import type { Branded, constrain } from "../../ast.ts"
import { regexStringNode } from "./utils.ts"

declare namespace string {
	export type semver = constrain<string, Branded<"semver">>
}

// https://semver.org/
const semverMatcher =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

export const semver = regexStringNode(
	semverMatcher,
	"a semantic version (see https://semver.org/)"
)

export type semver = string.semver
