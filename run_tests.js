const firefox = require('selenium-webdriver/firefox'),
    webdriver = require('selenium-webdriver'),
    By = require('selenium-webdriver').By,
    test = require('selenium-webdriver/testing'),
    assert = require('selenium-webdriver/testing/assert'),
    fileUrl = require('file-url'),
    softAssert = require('soft-assert'),
    fs = require('fs-extra');

const DEST = 'keepassxc-browser/tests';
let browser;

test.before(async function(done) {
    // Create a temporary directory and copy tests/* to keepassxc-browser/tests
    await fs.ensureDir(DEST);
    await fs.copy('./tests', DEST);

    const options = new firefox.Options();
    options.addArguments('--headless');

    browser = await new webdriver.Builder().forBrowser('firefox').setFirefoxOptions(options).build();
    browser.get(fileUrl(`${DEST}/tests.html`));
    done();
});

test.after(async function() {
    softAssert.softAssertAll();
    browser.quit();

    // Delete previously created temporary directory. Comment for re-running tests manually inside the extension.
    await fs.remove(DEST);
});

test.describe('Content script tests', function() {
    test.it('General tests', function() {
        test.verifyResults('#general-results .fa');
    });

    test.it('Input field matching tests', function() {
        test.verifyResults('#input-field-results .fa');
    });

    test.it('Search field tests', function() {
        test.verifyResults('#search-field-results .fa');
    });

    test.it('TOTP field tests', function() {
        test.verifyResults('#totp-field-results .fa');
    });

    test.it('Password change tests', function() {
        test.verifyResults('#password-change-results .fa');
    });

    test.verifyResults = function(selector) {
        browser.findElements(By.css(selector)).then(elems => {
            elems.forEach(e => {
                e.getAttribute('class').then(async c => {
                    const next = await e.findElements(By.xpath('./following::span'));
                    assert(c).contains('fa-check', await next[0].getText());
                });
            });
        });
    };
});
