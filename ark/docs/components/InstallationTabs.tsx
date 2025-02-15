import { Tab, Tabs } from "fumadocs-ui/components/tabs"
import { CodeBlock } from "./CodeBlock.tsx"

const installers = ["pnpm", "npm", "yarn", "bun"] as const satisfies string[]

export type Installer = (typeof installers)[number]

type InstallationTabProps = {
	name: Installer
}

const InstallerTab = ({ name }: InstallationTabProps) => (
	<Tab value={name} className="installer-tab">
		<CodeBlock lang="bash">{`${name} ${name === "yarn" ? "add" : "install"} arktype`}</CodeBlock>
	</Tab>
)

export const InstallationTabs = () => (
	<Tabs items={installers}>
		<InstallerTab name="pnpm" />
		<InstallerTab name="npm" />
		<InstallerTab name="yarn" />
		<InstallerTab name="bun" />
	</Tabs>
)
