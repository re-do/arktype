// @ts-check
import tseslint from "typescript-eslint"

/** These actually have types but I'm not sure how to enable esModuleInterop
 * with allowJs in the root tsconfig, which dramatically slows typechecking */
import eslint from "@eslint/js"
// @ts-ignore
import importPlugin from "eslint-plugin-import"

/** These actually don't have types as of now */
import onlyWarn from "eslint-plugin-only-warn"
import preferArrowFunctions from "eslint-plugin-prefer-arrow-functions"

export default tseslint.config(
	{
		ignores: [
			"**/dist/**/*",
			"**/out/**/*",
			"**/node_modules/**/*",
			"**/*js",
			"**/*.astro",
			"**/.next/**/*",
			"**/.source/**/*",
			"**/*scratch.ts",
			"**/scratch/**/*",
			"**/examples/**/*"
		]
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		plugins: {
			"@typescript-eslint": tseslint.plugin,
			import: importPlugin,
			// @ts-ignore
			"only-warn": onlyWarn,
			"prefer-arrow-functions": preferArrowFunctions
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error"
		}
	},
	{
		rules: {
			eqeqeq: "warn",
			curly: ["warn", "multi-or-nest"],
			"no-lone-blocks": "warn",
			"object-shorthand": "warn",
			"prefer-arrow-functions/prefer-arrow-functions": [
				"warn",
				{
					disallowPrototype: true
				}
			],
			"arrow-body-style": ["warn", "as-needed"],
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					args: "after-used",
					argsIgnorePattern: "^_",
					ignoreRestSiblings: true
				}
			],
			"@typescript-eslint/default-param-last": "warn",
			"@typescript-eslint/no-empty-interface": "off",
			"import/no-cycle": "warn",
			// Exporting types and values with the same name is a common pattern in the repo
			"import/export": "off",
			"@typescript-eslint/explicit-module-boundary-types": [
				"warn",
				{
					allowArgumentsExplicitlyTypedAsAny: true
				}
			],
			"@typescript-eslint/consistent-type-imports": [
				"warn",
				{
					// can be useful for cjs/esm interop type imports
					disallowTypeAnnotations: false,
					fixStyle: "inline-type-imports"
				}
			],
			"@typescript-eslint/no-import-type-side-effects": "warn",
			"import/no-duplicates": [
				"warn",
				{
					"prefer-inline": true
				}
			],
			"no-restricted-imports": "off",
			"@typescript-eslint/no-restricted-imports": [
				"warn",
				{
					patterns: [
						{
							group: [
								"**/fs/**",
								"**/attest/**",
								"**/schema/**",
								"**/type/**",
								"**/util/**"
							],

							message:
								"Use a specifier like '@ark/util' to import from a package"
						},
						{
							group: ["**/index.ts", "!**/structure/index.ts"],
							message:
								"Use a path like '../original/definition.ts' instead of a package entrypoint"
						},
						{
							group: ["arktype/config"],
							message: "Use a relative path to ark/type/config.ts instead"
						}
					]
				}
			],
			"@typescript-eslint/no-empty-object-type": "off",
			"@typescript-eslint/no-unsafe-function-type": "off",
			"@typescript-eslint/no-wrapper-object-types": "off",
			"@typescript-eslint/ban-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-unsafe-declaration-merging": "off",
			"@typescript-eslint/no-namespace": ["warn", { allowDeclarations: true }],
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-this-alias": "off",
			"no-case-declarations": "off",
			"@typescript-eslint/ban-ts-comment": [
				"warn",
				{
					"ts-ignore": "allow-with-description"
				}
			]
		}
	},
	{
		files: ["**/ark/type/**", "**/ark/schema/**", "**/ark/util/**"],
		rules: {
			"import/no-nodejs-modules": "warn",
			"import/no-extraneous-dependencies": "warn"
		}
	},
	{
		files: ["**/ark/schema/structure/**"],
		rules: {
			"@typescript-eslint/no-restricted-imports": [
				"warn",
				{
					patterns: [
						{
							group: [
								"**/fs/**",
								"**/attest/**",
								"**/schema/**",
								"**/type/**",
								"**/util/**",
								"arktype/internal/**"
							],

							message:
								"Use a specifier like '@ark/util' to import from a package"
						},
						{
							group: ["../**/index.ts"],
							message:
								"Use a path like '../original/definition.ts' instead of a package entrypoint"
						}
					]
				}
			]
		}
	},
	{
		files: ["**/ark/attest/**", "**/ark/fs/**", "**/ark/docs/**"],
		rules: {
			"import/no-extraneous-dependencies": "warn"
		}
	},
	{
		files: ["**/ark/repo/**", "**/ark/docs/**"],
		rules: {
			"@typescript-eslint/explicit-module-boundary-types": "off"
		}
	},
	{
		files: ["**/__tests__/**", "**/*.bench.ts", "**/*.test.ts"],
		rules: {
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"import/no-extraneous-dependencies": "off",
			"import/no-nodejs-modules": "off",
			"@typescript-eslint/no-restricted-imports": [
				"warn",
				{
					patterns: [
						{
							group: ["../**"],
							message:
								"Tests must import from package entrypoints (use /internal if necessary)"
						}
					]
				}
			],
			// function foo is particularly useful for defining a named function inline e.g. to
			// be passed to a morph so it can be uniquely snapshotted
			"prefer-arrow-functions/prefer-arrow-functions": "off"
		}
	}
)
