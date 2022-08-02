#!/usr/bin/env node
'use strict';

const fs = require('@npmcli/fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const zaf = require('zip-a-folder');

const DEST = 'keepassxc-browser';
const DEFAULT = 'manifest_default.json';
const BROWSERS = {
    'Firefox': 'manifest_firefox.json',
    'Chromium': 'manifest_chromium.json',
};

async function getDestinationFilename(manifest) {
    const manifestFile = await fs.readFile(DEFAULT, { encoding: 'utf8' });
    const data = JSON.parse(manifestFile);
    const browser = manifest.substring(manifest.indexOf('_') + 1, manifest.indexOf('.'));

    return `keepassxc-browser_${data['version']}_${browser}.zip`;
}

async function updateTranslations() {
    console.log('Pulling translations from Transifex, please wait...');
    const { stdout } = await exec('tx pull -af');
    console.log(stdout);
}

(async() => {
    const params = process.argv.slice(2);
    if (!params.includes('--skip-translations')) {
        await updateTranslations();
    }

    await fs.copyFile(`${DEST}/manifest.json`, `./${DEFAULT}`);

    for (const browser in BROWSERS) {
        console.log(`KeePassXC-Browser: Creating extension package for ${browser}`);

        const fileName = await getDestinationFilename(BROWSERS[browser]);
        await fs.copyFile(`./dist/${BROWSERS[browser]}`, `${DEST}/manifest.json`);

        if (await fs.exists(fileName)) {
            await fs.rm(fileName);
        }

        await zaf.zip(DEST, fileName);
        console.log('Done');
    }

    fs.renameSync(DEFAULT, `${DEST}/manifest.json`);
})();
