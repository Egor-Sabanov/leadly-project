const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
function createTsLoader(overrides = {}) {
  const cache = new Map();
  const root = path.resolve(__dirname, "..");
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const shim = { exports: {} };
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    const sandbox = {
      module: shim,
      exports: shim.exports,
      require: (id) =>
        id.startsWith(".")
          ? load(path.resolve(path.dirname(file), id + ".ts"))
          : id.startsWith("@/")
            ? load(path.join(root, id.slice(2) + ".ts"))
            : require(id),
      process: { env: {} },
      Request,
      Response,
      Headers,
      URL,
      TextDecoder,
      TextEncoder,
      Uint8Array,
      Number,
      JSON,
      RangeError,
      SyntaxError,
      AbortSignal,
      fetch,
      ...overrides,
    };
    vm.runInNewContext(compiled, sandbox, { filename: file, timeout: 3000 });
    cache.set(file, shim.exports);
    return shim.exports;
  }
  return load;
}
module.exports = { createTsLoader };
