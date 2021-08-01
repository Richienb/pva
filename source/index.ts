import { promises as fs } from "node:fs"
import path from "node:path"
import validate from "ibm-openapi-validator/src/cli-validator/utils/validator.js"
import buildSwaggerObject from "ibm-openapi-validator/src/cli-validator/utils/buildSwaggerObject.js"
import { formatResultsAsObject } from "ibm-openapi-validator/src/cli-validator/utils/jsonResults.js"
import spectralValidator from "ibm-openapi-validator/src/spectral/utils/spectral-validator.js"
import computeSpectralFingerprint from "ibm-openapi-validator/src/cli-validator/utils/noDeduplication.js"
import preprocessFile from "ibm-openapi-validator/src/cli-validator/utils/preprocessFile.js"
import stripBom from "strip-bom"
import parseJson from "parse-json"
import { load as parseYaml } from "js-yaml"
import { Spectral, IRuleResult } from "@stoplight/spectral"
import mergeOptions from "merge-options"
import { numberSortAscending } from "num-sort"
import chalk from "chalk"
import plur from "plur"
import stringWidth from "string-width"
import ansiEscapes from "ansi-escapes"
import lastItem from "last-item"
import logSymbols from "log-symbols"
import type { JsonObject } from "type-fest"
import type { JSONSchema4, JSONSchema6 } from "json-schema"
import defaultConfig from "./config.js"

type Status = "error" | "warning" | "info" | "hint" | "off"
type Case = "lower_snake_case" | "upper_snake_case" | "upper_camel_case" | "lower_camel_case" | "k8s_camel_case" | "lower_dash_case" | "upper_dash_case"
type CaseConvention = [Status, Case] | ["off"]

/**
- [Spectral base rules](https://github.com/stoplightio/spectral/blob/develop/docs/reference/openapi-rules.md)
- [IBM validator rules](https://github.com/IBM/openapi-validator#definitions)
- [IBM custom Spectral rules](https://github.com/IBM/openapi-validator/blob/main/docs/spectral-rules.md)
*/
export interface Options {
	shared?: {
		operations?: {
			/**
			Flag a tag that is in operations and not listed in `tags` on the top level.
			*/
			undefined_tag?: Status

			/**
			Flag a tag that is listed in `tags` on the top level that is not used in the spec.
			*/
			unused_tag?: Status

			/**
			Flag any operations that do not have an `operationId` field.
			*/
			no_operation_id?: Status

			/**
			Flag any `operationId` that does not follow a given case convention.
			*/
			operation_id_case_convention?: CaseConvention

			/**
			Flag any operations that do not have a `summary` field.
			*/
			no_summary?: Status

			/**
			Flag any operations with a top-level array response.
			*/
			no_array_responses?: Status

			/**
			Flag any operations with optional parameters before a required param.
			*/
			parameter_order?: Status

			/**
			Flag any `operationId` that does not follow naming convention.
			*/
			operation_id_naming_convention?: Status
		}
		pagination?: {
			/**
			Flag any parameter or response schema that does not follow pagination requirements.
			*/
			pagination_style?: Status
		}
		parameters?: {
			/**
			Flag any required parameter that specifies a default value.
			*/
			required_param_has_default?: Status

			/**
			Flag any parameter that does not contain a `description` field.
			*/
			no_parameter_description?: Status

			/**
			Flag any parameter with a name field that does not follow a given case convention.
			*/
			param_name_case_convention?: CaseConvention

			/**
			Flag any parameter that does not follow the [data type/format rules.](https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.0.0.md#parameter-object)
			*/
			invalid_type_format_pair?: Status

			/**
			[Flag any parameter that explicitly defines a `Content-Type`. That should be defined by the `consumes` field.](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#parameter-object)
			*/
			content_type_parameter?: Status

			/**
			[Flag any parameter that explicitly defines an `Accept` type. That should be defined by the `produces` field.](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#parameter-object)
			*/
			accept_type_parameter?: Status

			/**
			[Flag any parameter that explicitly defines an `Authorization` type. That should be defined by the `securityDefinitions`/`security` fields.](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#parameter-object)
			*/
			authorization_parameter?: Status
		}
		paths?: {
			/**
			For a path that contains path parameters, flag any operations that do not correctly define those parameters.
			*/
			missing_path_parameter?: Status

			/**
			Flag any path segment that does not use snake case.
			*/
			snake_case_only?: Status

			/**
			Flag any path segment that does not follow a given case convention. snake_case_only must be 'off' to use.
			*/
			paths_case_convention?: CaseConvention

			/**
			Flag any path parameters that have identical definitions in all operations.
			*/
			duplicate_path_parameter?: Status
		}
		responses?: {
			/**
			Flag any response object with a schema that doesn't reference a named model. Even if the model is only used once, naming it offers significant benefits for SDK generation.
			*/
			inline_response_schema?: Status
		}
		schemas?: {
			/**
			Flag any schema that does not follow the [data type/format rules.](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#parameter-object)
			*/
			invalid_type_format_pair?: Status

			/**
			Flag any property with a `name` that is not lower snake case.
			*/
			snake_case_only?: Status

			/**
			Flag any schema without a `description` field.
			*/
			no_schema_description?: Status

			/**
			Flag any schema that contains a 'property' without a `description` field.
			*/
			no_property_description?: Status

			/**
			Flag any schema with a 'property' description that mentions the word 'JSON'.
			*/
			description_mentions_json?: Status

			/**
			Flag any schema with a 'property' of type `array` with items of type `array`.
			*/
			array_of_arrays?: Status

			/**
			Flag any properties that have the same name but an inconsistent type.
			*/
			inconsistent_property_type?: [Status, Array<"code" | "default" | "type" | "value">] | ["off"]

			/**
			Flag any property with a `name` that does not follow a given case convention. snake_case_only must be 'off' to use.
			*/
			property_case_convention?: CaseConvention

			/**
			Flag any property with a `name` that is identical to another property's `name` except for the naming convention
			*/
			property_case_collision?: Status

			/**
			Flag any enum with a `value` that does not follow a given case convention. snake_case_only must be 'off' to use.
			*/
			enum_case_convention?: CaseConvention

			/**
			Flag any schema with undefined required properties
			*/
			undefined_required_properties?: Status
		}
		security_definitions?: {
			/**
			Flag any security scheme defined in securityDefinitions that is not used in the spec.
			*/
			unused_security_schemes?: Status

			/**
			Flag any security scope defined in securityDefinitions that is not used in the spec.
			*/
			unused_security_scopes?: Status
		}
		security?: {
			/**
			Flag any non-empty security array this is not of type OAuth2
			*/
			invalid_non_empty_security_array?: Status
		}
		walker?: {
			/**
			Flag any `description` field in the spec with an empty or whitespace string.
			*/
			no_empty_descriptions?: Status

			/**
			Flag any circular references found in the API document.
			*/
			has_circular_references?: Status

			/**
			Flag any properties that are siblings of a `$ref` property.
			*/
			$ref_siblings?: Status

			/**
			Flag descriptions sibling to `$ref` if identical to referenced description.
			*/
			duplicate_sibling_description?: Status

			/**
			Flag internal `$ref` values that do not point to the section they should (e.g. referencing `parameters` from a `schema` field).
			*/
			incorrect_ref_pattern?: Status
		}
	}
	swagger2?: {
		operations?: {
			/**
			Flag `put` or `post` operations that do not have a `consumes` field.
			*/
			no_consumes_for_put_or_post?: Status

			/**
			Flag `get` operations that contain a `consumes` field.
			*/
			get_op_has_consumes?: Status

			/**
			Flag operations that do not have a `produces` field (except for `head` and operations that return a 204).
			*/
			no_produces?: Status
		}
	}
	oas3?: {
		operations?: {
			/**
			Flag any operations with a non-form `requestBody` that does not have a name set with `x-codegen-request-body-name`.
			*/
			no_request_body_name?: Status
		}
		responses?: {
			/**
			Flag any response object that has no success response codes.
			*/
			no_success_response_codes?: Status

			/**
			Flag any response object that has both a 101 and success response code.
			*/
			protocol_switching_and_success_code?: Status

			/**
			Flag any non-204 success responses without a response body.
			*/
			no_response_body?: Status

			/**
			Flag any violations of status code conventions per IBM API Handbook
			*/
			ibm_status_code_guidelines?: Status
		}
		schemas?: {
			/**
			Flag parameters or application/json request/response bodies with schema type: string, format: binary.
			*/
			json_or_param_binary_string?: Status
		}
	}
	spectral?: {
		rules?: {
			/**
			Operation must have at least one `2xx` response. Any API operation (endpoint) can fail but presumably it is also meant to do something constructive at some point. If you forget to write out a success case for this API, then this rule will let you know.
			*/
			"operation-2xx-response"?: Status

			/**
			Every operation must have a unique `operationId`.

			Why? A lot of documentation systems use this as an identifier, some SDK generators convert them to a method name, all sorts of things like that.
			*/
			"operation-operationId-unique"?: Status

			/**
			Operation parameters are unique and non-repeating.

			1. Operations must have unique `name` + `in` parameters.
			2. Operation cannot have both `in: body` and `in: formData` parameters. (OpenAPI v2.0)
			3. Operation must have only one `in: body` parameter. (OpenAPI v2.0)
			*/
			"operation-parameters"?: Status

			/**
			Path parameters are correct and valid.

			1. For every parameters referenced in the path string (i.e: `/users/{userId}`), the parameter must be defined in either `path.parameters`, or `operation.parameters` objects (Non standard HTTP operations will be silently ignored.)
			2. every `path.parameters` and `operation.parameters` parameter must be used in the path string.
			*/
			"path-params"?: Status

			/**
			The info-contact rule will ask you to put in a contact object, and this rule will make sure it's full of the most useful properties: `name`, `url` and `email`.

			Putting in the name of the developer/team/department/company responsible for the API, along with the support email and help-desk/GitHub Issues/whatever URL means people know where to go for help. This can mean more money in the bank, instead of developers just wandering off or complaining online.
			*/
			"contact-properties"?: Status

			/**
			Info object should contain `contact` object.

			Hopefully your API description document is so good that nobody ever needs to contact you with questions, but that is rarely the case. The contact object has a few different options for contact details.
			*/
			"info-contact"?: Status

			/**
			OpenAPI object info `description` must be present and non-empty string.

			Examples can contain Markdown so you can really go to town with them, implementing getting started information like where to find authentication keys, and how to use them.
			*/
			"info-description"?: Status

			/**
			The `info` object should have a `license` key.

			It can be hard to pick a license, so if you don't have a lawyer around you can use [TLDRLegal](https://tldrlegal.com/) and [Choose a License](https://choosealicense.com/) to help give you an idea.

			How useful this is in court is not entirely known, but having a license is better than not having a license.
			*/
			"info-license"?: Status

			/**
			Mentioning a license is only useful if people know what the license means, so add a link to the full text for those who need it.
			*/
			"license-url"?: Status

			/**
			An object exposing a `$ref` property cannot be further extended with additional properties.
			*/
			"no-$ref-siblings"?: Status

			/**
			This rule protects against an edge case, for anyone bringing in description documents from third parties and using the parsed content rendered in HTML/JS. If one of those third parties does something shady like inject `eval()` JavaScript statements, it could lead to an XSS attack.
			*/
			"no-eval-in-markdown"?: Status

			/**
			This rule protects against a potential hack, for anyone bringing in description documents from third parties then generating HTML documentation. If one of those third parties does something shady like inject `<script>` tags, they could easily execute arbitrary code on your domain, which if it's the same as your main application could be all sorts of terrible.
			*/
			"no-script-tags-in-markdown"?: Status

			/**
			OpenAPI object should have alphabetical `tags`. This will be sorted by the `name` property.
			*/
			"openapi-tags-alphabetical"?: Status

			/**
			OpenAPI object should have non-empty `tags` array.

			Why? Well, you _can_ reference tags arbitrarily in operations, and definition is optional...

			```yaml
			/invoices/{id}/items:
			  get:
				tags:
				  - Invoice Items
			```

			Defining tags allows you to add more information like a `description`. For more information see tag-description.
			*/
			"openapi-tags"?: Status

			"operation-description"?: Status

			/**
			This operation ID is essentially a reference for the operation, which can be used to visually suggest a connection to other operations. This is like some theoretical static HATEOAS-style referencing, but it's also used for the URL in some documentation systems.

			Make the value `lower-hyphen-case`, and try and think of a name for the action which does not relate to the HTTP message. Base it off the actual action being performed. `create-polygon`? `search-by-polygon`? `filter-companies`?
			*/
			"operation-operationId"?: Status

			/**
			Seeing as operationId is often used for unique URLs in documentation systems, it's a good idea to avoid non-URL safe characters.
			*/
			"operation-operationId-valid-in-url"?: Status

			/**
			Use just one tag for an operation, which is helpful for some documentation systems which use tags to avoid duplicate content.
			*/
			"operation-singular-tag"?: Status

			/**
			Operation should have non-empty `tags` array.
			*/
			"operation-tags"?: Status

			/**
			Operation tags should be defined in global tags.
			*/
			"operation-tag-defined"?: Status

			/**
			Path parameter declarations cannot be empty, ex.`/given/{}` is invalid.
			*/
			"path-declarations-must-exist"?: Status

			/**
			Keep trailing slashes off of paths, as it can cause some confusion. Some web tooling (like mock servers, real servers, code generators, application frameworks, etc.) will treat `example.com/foo` and `example.com/foo/` as the same thing, but other tooling will not. Avoid any confusion by just documenting them without the slash, and maybe some tooling will let people shove a / on there when they're using it or maybe not, but at least the docs are suggesting how it should be done properly.
			*/
			"path-keys-no-trailing-slash"?: Status

			/**
			Don't put query string items in the path, they belong in parameters with `in: query`.
			*/
			"path-not-include-query"?: Status

			/**
			Tags alone are not very descriptive. Give folks a bit more information to work with.

			```yaml
			tags:
			  - name: "Aardvark"
				description: Funny nosed pig-head racoon.
			  - name: "Badger"
				description: Angry short-legged omnivores.
			```

			If your tags are business objects then you can use the term to explain them a bit. An 'Account' could be a user account, company information, bank account, potential sales lead, anything. What is clear to the folks writing the document is probably not as clear to others.

			```yaml
			tags:
			  - name: Invoice Items
				description: |+
				  Giant long explanation about what this business concept is, because other people _might_ not have a clue!
			```
			*/
			"tag-description"?: Status

			/**
			Enum values should respect the `type` specifier.
			*/
			"typed-enum"?: Status

			/**
			Each value of an `enum` must be different from one another.
			*/
			"duplicated-entry-in-enum"?: Status

			/**
			Operations with an `in: formData` parameter must include `application/x-www-form-urlencoded` or `multipart/form-data` in their `consumes` property.
			*/
			"oas2-operation-formData-consume-check"?: Status

			/**
			OpenAPI `host` must be present and non-empty string.
			*/
			"oas2-api-host"?: Status

			/**
			OpenAPI host `schemes` must be present and non-empty array.
			*/
			"oas2-api-schemes"?: Status

			/**
			Server URL should not point at example.com.
			*/
			"oas2-host-not-example"?: Status

			/**
			Server URL should not have a trailing slash.
			*/
			"oas2-host-trailing-slash"?: Status

			/**
			Operation `security` values must match a scheme defined in the `securityDefinitions` object.
			Ignores empty `security` values for cases where authentication is explicitly not required or optional.
			*/
			"oas2-operation-security-defined"?: Status

			/**
			Potential unused reusable `definition` entry has been detected.

			_Warning:_ This rule may identify false positives when linting a specification that acts as a library (a container storing reusable objects, leveraged by other specifications that reference those objects).
			*/
			"oas2-unused-definition"?: Status

			/**
			Examples must be valid against their defined schema.
			*/
			"oas2-valid-example"?: Status

			/**
			OpenAPI v3 keyword `anyOf` detected in OpenAPI v2 document.
			*/
			"oas2-anyOf"?: Status

			/**
			OpenAPI v3 keyword `oneOf` detected in OpenAPI v2 document.
			*/
			"oas2-oneOf"?: Status

			/**
			Validate structure of OpenAPI v2 specification.
			*/
			"oas2-schema"?: Status

			/**
			Parameter objects should have a `description`.
			*/
			"oas2-parameter-description"?: Status

			/**
			OpenAPI `servers` must be present and non-empty array.

			Share links to any and all servers that people might care about. If this is going to be given to internal people then usually that is localhost (so they know the right port number), staging, and production.

			```yaml
			servers:
			  - url: https://example.com/api
				description: Production server
			  - url: https://staging.example.com/			api
				description: Staging server
			  - url: http://localhost:3001
				description: Development server
			```

			If this is going out to the world, maybe have production and a general sandbox people can play with.
			*/
			"oas3-api-servers"?: Status

			/**
			Examples for `requestBody` or response examples can have an `externalValue` or a `value`, but they cannot have both.
			*/
			"oas3-examples-value-or-externalValue"?: Status

			/**
			Operation `security` values must match a scheme defined in the `components.securitySchemes` object.
			*/
			"oas3-operation-security-defined"?: Status

			/**
			Server URL should not point at example.com.

			We have example.com for documentation purposes here, but you should put in actual domains.
			*/
			"oas3-server-not-example.com"?: Status

			/**
			Server URL should not have a trailing slash.

			Some tooling forgets to strip trailing slashes off when it's joining the `servers.url` with `paths`, and you can get awkward URLs like `https://example.com/api//pets`. Best to just strip them off yourself.
			*/
			"oas3-server-trailing-slash"?: Status

			/**
			Potential unused reusable `components` entry has been detected.

			_Warning:_ This rule may identify false positives when linting a specification that acts as a library (a container storing reusable objects, leveraged by other specifications that reference those objects).
			*/
			"oas3-unused-component"?: Status

			/**
			Examples must be valid against their defined schema.
			*/
			"oas3-valid-example"?: Status

			/**
			Validate structure of OpenAPI v3 specification.
			*/
			"oas3-schema"?: Status

			/**
			Parameter objects should have a `description`.
			*/
			"oas3-parameter-description"?: Status

			/**
			Examples must be valid against their defined schema.
			*/
			"oas3-valid-media-example"?: Status

			/**
			Examples must be valid against their defined schema.
			*/
			"oas3-valid-schema-example"?: Status

			/**
			Checks for `content` entry for all request bodies and non-204 responses.
			*/
			"content-entry-provided"?: Status

			/**
			Any request or response body that has `content` should contain a schema.
			*/
			"content-entry-contains-schema"?: Status

			/**
			Should avoid the use of `*\/*` content type unless the API actually supports all content types. When the API does support all content types, this warning should be ignored.
			*/
			"ibm-content-type-is-specific"?: Status

			/**
			An error response likely returns `application/json` and this rule warns when `application/json` is not the content type. This rule should be ignored when the API actually returns an error response that is not `application/json`.
			*/
			"ibm-error-content-type-is-json"?: Status

			/**
			Validates the structure of the `x-sdk-operations`.
			*/
			"ibm-sdk-operations"?: Status

			/**
			Validates that every path contains a path segment for the API major version, of the form `v<n>`, and that all paths have the same major version segment. The major version can appear in either the server URL (oas3), the basePath (oas2), or in each path entry.
			*/
			"major-version-in-path"?: Status

			/**
			`4xx` and `5xx` error responses should provide good information to help the user resolve the error. The error response validations are based on the design principles outlined in the [errors section of the IBM API Handbook](https://cloud.ibm.com/docs/api-handbook?topic=api-handbook-errors). The `response-error-response-schema` rule is more lenient than what is outlined in the handbook. Specifically, the `response-error-response-schema` rule does not require an Error Container Model and allows for a single Error Model to be provided at the top level of the error response schema or in an `error` field.
			*/
			"response-error-response-schema"?: Status

			/**
			Parameters must provide either a schema or content object.
			*/
			"parameter-schema-or-content"?: Status

			/**
			Request bodies should be objects.
			*/
			"request-body-object"?: Status

			/**
			Response examples are used to generate documentation. To improve the generated documentation, response examples should be provided in the schema object or "next to" the schema object.
			*/
			"response-example-provided"?: Status
		}
	}
}

const spectral = new Spectral({
	computeFingerprint: computeSpectralFingerprint as () => string, // Actually returns a number but still works
})

function parseFileContents(contents: string, filepath: string): JsonObject {
	const fileExtension = path.extname(filepath).slice(1)

	if (fileExtension === "json") {
		return parseJson(contents) as JsonObject
	}

	if (fileExtension === "yaml" || fileExtension === "yml") {
		return (parseYaml as (input: string) => JsonObject)(contents)
	}

	throw new Error("Unable to parse file")
}

async function runInDirectory<ReturnValueType>(cwd: string, callback: () => Promise<ReturnValueType>): Promise<ReturnValueType> {
	const originalWorkingDirectory = process.cwd()
	process.chdir(cwd)
	const result = await callback()
	process.chdir(originalWorkingDirectory)
	return result
}

interface SwaggerSpec {
	specStr: string
	jsSpec: JsonObject
	resolvedSpec: JSONSchema4 | JSONSchema6
	circular: boolean
	settings: {
		schemas: [JSONSchema4]
		testSchema: JSONSchema4
	}
}

const buildSwagger = async (data: JsonObject, filepath: string): Promise<SwaggerSpec> => runInDirectory(path.dirname(filepath), async () => (buildSwaggerObject as (data: JsonObject) => Promise<SwaggerSpec>)(data))

const runSpectral = async (content: string, filepath: string) => runInDirectory(path.dirname(filepath), async () => spectral.run(content))

export interface LintMessage {
	path: string[]
	message: string
	rule: string
	line: number
}

export interface Result {
	version: string
	errors?: LintMessage[]
	warnings?: LintMessage[]
	infos?: LintMessage[]
	hints?: LintMessage[]
}

export async function lintFile(filepath: string, config: Options = {}): Promise<Result> {
	const contents = (preprocessFile as (contents: string) => string)(stripBom(await fs.readFile(filepath, "utf8")))
	const data = parseFileContents(contents, filepath)

	if (!(data.openapi || data.swagger === "2.0")) {
		throw new Error("Neither a `openapi` property nor a `swagger` property with the value of \"2.0\" was found")
	}

	config = (mergeOptions as <FirstValue, SecondValue>(a: FirstValue, b: SecondValue) => FirstValue & SecondValue)(defaultConfig, config)

	await (spectralValidator as {
		setup(spectral_: typeof spectral, rulesetFileOverride: readonly string[], configObject: Options): Promise<void>
	}).setup(spectral, null, config)

	return (formatResultsAsObject as (results: JsonObject, originalFile?: string, verbose?: boolean, errorsOnly?: boolean) => Result)(
		(validate as (allSpecs: SwaggerSpec, config: Options, spectralResults: IRuleResult[], debug?: boolean) => JsonObject)(
			await buildSwagger(data, filepath),
			config,
			await runSpectral(contents, filepath),
		),
		contents,
	)
}

const formatLine = ({ type, message, rule, line, maxLineWidth, maxMessageWidth }: {
	type: keyof typeof logSymbols
	message: string
	rule: string
	line: number
	maxLineWidth: number
	maxMessageWidth: number
}): string => `${logSymbols[type]} ${" ".repeat(maxLineWidth - stringWidth(line.toString()))}${chalk.grey(line)} ${message}${" ".repeat(maxMessageWidth - stringWidth(message))} ${chalk.grey(rule)}`

export function formatResults(results: Array<[string, Result]>): string {
	let output = "\n"
	let totalErrors = 0
	let totalWarnings = 0
	let totalInfos = 0
	let totalHints = 0
	let maxLineWidth = 0
	let maxMessageWidth = 0

	if (process.stdout.isTTY && !process.env.CI) {
		output += ansiEscapes.iTerm.setCwd()
	}

	results = results.map(([file, { version, errors = [], warnings = [], infos = [], hints = [] }]) => [file, {
		version,
		errors: errors.sort((a, b) => numberSortAscending(a.line, b.line)),
		warnings: warnings.sort((a, b) => numberSortAscending(a.line, b.line)),
		infos: infos.sort((a, b) => numberSortAscending(a.line, b.line)),
		hints: hints.sort((a, b) => numberSortAscending(a.line, b.line)),
	}])

	for (const [, { errors, warnings, infos, hints }] of results) {
		totalErrors += errors.length
		totalWarnings += warnings.length
		totalInfos += infos.length
		totalHints += hints.length

		maxLineWidth = Math.max(
			stringWidth(lastItem(errors)?.line.toString()),
			stringWidth(lastItem(warnings)?.line.toString()),
			stringWidth(lastItem(infos)?.line.toString()),
			stringWidth(lastItem(hints)?.line.toString()),
			maxLineWidth,
		)

		for (const { message } of [...errors, ...warnings]) {
			maxMessageWidth = Math.max(stringWidth(message), maxMessageWidth)
		}
	}

	if ((totalErrors + totalWarnings + totalInfos + totalHints) === 0) {
		return ""
	}

	output += results
		.sort(([, a], [, b]) => {
			if (a.errors.length === b.errors.length) {
				if (a.warnings.length === b.warnings.length) {
					if (a.infos.length === b.infos.length) {
						return b.hints.length - a.hints.length
					}

					return b.infos.length - a.infos.length
				}

				return b.warnings.length - a.warnings.length
			}

			return b.errors.length - a.errors.length
		})
		.map(([file, {
			errors,
			warnings,
			infos,
			hints,
		}]) => `${chalk.underline(file)}
${[...hints.map(({ message, rule, line }) => formatLine({
		type: "info",
		message,
		rule,
		line,
		maxLineWidth,
		maxMessageWidth,
	})),
	...infos.map(({ message, rule, line }) => formatLine({
		type: "info",
		message,
		rule,
		line,
		maxLineWidth,
		maxMessageWidth,
	})),
	...warnings.map(({ message, rule, line }) => formatLine({
		type: "warning",
		message,
		rule,
		line,
		maxLineWidth,
		maxMessageWidth,
	})),
	...errors.map(({ message, rule, line }) => formatLine({
		type: "error",
		message,
		rule,
		line,
		maxLineWidth,
		maxMessageWidth,
	}))].join("\n")}
`).join("\n")

	const statistics = []

	if (totalHints > 0) {
		statistics.push(`${chalk.cyan(`${totalHints} ${plur("hint", totalHints)}`)}`)
	}

	if (totalInfos > 0) {
		statistics.push(`${chalk.cyan(`${totalInfos} ${plur("info", totalInfos)}`)}`)
	}

	if (totalWarnings > 0) {
		statistics.push(`${chalk.yellow(`${totalWarnings} ${plur("warning", totalWarnings)}`)}`)
	}

	if (totalErrors > 0) {
		statistics.push(`${chalk.red(`${totalErrors} ${plur("error", totalErrors)}`)}`)
	}

	if (statistics.length > 0) {
		output += "\n" + statistics.join("\n")
	}

	return output
}
