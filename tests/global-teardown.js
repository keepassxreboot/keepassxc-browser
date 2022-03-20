const fs = require('fs-extra');

const DEST = 'keepassxc-browser/tests';

module.exports = async config => {
    // Delete previously created temporary directory. Comment for re-running tests manually inside the extension.
    await fs.remove(DEST);
};
