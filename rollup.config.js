// import { DEFAULT_EXTENSIONS } from "@babel/core";
import progress from "rollup-plugin-progress";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeRequire from "@rollup/plugin-node-resolve";
import nodeExternals from "rollup-plugin-node-externals";
import replace from "rollup-plugin-replace";
import typescript from "rollup-plugin-typescript2";

export default {
  input: "src/main.ts",
  output: [
    {
      file: "dist/bundle.js",
      format: "cjs",
    },
  ],
  external: ["discord.js"],
  plugins: [
    progress(),
    nodeExternals(),
    nodeRequire({
      browser: false,
      preferBuiltins: false,
    }),
    typescript({
      module: "ESNext",
      target: "ESNext",
      rollupCommonJSResolveHack: true,
    }),
    commonjs(),
    // replace({
    //   values: { "require('../vvmc-helper.js')": "require('vvmc-helper.js')" },
    // }),
    json(),
  ],
};
