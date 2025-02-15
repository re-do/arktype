import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"
import { MainAutoplayDemo } from "./AutoplayDemo.tsx"
import { PlatformCloud } from "./PlatformCloud.tsx"

export const Hero = () => (
	<div>
		<div className="flex flex-col md:flex-row justify-between">
			<div className="absolute top-2 left-0 right-0">
				<div className="flex justify-between">
					<PlatformCloud
						main="ts"
						right="vscode"
						top="neovim"
						left="intellij"
					/>
					<PlatformCloud main="js" right="chromium" top="node" left="bun" />
				</div>
			</div>

			<div className="relative w-full flex flex-col md:items-start text-center md:text-left">
				<h1 className="mb-4 text-3xl md:text-8xl">ArkType</h1>
				<p className="text-fd-muted-foreground text-2xl leading-relaxed">
					Optimized runtime validation for TypeScript syntax
				</p>

				{/* This wrapper grows to fill remaining vertical space, placing the link in the centered area */}
				<div className="flex-1 flex items-center justify-center md:justify-start mt-6">
					<Link
						tabIndex={1}
						href="/docs/intro/setup"
						className="bg-highlight text-black focus-within:outline-2 outline-white hover:bg-highlight/80 p-5 rounded-full flex gap-2 text-sm items-center"
					>
						Get Started
						<ArrowRightIcon />
					</Link>
				</div>
			</div>

			<div style={{ padding: "2rem", position: "relative" }}>
				<MainAutoplayDemo />
			</div>
		</div>
	</div>
)
