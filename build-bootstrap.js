'use strict';

const autoprefixer = require('autoprefixer');
const postcssPresetEnv = require('postcss-preset-env');
const { writeFile } = require('fs');
const { render: renderScss } = require('node-sass');
const postcss = require('postcss');

const inFile = 'keepassxc-browser/styles/bootstrap.scss';
const outFile = 'keepassxc-browser/styles/bootstrap.css';

renderScss(
    {
      file: inFile
    },
    (err, result) => {
      if (err) {
        console.error('SCSS build failed:', err);
        return;
      }
      postcss([postcssPresetEnv, autoprefixer])
          .process(result.css, { from: undefined, to: outFile })
          .then(result => {
            writeFile(outFile, result.css, () => true);
          }, e => {
            console.error('postcss processing failed:', e)
          });
    }
);
