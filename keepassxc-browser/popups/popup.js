'use strict';

function status_response(r) {
    $('#initial-state').hide();
    $('#error-encountered').hide();
    $('#need-reconfigure').hide();
    $('#not-configured').hide();
    $('#configured-and-associated').hide();
    $('#configured-not-associated').hide();
    $('#lock-database-button').hide();

    if (!r.keePassXCAvailable) {
        $('#error-message').html(r.error);
        $('#error-encountered').show();
    }
    else if (r.keePassXCAvailable && r.databaseClosed) {
        $('#database-error-message').html(r.error);
        $('#database-not-opened').show();
    }
    else if (!r.configured) {
        $('#not-configured').show();
    }
    else if (r.encryptionKeyUnrecognized) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').html(r.error);
    }
    else if (!r.associated) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').html(r.error);
    }
    else if (r.error !== null) {
        $('#error-encountered').show();
        $('#error-message').html(r.error);
    }
    else {
        $('#configured-and-associated').show();
        $('#associated-identifier').html(r.identifier);
        $('#lock-database-button').show();
    }
}

$(function() {
    $('#connect-button').click(function() {
        browser.runtime.sendMessage({
            action: 'associate'
        });
        close();
    });

    $('#reconnect-button').click(function() {
        browser.runtime.sendMessage({
            action: 'associate'
        });
        close();
    });

    $('#reload-status-button').click(function() {
        browser.runtime.sendMessage({
            action: 'reconnect'
        }).then(status_response);
    });

    $('#reopen-database-button').click(function() {
        browser.runtime.sendMessage({
            action: 'get_status',
            args: [ false, true ]    // Set forcePopup to true
        }).then(status_response);
    });

    $('#redetect-fields-button').click(function() {
        browser.tabs.query({"active": true, "currentWindow": true}).then(function(tabs) {
            if (tabs.length === 0) {
                return; // For example: only the background devtools or a popup are opened
            }
            let tab = tabs[0];

            browser.tabs.sendMessage(tab.id, {
                action: 'redetect_fields'
            });
        });
    });

    $('#lock-database-button').click(function() {
        browser.runtime.sendMessage({
            action: 'lock-database'
        }).then(status_response);
    });

    browser.runtime.sendMessage({
        action: "get_status"
    }).then(status_response);
});
