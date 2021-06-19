'use strict';

if (jQuery) {
    var $ = jQuery.noConflict(true);
}

$(async function() {
    try {
        const settings = await browser.runtime.sendMessage({ action: 'load_settings' });
        options.settings = settings;

        const keyRing = await browser.runtime.sendMessage({ action: 'load_keyring' });
        options.keyRing = keyRing;
        options.initMenu();
        options.initGeneralSettings();
        options.initConnectedDatabases();
        options.initCustomCredentialFields();
        options.initSitePreferences();
        options.initAbout();
        options.initTheme();
    } catch (err) {
        console.log('Error loading options page: ' + err);
    }
});

var options = options || {};

options.initMenu = function() {
    $('.sidebar:first ul.nav:first li a').click(function(e) {
        e.preventDefault();
        $('.sidebar:first ul.nav:first li').removeClass('active');
        $(this).parent('li').addClass('active');
        $('div.tab').hide();
        $('div.tab#tab-' + $(this).attr('href').substring(1)).removeClass('d-none').fadeIn();
    });

    $('div.tab:first').show();
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

options.initGeneralSettings = function() {
    if (options.settings['colorTheme'] === undefined) {
        $('#tab-general-settings select#colorTheme').val('system');
    } else {
        $('#tab-general-settings select#colorTheme').val(options.settings['colorTheme']);
    }

    $('#tab-general-settings select#colorTheme').change(async function() {
        options.settings['colorTheme'] = $(this).val();
        await options.saveSettings();
        location.reload();
    });

    $('#tab-general-settings select#credentialSorting').change(async function() {
        options.settings['credentialSorting'] = $(this).val();
        await options.saveSettings();
    });

    $('#tab-general-settings input[type=checkbox]').each(function() {
        $(this).attr('checked', options.settings[$(this).attr('name')]);
        if ($(this).attr('name') === 'defaultGroupAlwaysAsk' && $(this).attr('checked')) {
            $('#defaultGroup').prop('disabled', true);
            $('#defaultGroupButton').prop('disabled', true);
            $('#defaultGroupButtonReset').prop('disabled', true);
        }
    });

    $('#tab-general-settings input[type=range]').val(options.settings['redirectAllowance']);
    $('#redirectAllowanceLabel').text(tr('optionsRedirectAllowance',
        options.settings['redirectAllowance'] === 11 ? 'Infinite' : String(options.settings['redirectAllowance'])));

    $('#tab-general-settings input[type=checkbox]').change(async function() {
        const name = $(this).attr('name');
        options.settings[name] = $(this).is(':checked');

        const updated = await options.saveSettings();
        if (name === 'autoFillAndSend') {
            browser.runtime.sendMessage({ action: 'init_http_auth' });
        } else if (name === 'defaultGroupAlwaysAsk') {
            if ($(this).is(':checked')) {
                $('#defaultGroup').prop('disabled', true);
                $('#defaultGroupButton').prop('disabled', true);
                $('#defaultGroupButtonReset').prop('disabled', true);
            } else {
                $('#defaultGroup').prop('disabled', false);
                $('#defaultGroupButton').prop('disabled', false);
                $('#defaultGroupButtonReset').prop('disabled', false);
            }
        } else if (name === 'autoReconnect') {
            const message = updated.autoReconnect ? 'enable_automatic_reconnect' : 'disable_automatic_reconnect';
            browser.runtime.sendMessage({ action: message });
        }
    });

    $('#tab-general-settings select#credentialSorting').val(options.settings['credentialSorting']);
    $('#tab-general-settings input#defaultGroup').val(options.settings['defaultGroup']);

    $('#tab-general-settings input#clearCredentialTimeout').val(options.settings['clearCredentialsTimeout']);
    $('#tab-general-settings input#clearCredentialTimeout').change(async function(e) {
        if (e.target.valueAsNumber < 0 || e.target.valueAsNumber > 3600) {
            return;
        }

        options.settings['clearCredentialsTimeout'] = e.target.valueAsNumber;
        await options.saveSettings();
    });

    $('#tab-general-settings input[type=radio]').each(function() {
        if ($(this).val() === String(options.settings[$(this).attr('name')])) {
            $(this).attr('checked', options.settings[$(this).attr('name')]);
        }
    });

    $('#tab-general-settings input[type=radio]').change(function() {
        options.settings[$(this).attr('name')] = Number($(this).val());
        options.saveSettings();
    });

    // Change label text dynamically with the range input
    $('#tab-general-settings input[type=range]').on('propertychange input', function(e) {
        const currentValue = e.target.valueAsNumber === 11 ? 'Infinite' : e.target.value;
        $('#redirectAllowanceLabel').text(tr('optionsRedirectAllowance', currentValue));
    });

    // Only save the setting when mouse is released from the range input
    $('#tab-general-settings input[type=range]').change(async function(e) {
        options.settings['redirectAllowance'] = e.target.valueAsNumber;
        await options.saveSettings();
    });

    browser.runtime.sendMessage({
        action: 'get_keepassxc_versions'
    }).then(options.showKeePassXCVersions);

    $('#tab-general-settings button.checkUpdateKeePassXC:first').click(function(e) {
        e.preventDefault();
        $(this).attr('disabled', true);
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

    $('#configureCommands').click(function() {
        const scheme = isEdge() ? 'edge' : 'chrome';
        browser.tabs.create({
            url: isFirefox() ? browser.runtime.getURL('options/shortcuts.html') : `${scheme}://extensions/shortcuts`
        });
    });

    $('#defaultGroupButton').click(async function() {
        const value = $('#defaultGroup').val();
        options.settings['defaultGroup'] = (value.length > 0 ? value : '');
        await options.saveSettings();
    });

    $('#defaultGroupButtonReset').click(async function() {
        $('#defaultGroup').val('');
        options.settings['defaultGroup'] = '';
        await options.saveSettings();
    });

    let temporarySettings;
    $('#dialogImportSettings').modal({ keyboard: true, show: false, backdrop: true });
    $('#importSettingsButton').click(function() {
        var link = document.createElement('input');
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
                    $('#dialogImportSettings').data('hash', $(this).closest('tr').data('hash'));
                    $('#dialogImportSettings .modal-body:first span:first').text($(this).closest('tr').children('td:first').text());
                    $('#dialogImportSettings').modal('show');
                    $('#dialogImportSettings').on('shown.bs.modal', () => {
                        $('#dialogImportSettings').find('[autofocus]').focus();
                    });
                } catch (err) {
                    console.log('Error loading JSON settings file.');
                }
            };
        };

        link.click();
    });

    $('#exportSettingsButton').click(function() {
        const link = document.createElement('a');
        const file = new Blob([ JSON.stringify(options.settings) ], { type: 'application/json' });
        link.href = URL.createObjectURL(file);
        link.download = 'keepassxc-browser_settings.json';
        link.click();
    });

    $('#dialogImportSettings .modal-footer:first button.yes:first').click(function(e) {
        $('#dialogImportSettings').modal('hide');

        if (temporarySettings) {
            options.settings = temporarySettings;
            options.saveSettings();
        }
    });

    $('#copyVersionToClipboard').on('click', function () {
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
            siteListing.append(document.createElement('br'));
            siteListing.append(elem);
        }
    }
};

options.showKeePassXCVersions = async function(response) {
    if (response.current === '') {
        response.current = 'unknown';
    }
    if (response.latest === '') {
        response.latest = 'unknown';
    }
    $('#tab-general-settings .kphVersion:first em.yourVersion:first').text(response.current);
    $('#tab-general-settings .kphVersion:first em.latestVersion:first').text(response.latest);
    $('#tab-about em.versionKPH').text(response.current);
    $('#tab-about span.kpxcVersion').text(response.current);
    $('#tab-general-settings button.checkUpdateKeePassXC:first').attr('disabled', false);

    const result = await browser.runtime.sendMessage({
        action: 'compare_version',
        args: [ '2.6.0', response.current ]
    });

    if (result) {
        $('#tab-general-settings #versionRequiredAlert').hide();
    } else {
        $('#tab-general-settings #showGroupNameInAutocomplete').attr('disabled', true);
    }
};

options.getPartiallyHiddenKey = function(key) {
    return !key ? 'Error' : (key.substr(0, 8) + '*'.repeat(10));
};

options.initConnectedDatabases = function() {
    $('#dialogDeleteConnectedDatabase').modal({ keyboard: true, show: false, backdrop: true });
    $('#tab-connected-databases tr.clone:first button.delete:first').click(function(e) {
        e.preventDefault();
        $('#dialogDeleteConnectedDatabase').data('hash', $(this).closest('tr').data('hash'));
        $('#dialogDeleteConnectedDatabase .modal-body:first strong:first').text($(this).closest('tr').children('td:first').text());
        $('#dialogDeleteConnectedDatabase').modal('show');
        $('#dialogDeleteConnectedDatabase').on('shown.bs.modal', () => {
            $('#dialogDeleteConnectedDatabase').find('[autofocus]').focus();
        });
    });

    $('#dialogDeleteConnectedDatabase .modal-footer:first button.yes:first').click(async function(e) {
        $('#dialogDeleteConnectedDatabase').modal('hide');

        const hash = $('#dialogDeleteConnectedDatabase').data('hash');
        $('#tab-connected-databases #tr-cd-' + hash).remove();

        delete options.keyRing[hash];
        options.saveKeyRing();
        hashList = options.keyRing;

        // Force reconnect so the extension will disconnect the current database
        await browser.runtime.sendMessage({ action: 'reconnect' }).catch(err => {
            console.log(err);
        });

        if ($('#tab-connected-databases table tbody:first tr').length > 2) {
            $('#tab-connected-databases table tbody:first tr.empty:first').hide();
        } else {
            $('#tab-connected-databases table tbody:first tr.empty:first').show();
        }
    });

    $('#tab-connected-databases tr.clone:first .dropdown-menu:first').width('230px');

    const rowClone = $('#tab-connected-databases table tr.clone:first').clone(true);
    rowClone.removeClass('clone d-none');

    const addHashToTable = function(hash) {
        $('#tab-connected-databases table tbody:first tr.empty:first').hide();
        const row = rowClone.clone(true);
        row.data('hash', hash);
        row.attr('id', 'tr-cd-' + hash);

        $('a.dropdown-toggle:first img:first', row).attr('src', '/icons/toolbar/icon_normal.png');

        row.children('td:first').text(options.keyRing[hash].id);
        row.children('td:eq(1)').text(options.getPartiallyHiddenKey(options.keyRing[hash].key));
        const lastUsed = (options.keyRing[hash].lastUsed) ? new Date(options.keyRing[hash].lastUsed).toLocaleString() : 'unknown';
        row.children('td:eq(2)').text(lastUsed);
        const date = (options.keyRing[hash].created) ? new Date(options.keyRing[hash].created).toLocaleDateString() : 'unknown';
        row.children('td:eq(3)').text(date);
        $('#tab-connected-databases table tbody:first').append(row);
    };

    let hashList = options.keyRing;
    for (const hash in hashList) {
        addHashToTable(hash);
    }

    if ($('#tab-connected-databases table tbody:first tr').length > 2) {
        $('#tab-connected-databases table tbody:first tr.empty:first').hide();
    } else {
        $('#tab-connected-databases table tbody:first tr.empty:first').show();
    }

    $('#connect-button').click(async function() {
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

options.initCustomCredentialFields = function() {
    $('#dialogDeleteCustomCredentialFields').modal({ keyboard: true, show: false, backdrop: true });
    $('#tab-custom-fields tr.clone:first button.delete:first').click(function(e) {
        e.preventDefault();
        $('#dialogDeleteCustomCredentialFields').data('url', $(this).closest('tr').data('url'));
        $('#dialogDeleteCustomCredentialFields').data('tr-id', $(this).closest('tr').attr('id'));
        $('#dialogDeleteCustomCredentialFields .modal-body:first strong:first').text($(this).closest('tr').children('td:first').text());
        $('#dialogDeleteCustomCredentialFields').modal('show');
        $('#dialogDeleteCustomCredentialFields').on('shown.bs.modal', () => {
            $('#dialogDeleteCustomCredentialFields').find('[autofocus]').focus();
        });
    });

    $('#dialogDeleteCustomCredentialFields .modal-footer:first button.yes:first').click(function(e) {
        $('#dialogDeleteCustomCredentialFields').modal('hide');

        const url = $('#dialogDeleteCustomCredentialFields').data('url');
        const trId = $('#dialogDeleteCustomCredentialFields').data('tr-id');
        $('#tab-custom-fields #' + trId).remove();

        delete options.settings['defined-custom-fields'][url];
        options.saveSettings();

        if ($('#tab-custom-fields table tbody:first tr').length > 2) {
            $('#tab-custom-fields table tbody:first tr.empty:first').hide();
        } else {
            $('#tab-custom-fields table tbody:first tr.empty:first').show();
        }
    });

    const rowClone = $('#tab-custom-fields table tr.clone:first').clone(true);
    rowClone.removeClass('clone d-none');
    let counter = 1;
    for (const url in options.settings['defined-custom-fields']) {
        const row = rowClone.clone(true);
        row.data('url', url);
        row.attr('id', 'tr-scf' + counter);
        ++counter;

        row.children('td:first').text(url);
        $('#tab-custom-fields table tbody:first').append(row);
    }

    if ($('#tab-custom-fields table tbody:first tr').length > 2) {
        $('#tab-custom-fields table tbody:first tr.empty:first').hide();
    } else {
        $('#tab-custom-fields table tbody:first tr.empty:first').show();
    }
};

options.initSitePreferences = function() {
    if (!options.settings['sitePreferences']) {
        options.settings['sitePreferences'] = [];
    }

    $('#dialogDeleteSite').modal({ keyboard: true, show: false, backdrop: true });
    $('#tab-site-preferences tr.clone:first button.delete:first').click(function(e) {
        e.preventDefault();
        $('#dialogDeleteSite').data('url', $(this).closest('tr').data('url'));
        $('#dialogDeleteSite').data('tr-id', $(this).closest('tr').attr('id'));
        $('#dialogDeleteSite .modal-body:first strong:first').text($(this).closest('tr').children('td:first').text());
        $('#dialogDeleteSite').modal('show');
        $('#dialogDeleteSite').on('shown.bs.modal', () => {
            $('#dialogDeleteSite').find('[autofocus]').focus();
        });
    });

    $('#tab-site-preferences tr.clone:first input[type=checkbox]:first').change(function() {
        const url = $(this).closest('tr').data('url');
        for (const site of options.settings['sitePreferences']) {
            if (site.url === url) {
                site.usernameOnly = $(this).is(':checked');
            }
        }
        options.saveSettings();
    });

    $('#tab-site-preferences tr.clone:first select:first').change(function() {
        const url = $(this).closest('tr').data('url');
        for (const site of options.settings['sitePreferences']) {
            if (site.url === url) {
                site.ignore = $(this).val();
            }
        }
        options.saveSettings();
    });

    $('.was-validated').submit(function(e) {
        e.preventDefault();
    });

    $('#manualUrl').keyup(function(event) {
        if (event.key === 'Enter') {
            $('#sitePreferencesManualAdd').click();
        }
    });

    $('#sitePreferencesManualAdd').click(function(e) {
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

        const newValue = options.settings['sitePreferences'].length + 1;
        const rowClone = $('#tab-site-preferences table tr.clone:first').clone(true);
        rowClone.removeClass('clone d-none');

        const row = rowClone.clone(true);
        row.data('url', value);
        row.attr('id', 'tr-scf' + newValue);
        row.children('td:first').text(value);
        row.children('td:nth-child(2)').children('select').val(IGNORE_NOTHING);
        $('#tab-site-preferences table tbody:first').append(row);
        $('#tab-site-preferences table tbody:first tr.empty:first').hide();

        options.settings['sitePreferences'].push({ url: value, ignore: IGNORE_NOTHING, usernameOnly: false });
        options.saveSettings();
        manualUrl.value = '';
    });

    $('#dialogDeleteSite .modal-footer:first button.yes:first').click(function(e) {
        $('#dialogDeleteSite').modal('hide');

        const url = $('#dialogDeleteSite').data('url');
        const trId = $('#dialogDeleteSite').data('tr-id');
        $('#tab-site-preferences #' + trId).remove();

        for (let i = 0; i < options.settings['sitePreferences'].length; ++i) {
            if (options.settings['sitePreferences'][i].url === url) {
                options.settings['sitePreferences'].splice(i, 1);
            }
        }
        options.saveSettings();

        if ($('#tab-site-preferences table tbody:first tr').length > 2) {
            $('#tab-site-preferences table tbody:first tr.empty:first').hide();
        } else {
            $('#tab-site-preferences table tbody:first tr.empty:first').show();
        }
    });

    const rowClone = $('#tab-site-preferences table tr.clone:first').clone(true);
    rowClone.removeClass('clone d-none');
    let counter = 1;
    if (options.settings['sitePreferences']) {
        for (const site of options.settings['sitePreferences']) {
            const row = rowClone.clone(true);
            row.data('url', site.url);
            row.attr('id', 'tr-scf' + counter);
            ++counter;

            row.children('td:first').text(site.url);
            row.children('td:nth-child(2)').children('select').val(site.ignore);
            row.children('td:nth-child(3)').children('input[type=checkbox]').attr('checked', site.usernameOnly);
            $('#tab-site-preferences table tbody:first').append(row);
        }
    }

    if ($('#tab-site-preferences table tbody:first tr').length > 2) {
        $('#tab-site-preferences table tbody:first tr.empty:first').hide();
    } else {
        $('#tab-site-preferences table tbody:first tr.empty:first').show();
    }
};

options.initAbout = function() {
    const version = browser.runtime.getManifest().version;
    let platform = navigator.platform;
    if (platform === 'Win32' && (navigator.userAgent.includes('x64') || navigator.userAgent.includes('WOW64'))) {
        platform = 'Win64';
    }

    $('#tab-about em.versionCIP').text(version);
    $('#tab-about span.kpxcbrVersion').text(version);
    $('#tab-about span.kpxcbrOS').text(platform);
    $('#tab-about span.kpxcbrBrowser').text(getBrowserId());

    // Hides keyboard shortcut configure button if Firefox version is < 60 (API is not compatible)
    if (isFirefox() && Number(navigator.userAgent.substr(navigator.userAgent.lastIndexOf('/') + 1, 2)) < 60) {
        $('#chrome-only').remove();
    }
};

options.initTheme = function() {
    if (options.settings['colorTheme'] === undefined) {
        document.body.removeAttribute('data-color-theme');
    } else {
        document.body.setAttribute('data-color-theme', options.settings['colorTheme']);
    }
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
