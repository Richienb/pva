import meow from "meow"
import chalk from "chalk"
import processConfig from "ibm-openapi-validator/src/cli-validator/utils/processConfiguration.js"
import { cosmiconfig } from "cosmiconfig"
import pMap, { pMapSkip } from "p-map"
import { globby } from "globby"
import is from "@sindresorhus/is"
import logSymbols from "log-symbols"
import defaultConfig from "./config.js"
import { lintFile, formatResults, Result, Options } from "./index.js"

const { validate: validateConfig } = processConfig as {
	validate(configObject: Options, chalk_: typeof chalk): Options & {
		invalid: boolean
	}
}

let { input: files, flags } = meow(`
	Usage
	  $ pva <files...>

	Options
	  --verbose, -v  Log debug information

	Examples
	  $ pva api.yaml

	  ${chalk.underline("api.yaml")}
	  ${logSymbols.warning} ${chalk.grey("0")} Major version segment not present in either server URLs or paths ${chalk.grey("major-version-in-path")}
	  ${logSymbols.warning} ${chalk.grey("0")} OpenAPI object should have non-empty \`tags\` array.               ${chalk.grey("openapi-tags")}
	  ${logSymbols.error} ${chalk.grey("0")} Object should have the required property \`info\`.                 ${chalk.grey("oas3-schema")}

	  ${chalk.yellow("2 warnings")}
	  ${chalk.red("1 error")}`, {
	importMeta: import.meta,
	flags: {
		verbose: {
			type: "boolean",
			alias: "v",
		},
	},
})

const explorer = cosmiconfig("pva")

async function loadConfig() {
	try {
		return ((await explorer.search())?.config as Options) ?? defaultConfig
	} catch {
		return defaultConfig
	}
}

const config = validateConfig(await loadConfig(), chalk)

if (config.invalid) {
	process.exit(2)
}

let isAutoDetectedFiles = false

if (files.length === 0) {
	files = await globby(["**/*.{yaml,yml,json}"], {
		gitignore: true,
	})
	isAutoDetectedFiles = true
} else {
	files = await globby(files)
}

const results: Array<[string, Result]> = await pMap(files, async file => {
	try {
		return [file, await lintFile(file, config)]
	} catch (error: unknown) {
		if (is.error(error) && !(isAutoDetectedFiles && error.message === "Neither a `openapi` property nor a `swagger` property with the value of \"2.0\" was found")) {
			console.log(chalk.red(error.message))
		}

		return pMapSkip
	}
})

if (flags.verbose) {
	console.log(results)
}

if (results.length === 0) {
	console.log("No files to lint")
	process.exit(2)
}

if (results.some(([_, { errors = [] }]) => errors.length > 0)) {
	process.exitCode = 1
}

console.log(formatResults(results))
