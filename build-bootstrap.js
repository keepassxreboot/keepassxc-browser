"use strict";

const autoprefixer = require("autoprefixer");
const postcssPresetEnv = require("postcss-preset-env");
const { writeFile } = require("fs");
const { render: renderScss } = require("node-sass");
const postcss = require("postcss");
const CleanCSS = require("clean-css");

const inFile = "keepassxc-browser/styles/bootstrap.scss";
const outFile = "keepassxc-browser/styles/bootstrap.css";

function buildBootstrap() {
    renderScss({ file: inFile }, (err, result) => {
        if (err) {
            console.error("SCSS build failed:", err);
            return;
        }
        postcss([postcssPresetEnv, autoprefixer])
            .process(result.css, { from: undefined, to: outFile })
            .then(
                result => {
                    const minifiedCssResult = new CleanCSS({level: 2}).minify(result.content);
                    writeFile(outFile, minifiedCssResult.styles, () => true);
                },
                e => console.error("postcss processing failed:", e)
            );
    });
}
exports.buildBootstrap = buildBootstrap;

if (require.main === module) {
    buildBootstrap();
}
