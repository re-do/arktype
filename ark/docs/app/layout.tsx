import "app/global.css"
import "fumadocs-twoslash/twoslash.css"
import { RootProvider } from "fumadocs-ui/provider"
import { Raleway } from "next/font/google"
import type { ReactNode } from "react"
import { ReleaseBanner } from "../components/ReleaseBanner.tsx"
import { CSPostHogProvider } from "./providers.tsx"

const raleway = Raleway({
	subsets: ["latin"]
})

export default ({ children }: { children: ReactNode }) => (
	<html
		lang="en"
		className={`dark ${raleway.className}`}
		suppressHydrationWarning
	>
		<head>
			<meta
				name="description"
				content="Optimized runtime validation for TypeScript syntax"
			/>
			<meta property="sog:title" content="ArkType" />
			<meta
				property="og:description"
				content="Optimized runtime validation for TypeScript syntax"
			/>
			<meta property="og:image" content="/image/og.png" />
			<meta property="og:url" content="https://arktype.io" />
			<meta name="twitter:card" content="/image/og.png" />
			<meta
				name="keywords"
				content="ArkType, TypeScript, JavaScript, runtime validation, schema, type-safe, validator, syntax"
			/>
			<link rel="icon" href="/image/favicon.svg" />
		</head>
		<body className="flex flex-col min-h-screen">
			<RootProvider
				search={{
					options: {
						type: "static"
					}
				}}
				theme={{
					enabled: false,
					enableSystem: false
				}}
			>
				<CSPostHogProvider>
					<ReleaseBanner />
					{children}
				</CSPostHogProvider>
			</RootProvider>
		</body>
	</html>
)
