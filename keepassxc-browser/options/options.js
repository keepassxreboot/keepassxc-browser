'use strict';

if (jQuery) {
    var $ = jQuery.noConflict(true);
}

const defaultSettings = {
    blinkTimeout: 7500,
    redirectOffset: -1,
    redirectAllowance: 1
};

$(function() {
    browser.runtime.sendMessage({ action: 'load_settings' }).then((settings) => {
        options.settings = settings;
        browser.runtime.sendMessage({ action: 'load_keyring' }).then((keyRing) => {
            options.keyRing = keyRing;
            options.initMenu();
            options.initGeneralSettings();
            options.initConnectedDatabases();
            options.initCustomCredentialFields();
            options.initSitePreferences();
            options.initAbout();
        });
    });

    // Set options page language to HTML element from locale
    $('html').attr('lang', browser.i18n.getUILanguage());
});

var options = options || {};

options.initMenu = function() {
    $('.navbar:first ul.nav:first li a').click(function(e) {
        e.preventDefault();
        $('.navbar:first ul.nav:first li').removeClass('active');
        $(this).parent('li').addClass('active');
        $('div.tab').hide();
        $('div.tab#tab-' + $(this).attr('href').substring(1)).fadeIn();
    });

    $('div.tab:first').show();
};

options.saveSettingsPromise = function() {
    return new Promise((resolve, reject) => {
        browser.storage.local.set({ 'settings': options.settings }).then((item) => {
            browser.runtime.sendMessage({
                action: 'load_settings'
            }).then((settings) => {
                resolve(settings);
            });
        });
    });
};

options.saveSetting = function(name) {
    const id = '#' + name;
    $(id).closest('.control-group').removeClass('error').addClass('success');
    setTimeout(() => {
        $(id).closest('.control-group').removeClass('success');
    }, 2500);

    browser.storage.local.set({ 'settings': options.settings });
    browser.runtime.sendMessage({
        action: 'load_settings'
    });
};

options.saveSettings = function() {
    browser.storage.local.set({ 'settings': options.settings });
    browser.runtime.sendMessage({
        action: 'load_settings'
    });
};

options.saveKeyRing = function() {
    browser.storage.local.set({ 'keyRing': options.keyRing });
    browser.runtime.sendMessage({
        action: 'load_keyring'
    });
};

options.initGeneralSettings = function() {
    $('#tab-general-settings input[type=checkbox]').each(function() {
        $(this).attr('checked', options.settings[$(this).attr('name')]);
        if ($(this).attr('name') === 'defaultGroupAlwaysAsk' && $(this).attr('checked')) {
            $('#defaultGroup').prop('disabled', true);
            $('#defaultGroupButton').prop('disabled', true);
            $('#defaultGroupButtonReset').prop('disabled', true);
        }
    });

    $('#tab-general-settings input[type=checkbox]').change(function() {
        const name = $(this).attr('name');
        options.settings[name] = $(this).is(':checked');
        options.saveSettingsPromise().then((updated) => {
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
    });

    $('#tab-general-settings input#defaultGroup').val(options.settings['defaultGroup']);

    $('#tab-general-settings input[type=radio]').each(function() {
        if ($(this).val() === options.settings[$(this).attr('name')]) {
            $(this).attr('checked', options.settings[$(this).attr('name')]);
        }
    });

    $('#tab-general-settings input[type=radio]').change(function() {
        options.settings[$(this).attr('name')] = $(this).val();
        options.saveSettings();
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

    $('#blinkTimeout').val(options.settings['blinkTimeout']);
    $('#blinkMinTimeout').val(options.settings['blinkMinTimeout']);
    $('#allowedRedirect').val(options.settings['allowedRedirect']);

    browser.commands.getAll().then(function(commands) {
        commands.forEach(function(command) {
            var shortcut = document.getElementById(`${command.name}-shortcut`);
            if (!shortcut) {
                return;
            }
            shortcut.textContent = command.shortcut || 'not configured';
        });
    });

    $('#configureCommands').click(function() {
        browser.tabs.create({
            url: isFirefox() ? browser.runtime.getURL('options/shortcuts.html') : 'chrome://extensions/configureCommands'
        });
    });

    $('#blinkTimeoutButton').click(function() {
        const input = document.querySelector('#blinkTimeout');
        if (!input.validity.valid) {
            options.createWarning(input, tr('optionsErrorInvalidValue'));
        }

        const blinkTimeout = input.value;
        const blinkTimeoutval = blinkTimeout !== '' ? Number(blinkTimeout) : defaultSettings.blinkTimeout;

        options.settings['blinkTimeout'] = blinkTimeoutval;
        options.saveSetting('blinkTimeout');
    });

    $('#blinkMinTimeoutButton').click(function() {
        const blinkMinTimeout = $.trim($('#blinkMinTimeout').val());
        const blinkMinTimeoutval = blinkMinTimeout !== '' ? Number(blinkMinTimeout) : defaultSettings.redirectOffset;

        options.settings['blinkMinTimeout'] = blinkMinTimeoutval;
        options.saveSetting('blinkMinTimeout');
    });

    $('#allowedRedirectButton').click(function() {
        const allowedRedirect = $.trim($('#allowedRedirect').val());
        const allowedRedirectval = allowedRedirect !== '' ? Number(allowedRedirect) : defaultSettings.redirectAllowance;

        options.settings['allowedRedirect'] = allowedRedirectval;
        options.saveSetting('allowedRedirect');
    });

    $('#defaultGroupButton').click(function() {
        const value = $('#defaultGroup').val();
        if (value.length > 0) {
            options.settings['defaultGroup'] = value;
            options.saveSettings();
        }
    });

    $('#defaultGroupButtonReset').click(function() {
        $('#defaultGroup').val('');
        options.settings['defaultGroup'] = '';
        options.saveSettings();
    });
};

options.showKeePassXCVersions = function(response) {
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
};

options.getPartiallyHiddenKey = function(key) {
    return !key ? 'Error' : (key.substr(0, 8) + '*'.repeat(10));
};

options.initConnectedDatabases = function() {
    $('#dialogDeleteConnectedDatabase').modal({ keyboard: true, show: false, backdrop: true });
    $('#tab-connected-databases tr.clone:first button.delete:first').click(function(e) {
        e.preventDefault();
        $('#dialogDeleteConnectedDatabase').data('hash', $(this).closest('tr').data('hash'));
        $('#dialogDeleteConnectedDatabase .modal-body:first span:first').text($(this).closest('tr').children('td:first').text());
        $('#dialogDeleteConnectedDatabase').modal('show');
        $('#dialogDeleteConnectedDatabase').on('shown.bs.modal', () => {
            $('#dialogDeleteConnectedDatabase').find('[autofocus]').focus();
        });
    });

    $('#dialogDeleteConnectedDatabase .modal-footer:first button.yes:first').click(function(e) {
        $('#dialogDeleteConnectedDatabase').modal('hide');

        const hash = $('#dialogDeleteConnectedDatabase').data('hash');
        $('#tab-connected-databases #tr-cd-' + hash).remove();

        delete options.keyRing[hash];
        options.saveKeyRing();

        if ($('#tab-connected-databases table tbody:first tr').length > 2) {
            $('#tab-connected-databases table tbody:first tr.empty:first').hide();
        } else {
            $('#tab-connected-databases table tbody:first tr.empty:first').show();
        }
    });

    $('#tab-connected-databases tr.clone:first .dropdown-menu:first').width('230px');

    const trClone = $('#tab-connected-databases table tr.clone:first').clone(true);
    trClone.removeClass('clone');
    for (const hash in options.keyRing) {
        const tr = trClone.clone(true);
        tr.data('hash', hash);
        tr.attr('id', 'tr-cd-' + hash);

        $('a.dropdown-toggle:first img:first', tr).attr('src', '/icons/toolbar/icon_normal.png');

        tr.children('td:first').text(options.keyRing[hash].id);
        tr.children('td:eq(1)').text(options.getPartiallyHiddenKey(options.keyRing[hash].key));
        const lastUsed = (options.keyRing[hash].lastUsed) ? new Date(options.keyRing[hash].lastUsed).toLocaleString() : 'unknown';
        tr.children('td:eq(2)').text(lastUsed);
        const date = (options.keyRing[hash].created) ? new Date(options.keyRing[hash].created).toLocaleDateString() : 'unknown';
        tr.children('td:eq(3)').text(date);
        $('#tab-connected-databases table tbody:first').append(tr);
    }

    if ($('#tab-connected-databases table tbody:first tr').length > 2) {
        $('#tab-connected-databases table tbody:first tr.empty:first').hide();
    } else {
        $('#tab-connected-databases table tbody:first tr.empty:first').show();
    }

    $('#connect-button').click(function() {
        browser.runtime.sendMessage({
            action: 'associate'
        });
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

    const trClone = $('#tab-custom-fields table tr.clone:first').clone(true);
    trClone.removeClass('clone');
    let counter = 1;
    for (const url in options.settings['defined-custom-fields']) {
        const tr = trClone.clone(true);
        tr.data('url', url);
        tr.attr('id', 'tr-scf' + counter);
        ++counter;

        tr.children('td:first').text(url);
        $('#tab-custom-fields table tbody:first').append(tr);
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

        const errorMessage = tr('optionsErrorValueExists');
        let value = manualUrl.value;
        if (value.length > 10 && value.length <= 2000) {
            // Fills the last / char if needed. This ensures the compatibility with Match Patterns
            if (slashNeededForUrl(value)) {
                value += '/';
            }

            // Check if the URL is already in the list
            if (options.settings['sitePreferences'].some(s => s.url === value)) {
                options.createWarning(manualUrl, errorMessage);
                return;
            }

            if (options.settings['sitePreferences'] === undefined) {
                options.settings['sitePreferences'] = [];
            }

            const newValue = options.settings['sitePreferences'].length + 1;
            const trClone = $('#tab-site-preferences table tr.clone:first').clone(true);
            trClone.removeClass('clone');

            const tr = trClone.clone(true);
            tr.data('url', value);
            tr.attr('id', 'tr-scf' + newValue);
            tr.children('td:first').text(value);
            tr.children('td:nth-child(2)').children('select').val(IGNORE_NOTHING);
            $('#tab-site-preferences table tbody:first').append(tr);
            $('#tab-site-preferences table tbody:first tr.empty:first').hide();

            options.settings['sitePreferences'].push({ url: value, ignore: IGNORE_NOTHING, usernameOnly: false });
            options.saveSettings();
            manualUrl.value = '';
        }
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

    const trClone = $('#tab-site-preferences table tr.clone:first').clone(true);
    trClone.removeClass('clone');
    let counter = 1;
    if (options.settings['sitePreferences']) {
        for (const site of options.settings['sitePreferences']) {
            const tr = trClone.clone(true);
            tr.data('url', site.url);
            tr.attr('id', 'tr-scf' + counter);
            ++counter;

            tr.children('td:first').text(site.url);
            tr.children('td:nth-child(2)').children('select').val(site.ignore);
            tr.children('td:nth-child(3)').children('input[type=checkbox]').attr('checked', site.usernameOnly);
            $('#tab-site-preferences table tbody:first').append(tr);
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
    $('#tab-about em.versionCIP').text(version);
    $('#tab-about span.kpxcbrVersion').text(version);
    $('#tab-about span.kpxcbrOS').text(navigator.platform);
    $('#tab-about span.kpxcbrBrowser').text(getBrowserId());

    // Hides keyboard shortcut configure button if Firefox version is < 60 (API is not compatible)
    if (isFirefox() && Number(navigator.userAgent.substr(navigator.userAgent.lastIndexOf('/') + 1, 2)) < 60) {
        $('#chrome-only').remove();
    }
};

options.createWarning = function(elem, text) {
    const banner = document.createElement('div');
    banner.classList.add('alert', 'alert-dismissible', 'alert-danger', 'fade', 'in');
    banner.style.position = 'absolute';
    banner.style.left = String(elem.offsetLeft) + 'px';
    banner.style.top = String(elem.offsetTop + elem.offsetHeight) + 'px';
    banner.style.padding = '0px';
    banner.style.width = '300px';
    banner.textContent = text;
    elem.parentElement.append(banner);

    // Destroy the warning after five seconds
    setTimeout(() => {
        elem.parentElement.removeChild(banner);
    }, 5000);
};

const getBrowserId = function() {
    if (navigator.userAgent.indexOf('Firefox') > -1) {
        return 'Mozilla Firefox ' + navigator.userAgent.substr(navigator.userAgent.lastIndexOf('/') + 1);
    } else if (navigator.userAgent.indexOf('Chrome') > -1) {
        let startPos = navigator.userAgent.indexOf('Chrome');
        startPos = navigator.userAgent.indexOf('/', startPos) + 1;
        const version = navigator.userAgent.substring(startPos, navigator.userAgent.indexOf('Safari'));
        return 'Chrome/Chromium ' + version;
    }

    return 'Other/Unknown';
};
