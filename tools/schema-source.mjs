import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";

const options = { strict: true, allErrors: true, allowUnionTypes: true, validateFormats: false };
const draft7 = new Ajv(options);
const draft2020 = new Ajv2020(options);
const cache = new Map();

export function compileSchema(schema) {
  if (schema?.$async) throw new TypeError("Async schemas are not supported.");
  const key = JSON.stringify(schema);
  if (cache.has(key)) return cache.get(key);
  const ajv = schema.$schema?.includes("2020-12") ? draft2020 : draft7;
  const validate = ajv.compile(schema);
  if (validate.$async) throw new TypeError("Async schemas are not supported.");
  if (cache.size >= 64) cache.clear();
  cache.set(key, validate);
  return validate;
}

export function schemaErrors(value, schema) {
  const validate = compileSchema(schema);
  if (validate(value)) return [];
  return (validate.errors ?? []).slice(0, 20).map((error) =>
    `${error.instancePath || "/"} ${error.message}`
  );
}
