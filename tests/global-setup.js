const fs = require('fs-extra');

const DEST = 'keepassxc-browser/tests';

module.exports = async config => {
    // Create a temporary directory and copy tests/* to keepassxc-browser/tests
    await fs.ensureDir(DEST);
    await fs.copy('./tests', DEST);
};
