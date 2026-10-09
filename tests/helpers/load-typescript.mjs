import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

/** Load the actual server module with only its provider/database boundaries mocked. */
export function loadTypescript(filename, mocks = {}) {
  const cache = new Map();
  const root = path.resolve("src");
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const realRequire = createRequire(file);
    function requireModule(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "server-only") return {};
      let target;
      if (name.startsWith("@/")) target = path.join(root, name.slice(2));
      else if (name.startsWith(".")) target = path.resolve(path.dirname(file), name);
      if (target) {
        if (target.endsWith(".mjs") || target.endsWith(".js")) return realRequire(target);
        if (!existsSync(target)) target += ".ts";
        return load(target);
      }
      return realRequire(name);
    }
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: file,
    });
    const execute = vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${outputText}\n})`, { filename: file });
    execute(requireModule, module, module.exports, file, path.dirname(file));
    return module.exports;
  }
  return load(path.resolve(filename));
}
