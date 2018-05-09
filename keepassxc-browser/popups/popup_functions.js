'use strict';

var $ = jQuery.noConflict(true);

function updateAvailableResponse(available) {
    if (available) {
        $('#update-available').show();
    }
}

function initSettings() {
    $('#settings #btn-options').click(function() {
        browser.runtime.openOptionsPage().then(close());
    });

    $('#settings #btn-choose-credential-fields').click(function() {
        browser.windows.getCurrent().then((win) => {
            browser.tabs.query({ 'active': true, 'currentWindow': true }).then((tabs) => {
                const tab = tabs[0];
                browser.runtime.getBackgroundPage().then((global) => {
                    browser.tabs.sendMessage(tab.id, {
                        action: 'choose_credential_fields'
                    });
                    close();
                });
            });
        });
    });
}


$(function() {
    initSettings();

    browser.runtime.sendMessage({
        action: 'update_available_keepassxc'
    }).then(updateAvailableResponse);
});
