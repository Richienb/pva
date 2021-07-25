import type { Options } from "./index.js"

const defaultConfig: Options = {
	shared: {
		operations: {
			no_operation_id: "warning",
			operation_id_case_convention: ["off", "lower_camel_case"], // TODO: Remove second array item when https://github.com/IBM/openapi-validator/pull/313 is merged
			no_summary: "warning",
			parameter_order: "error",
			undefined_tag: "error",
			unused_tag: "error",
			operation_id_naming_convention: "off",
			no_array_responses: "off",
		},
		pagination: {
			pagination_style: "error",
		},
		parameters: {
			no_parameter_description: "hint",
			param_name_case_convention: ["off"],
			invalid_type_format_pair: "error",
			content_type_parameter: "error",
			accept_type_parameter: "error",
			authorization_parameter: "error",
			required_param_has_default: "error",
		},
		paths: {
			missing_path_parameter: "error",
			duplicate_path_parameter: "error",
			paths_case_convention: ["off"],
		},
		responses: {
			inline_response_schema: "off",
		},
		security_definitions: {
			unused_security_schemes: "error",
			unused_security_scopes: "error",
		},
		security: {
			invalid_non_empty_security_array: "error",
		},
		schemas: {
			invalid_type_format_pair: "off",
			snake_case_only: "off",
			no_schema_description: "hint",
			no_property_description: "hint",
			description_mentions_json: "off",
			array_of_arrays: "off",
			property_case_convention: ["off"],
			property_case_collision: "warning",
			enum_case_convention: ["off"],
			undefined_required_properties: "error",
			inconsistent_property_type: ["off"],
		},
		walker: {
			no_empty_descriptions: "error",
			has_circular_references: "warning",
			$ref_siblings: "off",
			duplicate_sibling_description: "error",
			incorrect_ref_pattern: "error",
		},
	},
	swagger2: {
		operations: {
			no_consumes_for_put_or_post: "error",
			get_op_has_consumes: "warning",
			no_produces: "warning",
		},
	},
	oas3: {
		operations: {
			no_request_body_name: "off",
		},
		responses: {
			no_success_response_codes: "warning",
			protocol_switching_and_success_code: "error",
			no_response_body: "error",
			ibm_status_code_guidelines: "off",
		},
		schemas: {
			json_or_param_binary_string: "error",
		},
	},
	spectral: {
		rules: {
			"no-eval-in-markdown": "error",
			"no-script-tags-in-markdown": "error",
			"openapi-tags": "warning",
			"operation-description": "hint",
			"operation-tags": "warning",
			"operation-tag-defined": "warning",
			"path-keys-no-trailing-slash": "error",
			"typed-enum": "error",
			"request-body-object": "off",
			"oas2-api-host": "error",
			"oas2-api-schemes": "error",
			"oas2-host-trailing-slash": "error",
			"oas2-valid-example": "error",
			"oas2-anyOf": "error",
			"oas2-oneOf": "error",
			"oas3-api-servers": "off",
			"oas3-examples-value-or-externalValue": "error",
			"oas3-server-trailing-slash": "error",
			"oas3-valid-example": "error",
			"oas3-valid-schema-example": "off",
			"response-example-provided": "hint",
			"response-error-response-schema": "off",
			"content-entry-contains-schema": "error",
			"content-entry-provided": "off", // Conflicts with no_response_body
		},
	},
}

export default defaultConfig
