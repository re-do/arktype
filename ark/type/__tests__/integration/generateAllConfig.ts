import { fromHere, writeFile } from "@ark/fs"
import { hasArkKind } from "@ark/schema"
import { flatMorph } from "@ark/util"
import { ark } from "arktype"
import type { ArkConfig } from "arktype/config"

const config: ArkConfig = {
	keywords: flatMorph(ark.internal.resolutions, (qualifiedName, resolution) => {
		if (!resolution || typeof resolution === "string") return []
		if (hasArkKind(resolution, "generic")) return []
		if (qualifiedName.endsWith(".root")) return []
		return [qualifiedName, { description: "configured" }]
	})
}

writeFile(
	fromHere("allConfig.ts"),
	`import { configure } from "arktype/config"

configure(${JSON.stringify(config, null, 4)})
`
)
