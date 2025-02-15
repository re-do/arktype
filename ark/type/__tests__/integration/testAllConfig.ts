import "./allConfig.ts"

import { hasArkKind } from "@ark/schema"
import { flatMorph } from "@ark/util"
import { ark } from "arktype"
import { AssertionError } from "assert"
import { cases } from "./util.ts"

cases({
	allResolutionsHaveMatchingQualifiedName: () => {
		const mismatches = flatMorph(
			ark.internal.resolutions,
			(qualifiedName, resolution, i: number) => {
				if (!resolution || typeof resolution === "string") return []
				if (hasArkKind(resolution, "generic")) return []
				if (qualifiedName.endsWith(".root")) return []
				if (resolution.description !== "configured") return [i, qualifiedName]
				return []
			}
		)

		if (mismatches.length) {
			throw new AssertionError({
				message: `The following resolutions had mismatching qualifiedNames:\n${mismatches.join("\n")}`
			})
		}
	}
})
