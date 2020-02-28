# JSON-Schema validator for Routes data  

There is a wide range of [JSON Schema validators](https://json-schema.org/implementations.html) available. Possibly the easiest is [ajv-cli](https://www.npmjs.com/package/ajv-cli).

To run: `ajv validate -s RouteGuide.schema.json -r "submodels/*.schema.json" -d testfile.json`
