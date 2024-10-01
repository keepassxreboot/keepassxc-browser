'use strict';

const options = {};

const $ = function(elem) {
    return document.querySelector(elem);
};

options.initMenu = function() {
    const tabs = [].slice.call(document.querySelectorAll('div.tab'));
    const sideBarLinks = [].slice.call(document.querySelectorAll('.sidebar ul.nav li a'));

    sideBarLinks.forEach(function(elem) {
        elem.addEventListener('click', function(e) {
            sideBarLinks.forEach(t => t.parentElement.classList.remove('active'));
            elem.parentElement.classList.add('active');
            tabs.forEach(t => t.hide());

            const activatedTab = $('div.tab#tab-' + elem.getAttribute('href').substring(1));
            activatedTab.classList.remove('d-none');
            activatedTab.show();
        });
    });

    $('div.tab').show();

    if (window.location.hash !== '') {
        document.querySelector(`a[href='${window.location.hash}']`)?.click();
    }
};

options.saveSetting = async function(name) {
    const id = '#' + name;
    $(id).closest('.control-group').removeClass('error').addClass('success');
    setTimeout(() => {
        $(id).closest('.control-group').removeClass('success');
    }, 2500);

    await browser.storage.local.set({ 'settings': options.settings });
    await browser.runtime.sendMessage({
        action: 'load_settings'
    });
};

options.saveSettings = async function() {
    await browser.storage.local.set({ 'settings': options.settings });
    const settings = await browser.runtime.sendMessage({
        action: 'load_settings'
    });

    return settings;
};

options.saveKeyRing = async function() {
    await browser.storage.local.set({ 'keyRing': options.keyRing });
    await browser.runtime.sendMessage({
        action: 'load_keyring'
    });
};

options.initGeneralSettings = async function() {
    const changeCheckboxValue = async function(e) {
        const name = e.currentTarget.name;
        const isChecked = e.currentTarget.checked;
        options.settings[name] = isChecked;

        const updated = await options.saveSettings();
        if (name === 'autoFillAndSend') {
            browser.runtime.sendMessage({ action: 'init_http_auth' });
        } else if (name === 'defaultGroupAlwaysAsk') {
            $('#defaultGroup').disabled = isChecked;
            $('#defaultGroupButton').disabled = isChecked;
            $('#defaultGroupButtonReset').disabled = isChecked;
        } else if (name === 'autoReconnect') {
            const message = updated.autoReconnect ? 'enable_automatic_reconnect' : 'disable_automatic_reconnect';
            browser.runtime.sendMessage({ action: message });
        } else if (name === 'useMonochromeToolbarIcon') {
            browser.runtime.sendMessage({ action: 'update_popup' });
        }
    };

    const changeRadioValue = function(e) {
        options.settings[e.currentTarget.name] = Number(e.currentTarget.value);
        options.saveSettings();
    };

    $('#tab-general-settings select#colorTheme').value = options.settings['colorTheme'];

    const generalSettingsCheckboxes = document.querySelectorAll('#tab-general-settings input[type=checkbox]');
    for (const checkbox of generalSettingsCheckboxes) {
        checkbox.checked = options.settings[checkbox.name];

        if (checkbox.name === 'defaultGroupAlwaysAsk' && checkbox.checked) {
            $('#defaultGroup').disabled = true;
            $('#defaultGroupButton').disabled = true;
            $('#defaultGroupButtonReset').disabled = true;
        }

        checkbox.addEventListener('click', changeCheckboxValue);
    }

    $('#tab-general-settings input[type=radio]#checkUpdateThreeDays').value = CHECK_UPDATE_THREE_DAYS;
    $('#tab-general-settings input[type=radio]#checkUpdateOneWeek').value = CHECK_UPDATE_ONE_WEEK;
    $('#tab-general-settings input[type=radio]#checkUpdateOneMonth').value = CHECK_UPDATE_ONE_MONTH;
    $('#tab-general-settings input[type=radio]#checkUpdateNever').value = CHECK_UPDATE_NEVER;

    $('#tab-general-settings input[type=range]').value = options.settings['redirectAllowance'];
    $('#redirectAllowanceLabel').textContent = tr('optionsRedirectAllowance',
        options.settings['redirectAllowance'] === 11 ? 'Infinite' : String(options.settings['redirectAllowance']));

    $('#tab-general-settings select#credentialSorting').value = options.settings['credentialSorting'];
    $('#tab-general-settings select#afterFillSorting').value = options.settings['afterFillSorting'];
    $('#tab-general-settings select#afterFillSortingTotp').value = options.settings['afterFillSortingTotp'];
    $('#tab-general-settings input#defaultGroup').value = options.settings['defaultGroup'];
    $('#tab-general-settings input#defaultPasskeyGroup').value = options.settings['defaultPasskeyGroup'];
    $('#tab-general-settings input#clearCredentialTimeout').value = options.settings['clearCredentialsTimeout'];

    const generalSettingsRadioInputs = document.querySelectorAll('#tab-general-settings input[type=radio]');
    for (const radio of generalSettingsRadioInputs) {
        if (radio.value === String(options.settings[radio.name])) {
            radio.checked = true;
        }

        radio.addEventListener('click', changeRadioValue);
    }

    $('#tab-general-settings select#colorTheme').addEventListener('change', async function(e) {
        options.settings['colorTheme'] = e.currentTarget.value;
        // The theme is also stored in localStorage to prevent a white flash when the settings are first opened
        localStorage.setItem('colorTheme', options.settings['colorTheme']);
        await options.saveSettings();
        options.updateTheme();
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (options.settings['colorTheme'] === 'system') {
            options.updateTheme();
        }
    });

    $('#tab-general-settings select#credentialSorting').addEventListener('change', async function(e) {
        options.settings['credentialSorting'] = e.currentTarget.value;
        await options.saveSettings();
    });

    $('#tab-general-settings select#afterFillSorting').addEventListener('change', async function(e) {
        options.settings['afterFillSorting'] = e.currentTarget.value;
        await options.saveSettings();
    });

    $('#tab-general-settings select#afterFillSortingTotp').addEventListener('change', async function(e) {
        options.settings['afterFillSortingTotp'] = e.currentTarget.value;
        await options.saveSettings();
    });

    $('#tab-general-settings input#clearCredentialTimeout').addEventListener('change', async function(e) {
        if (e.target.valueAsNumber < 0 || e.target.valueAsNumber > 3600) {
            return;
        }

        options.settings['clearCredentialsTimeout'] = e.target.valueAsNumber;
        await options.saveSettings();
    });

    // Change label text dynamically with the range input
    $('#tab-general-settings input[type=range]').addEventListener('input', function(e) {
        const currentValue = e.target.valueAsNumber === 11 ? 'Infinite' : e.target.value;
        $('#redirectAllowanceLabel').textContent = tr('optionsRedirectAllowance', currentValue);
    });

    // Only save the setting when mouse is released from the range input
    $('#tab-general-settings input[type=range]').addEventListener('change', async function(e) {
        options.settings['redirectAllowance'] = e.target.valueAsNumber;
        await options.saveSettings();
    });

    await browser.runtime.sendMessage({
        action: 'get_keepassxc_versions'
    }).then(options.showKeePassXCVersions);

    $('#tab-general-settings button.checkUpdateKeePassXC').addEventListener('click', function(e) {
        e.preventDefault();
        e.disabled = true;

        browser.runtime.sendMessage({
            action: 'check_update_keepassxc'
        }).then(options.showKeePassXCVersions);
    });

    browser.commands.getAll().then(function(commands) {
        commands.forEach(function(command) {
            const shortcut = document.getElementById(`${command.name}-shortcut`);
            if (!shortcut) {
                return;
            }
            shortcut.textContent = command.shortcut || 'not configured';
        });
    });

    $('#configureCommands').addEventListener('click', function() {
        const scheme = isEdge() ? 'edge' : 'chrome';
        browser.tabs.create({
            url: isFirefox() ? browser.runtime.getURL('options/shortcuts.html') : `${scheme}://extensions/shortcuts`
        });
    });

    // Default group
    $('#defaultGroupButton').addEventListener('click', async function() {
        const value = $('#defaultGroup').value;
        options.settings['defaultGroup'] = (value.length > 0 ? value : '');
        await options.saveSettings();
    });

    $('#defaultGroupButtonReset').addEventListener('click', async function() {
        $('#defaultGroup').value = '';
        options.settings['defaultGroup'] = '';
        await options.saveSettings();
    });

    // Default passkey group
    $('#defaultPasskeyGroupButton').addEventListener('click', async function() {
        const value = $('#defaultPasskeyGroup').value;
        options.settings['defaultPasskeyGroup'] = (value.length > 0 ? value : '');
        await options.saveSettings();
    });

    $('#defaultPasskeyGroupButtonReset').addEventListener('click', async function() {
        $('#defaultPasskeyGroup').value = '';
        options.settings['defaultPasskeyGroup'] = '';
        await options.saveSettings();
    });

    let temporarySettings;
    const dialogImportSettingsModal = new bootstrap.Modal('#dialogImportSettings',
        { keyboard: true, focus: false, backdrop: true });

    $('#dialogImportSettings').addEventListener('shown.bs.modal', function(modalEvent) {
        modalEvent.currentTarget.querySelector('.modal-footer button.yes').focus();
    });

    $('#importSettingsButton').addEventListener('click', function() {
        const link = document.createElement('input');
        link.setAttribute('type', 'file');
        link.onchange = function(e) {
            const reader = new FileReader();

            if (e.target.files.length > 0) {
                reader.readAsText(e.target.files[0]);
            }

            reader.onloadend = function(ev) {
                try {
                    const contents = JSON.parse(ev.target.result);

                    // A quick check that this is the KeePassXC-Browser settings file
                    if (contents['checkUpdateKeePassXC'] === undefined
                        || contents['autoCompleteUsernames'] === undefined
                        || contents['autoFillAndSend'] === undefined) {
                        console.log('Error: Not a KeePassXC-Browser settings file.');
                        return;
                    }

                    // Verify the import
                    temporarySettings = contents;
                    dialogImportSettingsModal.show();
                } catch (err) {
                    console.log('Error loading JSON settings file.');
                }
            };
        };

        link.click();
    });

    $('#exportSettingsButton').addEventListener('click', function() {
        const link = document.createElement('a');
        const file = new Blob([ JSON.stringify(options.settings) ], { type: 'application/json' });
        link.href = URL.createObjectURL(file);
        link.download = 'keepassxc-browser_settings.json';
        link.click();
    });

    $('#dialogImportSettings .modal-footer button.yes').addEventListener('click', function(e) {
        dialogImportSettingsModal.hide();

        if (temporarySettings) {
            options.settings = temporarySettings;
            options.saveSettings();
        }
    });

    $('#copyVersionToClipboard').addEventListener('click', function () {
        const copyText = document.getElementById('versionInfo').innerText;
        navigator.clipboard.writeText(copyText);
    });

    // Add predefined sites to the <details> list
    const siteListing = $('#predefinedSiteList');
    if (siteListing) {
        // From sites.js
        for (const site of PREDEFINED_SITELIST) {
            const elem = document.createElement('span');
            elem.textContent = site;
            elem.classList.add('form-text');
            elem.classList.add('px-3');
            siteListing.append(elem);
            siteListing.append(document.createElement('br'));
        }
    }
};

// Also hides/disables any options with KeePassXC versions that are too old
options.showKeePassXCVersions = async function(response) {
    if (response.current === '') {
        response.current = 'unknown';
    }
    if (response.latest === '') {
        response.latest = 'unknown';
    }

    $('#tab-general-settings .kphVersion span.yourVersion').textContent = response.current;
    $('#tab-general-settings .kphVersion span.latestVersion').textContent = response.latest;
    $('#tab-about span.versionKPH').textContent = response.current;
    $('#tab-about span.kpxcVersion').textContent = response.current;
    $('#tab-general-settings button.checkUpdateKeePassXC').disabled = false;

    // Hide/disable certain options with older KeePassXC versions than 2.6.0
    const version260Result = await browser.runtime.sendMessage({
        action: 'compare_version',
        args: [ '2.6.0', response.current ]
    });

    if (version260Result) {
        $('#tab-general-settings #versionRequiredAlert').hide();
    } else {
        $('#tab-general-settings #showGroupNameInAutocomplete').disabled = true;
    }

    // Hide certain options with older KeePassXC versions than 2.7.0
    const version270Result = await browser.runtime.sendMessage({
        action: 'compare_version',
        args: [ '2.7.0', response.current ]
    });

    if (!version270Result) {
        $('#tab-general-settings #downloadFaviconAfterSaveFormGroup').hide();
    }

    // Hide certain options with older KeePassXC versions than 2.7.7
    const version277Result = await browser.runtime.sendMessage({
        action: 'compare_version',
        args: [ '2.7.7', response.current ]
    });

    if (!version277Result) {
        $('#tab-general-settings #passkeysOptionsCard').hide();
    }

    const version2710Result = await browser.runtime.sendMessage({
        action: 'compare_version',
        args: [ '2.7.10', response.current ]
    });

    // Hide passkeys default group option with KeePassXC version < 2.7.10
    if (!version2710Result) {
        $('#tab-general-settings #passkeysDefaultGroup').hide();
    }

};

options.getPartiallyHiddenKey = function(key) {
    return !key ? 'Error' : (key.substr(0, 8) + '*'.repeat(10));
};

options.initConnectedDatabases = function() {
    const dialogDeleteConnectedDatabaseModal = new bootstrap.Modal('#dialogDeleteConnectedDatabase',
        { keyboard: true, focus: false, backdrop: true });

    $('#dialogDeleteConnectedDatabase').addEventListener('shown.bs.modal', function(modalEvent) {
        modalEvent.currentTarget.querySelector('.modal-footer button.yes').focus();
    });

    $('#dialogDeleteConnectedDatabase .modal-footer button.yes').addEventListener('click', async function(e) {
        dialogDeleteConnectedDatabaseModal.hide();

        const hash = $('#dialogDeleteConnectedDatabase').getAttribute('hash');
        $('#tab-connected-databases #tr-cd-' + hash).remove();

        delete options.keyRing[hash];
        options.saveKeyRing();
        hashList = options.keyRing;

        // Force reconnect so the extension will disconnect the current database
        await browser.runtime.sendMessage({ action: 'reconnect' }).catch(err => {
            console.log(err);
        });

        browser.runtime.sendMessage({ action: 'update_popup' });
    });

    const removeButtonClicked = function(e) {
        e.preventDefault();

        const closestTr = this.closest('tr');
        $('#dialogDeleteConnectedDatabase').setAttribute('hash', closestTr.getAttribute('hash'));
        $('#dialogDeleteConnectedDatabase').setAttribute('tr-id', closestTr.getAttribute('id'));

        const identifier = $('#dialogDeleteConnectedDatabase .modal-body strong');
        if (identifier) {
            identifier.textContent = closestTr.children[0].textContent;
        }

        dialogDeleteConnectedDatabaseModal.show();
    };

    const rowClone = $('#tab-connected-databases table tr.clone').cloneNode(true);
    rowClone.classList.remove('clone', 'd-none');

    const addHashToTable = function(hash) {
        const row = rowClone.cloneNode(true);
        row.setAttribute('hash', hash);
        row.setAttribute('id', 'tr-cd-' + hash);

        const lastUsed = options.keyRing[hash].lastUsed
            ? new Date(options.keyRing[hash].lastUsed).toLocaleString()
            : 'unknown';
        const date = options.keyRing[hash].created
            ? new Date(options.keyRing[hash].created).toLocaleDateString()
            : 'unknown';

        row.children[0].textContent = options.keyRing[hash].id;
        row.children[1].textContent = options.getPartiallyHiddenKey(options.keyRing[hash].key);
        row.children[2].textContent = lastUsed;
        row.children[3].textContent = date;
        row.children[4].addEventListener('click', removeButtonClicked);

        $('#tab-connected-databases table tbody').append(row);
    };

    let hashList = options.keyRing;
    for (const hash in hashList) {
        addHashToTable(hash);
    }

    $('#connect-button').addEventListener('click', async function() {
        const result = await browser.runtime.sendMessage({ action: 'associate' });

        if (result === AssociatedAction.NEW_ASSOCIATION) {
            // Update the connection list with the added hash
            options.keyRing = await browser.runtime.sendMessage({ action: 'load_keyring' });

            // This one is the first hash added
            if (Object.keys(options.keyRing).length === 1) {
                addHashToTable(Object.keys(options.keyRing)[0]);
                hashList = options.keyRing;
                return;
            }

            for (const hash in hashList) {
                const newHash = Object.keys(options.keyRing).find(h => h !== hash);
                addHashToTable(newHash);
            }
        }
    });
};

options.initCustomLoginFields = function() {
    const dialogDeleteCustomLoginFieldsModal = new bootstrap.Modal('#dialogDeleteCustomLoginFields',
        { keyboard: true, focus: false, backdrop: true });

    $('#dialogDeleteCustomLoginFields').addEventListener('shown.bs.modal', function(modalEvent) {
        modalEvent.currentTarget.querySelector('.modal-footer button.yes').focus();
    });

    const removeButtonClicked = function(e) {
        e.preventDefault();

        const closestTr = this.closest('tr');
        $('#dialogDeleteCustomLoginFields').setAttribute('url', closestTr.getAttribute('url'));
        $('#dialogDeleteCustomLoginFields').setAttribute('tr-id', closestTr.getAttribute('id'));
        $('#dialogDeleteCustomLoginFields .modal-body strong').textContent = closestTr.children[0].textContent;

        dialogDeleteCustomLoginFieldsModal.show();
    };

    $('#dialogDeleteCustomLoginFields .modal-footer button.yes').addEventListener('click', function(e) {
        dialogDeleteCustomLoginFieldsModal.hide();

        const url = $('#dialogDeleteCustomLoginFields').getAttribute('url');
        const trId = $('#dialogDeleteCustomLoginFields').getAttribute('tr-id');
        $('#tab-custom-fields #' + trId).remove();

        delete options.settings['defined-custom-fields'][url];
        options.saveSettings();
    });

    const rowClone = $('#tab-custom-fields table tr.clone').cloneNode(true);
    rowClone.classList.remove('clone', 'd-none');
    let counter = 1;

    for (const url in options.settings['defined-custom-fields']) {
        const row = rowClone.cloneNode(true);
        row.setAttribute('url', url);
        row.setAttribute('id', 'tr-clf' + counter);
        ++counter;

        row.children[0].textContent = url;
        row.children[1].addEventListener('click', removeButtonClicked);
        $('#tab-custom-fields table tbody').append(row);
    }
};

options.initSitePreferences = function() {
    if (!options.settings['sitePreferences']) {
        options.settings['sitePreferences'] = [];
    }

    const dialogDeleteSiteModal = new bootstrap.Modal('#dialogDeleteSite',
        { keyboard: true, focus: false, backdrop: true });

    $('#dialogDeleteSite').addEventListener('shown.bs.modal', function(modalEvent) {
        modalEvent.currentTarget.querySelector('.modal-footer button.yes').focus();
    });

    const removeButtonClicked = function(e) {
        e.preventDefault();

        const closestTr = this.closest('tr');
        $('#dialogDeleteSite').setAttribute('url', closestTr.getAttribute('url'));
        $('#dialogDeleteSite').setAttribute('tr-id', closestTr.getAttribute('id'));
        $('#dialogDeleteSite .modal-body strong').textContent = closestTr.children[0].textContent;

        dialogDeleteSiteModal.show();
    };

    const checkboxClicked = function() {
        const closestTr = this.closest('tr');
        const url = closestTr.getAttribute('url');

        for (const site of options.settings['sitePreferences']) {
            if (site.url === url) {
                if (this.name === 'usernameOnly') {
                    site.usernameOnly = this.checked;
                } else if (this.name === 'improvedFieldDetection') {
                    site.improvedFieldDetection = this.checked;
                } else if (this.name === 'allowIframes') {
                    site.allowIframes = this.checked;
                }
            }
        }

        options.saveSettings();
    };

    const selectionChanged = function() {
        const closestTr = this.closest('tr');
        const url = closestTr.getAttribute('url');

        for (const site of options.settings['sitePreferences']) {
            if (site.url === url) {
                site.ignore = this.value;
            }
        }

        options.saveSettings();
    };

    const addNewRow = function(rowClone, newIndex, url, ignore, usernameOnly, improvedFieldDetection, allowIframes) {
        const row = rowClone.cloneNode(true);
        row.setAttribute('url', url);
        row.setAttribute('id', 'tr-scf' + newIndex);
        row.children[0].textContent = url;
        row.children[1].children[0].value = ignore;
        row.children[1].children[0].addEventListener('change', selectionChanged);
        row.children[2].children['usernameOnly'].checked = usernameOnly;
        row.children[2].children['usernameOnly'].addEventListener('change', checkboxClicked);
        row.children[3].children['improvedFieldDetection'].checked = improvedFieldDetection;
        row.children[3].children['improvedFieldDetection'].addEventListener('change', checkboxClicked);
        row.children[4].children['allowIframes'].checked = allowIframes;
        row.children[4].children['allowIframes'].addEventListener('change', checkboxClicked);
        row.children[5].addEventListener('click', removeButtonClicked);

        $('#tab-site-preferences table tbody').append(row);
    };

    $('#dialogDeleteSite .modal-footer button.yes').addEventListener('click', function(e) {
        dialogDeleteSiteModal.hide();

        const url = $('#dialogDeleteSite').getAttribute('url');
        const trId = $('#dialogDeleteSite').getAttribute('tr-id');
        $('#tab-site-preferences #' + trId).remove();

        for (let i = 0; i < options.settings['sitePreferences'].length; ++i) {
            if (options.settings['sitePreferences'][i].url === url) {
                options.settings['sitePreferences'].splice(i, 1);
            }
        }

        options.saveSettings();
    });

    $('#manualUrl').addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            $('#sitePreferencesManualAdd').click();
        }
    });

    $('#sitePreferencesManualAdd').addEventListener('click', function(e) {
        const manualUrl = document.querySelector('#manualUrl');
        if (!manualUrl) {
            return;
        }

        // Show error for invalid input
        if (!manualUrl.validity.valid) {
            options.createWarning(manualUrl, tr('optionsErrorInvalidURL'));
            return;
        }

        let value = manualUrl.value.toLowerCase();

        // Fills the last / char if needed. This ensures the compatibility with Match Patterns
        if (slashNeededForUrl(value)) {
            value += '/';
        }

        // Check if the URL is already in the list
        if (options.settings['sitePreferences'].some(s => s.url === value)) {
            options.createWarning(manualUrl, tr('optionsErrorValueExists'));
            return;
        }

        if (options.settings['sitePreferences'] === undefined) {
            options.settings['sitePreferences'] = [];
        }

        const newIndex = options.settings['sitePreferences'].length + 1;
        const rowClone = $('#tab-site-preferences table tr.clone').cloneNode(true);
        rowClone.classList.remove('clone', 'd-none');

        addNewRow(rowClone, newIndex, value, IGNORE_NOTHING, false, false, false);
        $('#tab-site-preferences table tbody tr.empty').hide();

        options.settings['sitePreferences'].push({
            url: value,
            ignore: IGNORE_NOTHING,
            usernameOnly: false,
            improvedFieldDetection: false,
            allowIframes: false,
        });
        options.saveSettings();
        manualUrl.value = '';
    });

    const rowClone = $('#tab-site-preferences table tr.clone').cloneNode(true);
    rowClone.classList.remove('clone', 'd-none');
    let counter = 1;
    if (options.settings['sitePreferences']) {
        for (const site of options.settings['sitePreferences']) {
            addNewRow(
                rowClone,
                counter,
                site.url,
                site.ignore,
                site.usernameOnly,
                site.improvedFieldDetection,
                site.allowIframes,
            );
            ++counter;
        }
    }
};

options.initAbout = function() {
    const version = browser.runtime.getManifest().version;
    let platform = navigator.platform;
    if (platform === 'Win32' && (navigator.userAgent.includes('x64') || navigator.userAgent.includes('WOW64'))) {
        platform = 'Win64';
    }

    $('#tab-about span.versionCIP').textContent = version;
    $('#tab-about span.kpxcbrVersion').textContent = version;
    $('#tab-about span.kpxcbrOS').textContent = platform;
    $('#tab-about span.kpxcbrBrowser').textContent = getBrowserId();
};

options.updateTheme = function() {
    let theme = options.settings['colorTheme'];
    if (theme === 'system') {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-bs-theme', theme);
    browser.runtime.sendMessage({ action: 'update_popup' });
};

options.createWarning = function(elem, text) {
    const banner = document.createElement('div');
    banner.classList.add('alert', 'alert-dismissible', 'alert-danger', 'mt-2');
    banner.style.position = 'relative';
    banner.style.marginBottom = '0px';
    banner.style.width = '100%';
    banner.textContent = text;
    banner.setAttribute('role', 'alert');
    elem.parentElement.append(banner);

    // Destroy the warning after five seconds
    setTimeout(() => {
        elem.parentElement.removeChild(banner);
    }, 5000);
};

const getBrowserId = function() {
    if (navigator.userAgent.indexOf('Firefox') > -1) {
        return 'Mozilla Firefox ' + navigator.userAgent.substr(navigator.userAgent.lastIndexOf('/') + 1);
    } else if (navigator.userAgent.indexOf('Edg') > -1) {
        let startPos = navigator.userAgent.indexOf('Edg');
        startPos = navigator.userAgent.indexOf('/', startPos) + 1;
        const version = navigator.userAgent.substring(startPos);
        return 'Microsoft Edge ' + version;
    } else if (navigator.userAgent.indexOf('Chrome') > -1) {
        let startPos = navigator.userAgent.indexOf('Chrome');
        startPos = navigator.userAgent.indexOf('/', startPos) + 1;
        const version = navigator.userAgent.substring(startPos, navigator.userAgent.indexOf('Safari'));
        return 'Chrome/Chromium ' + version;
    }

    return 'Other/Unknown';
};

(async() => {
    try {
        // We eagerly load the theme here to avoid a white flash
        let theme = localStorage.getItem('colorTheme') || 'system';
        if (theme === 'system') {
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-bs-theme', theme);

        const settings = await browser.runtime.sendMessage({ action: 'load_settings' });
        options.settings = settings;

        const keyRing = await browser.runtime.sendMessage({ action: 'load_keyring' });
        options.keyRing = keyRing;
        options.initMenu();
        await options.initGeneralSettings();
        options.initConnectedDatabases();
        options.initCustomLoginFields();
        options.initSitePreferences();
        options.initAbout();
    } catch (err) {
        console.log('Error loading options page: ' + err);
    }
})();
