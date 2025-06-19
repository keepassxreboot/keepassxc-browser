#!/usr/bin/env node
'use strict';

const fs = require('@npmcli/fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const DEST = 'keepassxc-browser';
const DEFAULT = 'manifest_default.json';
const BROWSERS = {
    'Firefox': 'manifest_firefox.json',
    'Chromium': 'manifest_chromium.json',
    'Safari': 'manifest_safari.json'
};

const getVersion = async () => {
    const manifestFile = await fs.readFile(DEFAULT, { encoding: 'utf8' });
    const data = JSON.parse(manifestFile);
    return data['version'];
};

const setVersion = async (manifest, version) => {
    const manifestFile = await fs.readFile(manifest, { encoding: 'utf8' });
    const data = JSON.parse(manifestFile);

    data['version'] = version;
    if (Object.hasOwn(data, 'version_name')) {
        data['version_name'] = version;
    }
    fs.writeFile(manifest, JSON.stringify(data, null, 4));
};

const getDestinationFilename = async (manifest, version) => {
    const browser = manifest.substring(manifest.indexOf('_') + 1, manifest.indexOf('.'));
    return `keepassxc-browser_${version}_${browser}.zip`;
};

const updateTranslations = async () => {
    console.log('Pulling translations from Transifex, please wait...');
    const { stdout } = await exec('tx pull -af');
    console.log(stdout);
};

const createZipFile = async (fileName, path) => {
    await exec(`cd ${path} && tar -a -cf ../${fileName} * && cd ..`);
};

(async() => {
    const params = process.argv.slice(2);
    if (!params.includes('--skip-translations')) {
        await updateTranslations();
    }

    await fs.copyFile(`${DEST}/manifest.json`, `./${DEFAULT}`);
    const version = await getVersion();

    for (const browser in BROWSERS) {
        if (params.includes('--safari-web-extension') && browser !== 'Safari') {
            continue;
        }

        console.log(`KeePassXC-Browser: Creating extension package for ${browser}`);

        const fileName = await getDestinationFilename(BROWSERS[browser], version);
        setVersion(`./dist/${BROWSERS[browser]}`, version);
        await fs.copyFile(`./dist/${BROWSERS[browser]}`, `${DEST}/manifest.json`);

        if (await fs.exists(fileName)) {
            await fs.rm(fileName);
        }

        if (params.includes('--safari-web-extension') && browser === 'Safari' && params.includes('-o')) {
            let outputPath = params[params.indexOf('-o') + 1]

            if (!outputPath) {
                console.error('No ouput path specified!');
                return;
            }

            await fs.cpSync(DEST, outputPath, { recursive: true })
        } else {
            await createZipFile(fileName, DEST);
        }

        console.log('Done');
    }

    fs.renameSync(DEFAULT, `${DEST}/manifest.json`);
})();
