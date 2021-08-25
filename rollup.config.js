// import { DEFAULT_EXTENSIONS } from "@babel/core";
import progress from "rollup-plugin-progress";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import babel from "@rollup/plugin-babel";
import nodeRequire from "@rollup/plugin-node-resolve";
import nodeExternals from "rollup-plugin-node-externals";
import replace from "rollup-plugin-replace";
import typescript from "rollup-plugin-typescript2";
import { DEFAULT_EXTENSIONS } from "@babel/core";

export default {
  input: "src/main.ts",
  output: [
    {
      file: "dist/bundle.js",
      format: "cjs",
    },
  ],
  external: [
    "@prisma/client",
    "discord.js",
    "express",
    "axios",
    "axios-cookiejar-support",
    "tough-cookie",
  ],
  plugins: [
    progress(),
    nodeExternals(),
    nodeRequire({
      browser: false,
      preferBuiltins: false,
    }),
    typescript({
      module: "ESNext",
      target: "ES2018",
      rollupCommonJSResolveHack: true,
    }),
    commonjs(),
    babel({
      babelHelpers: "bundled",
      extensions: [...DEFAULT_EXTENSIONS, ".ts"],
      exclude: "node_modules/**",
      plugins: ["@babel/plugin-proposal-optional-chaining"],
      presets: [["@babel/preset-env", { targets: { node: 12 } }]],
    }),
    // replace({
    //   values: { "require('../vvmc-helper.js')": "require('vvmc-helper.js')" },
    // }),
    json(),
  ],
};
