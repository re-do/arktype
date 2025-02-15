"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Banner } from "./Banner.tsx"

const text = "🎉 Announcing ArkType 2.0 🎉"

export const ReleaseBanner = () => (
	<Link href="/docs/blog/2.0">
		<Banner style={{ fontSize: 16 }} boat={usePathname().includes("docs")}>
			{text}
		</Banner>
	</Link>
)
