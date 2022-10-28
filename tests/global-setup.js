const fs = require('@npmcli/fs');

const DEST = 'keepassxc-browser/tests';

module.exports = async config => {
    // Create a temporary directory and copy tests/* to keepassxc-browser/tests
    await fs.exists(DEST);
    await fs.cp('./tests', DEST, { recursive: true });
};
