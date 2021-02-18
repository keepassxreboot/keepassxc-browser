'use strict';

function statusResponse(r) {
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
    } else if (r.keePassXCAvailable && r.databaseClosed) {
        $('#database-error-message').html(r.error);
        $('#database-not-opened').show();
    } else if (!r.configured) {
        $('#not-configured').show();
    } else if (r.encryptionKeyUnrecognized) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').html(r.error);
    } else if (!r.associated) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').html(r.error);
    } else if (r.error !== null) {
        $('#error-encountered').show();
        $('#error-message').html(r.error);
    } else {
        $('#configured-and-associated').show();
        $('#associated-identifier').html(r.identifier);
        $('#lock-database-button').show();

        if (r.usernameFieldDetected) {
            $('#username-field-detected').show();
        }
    }
}

const sendMessageToTab = async function(message) {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
        return false; // Only the background devtools or a popup are opened
    }

    await browser.tabs.sendMessage(tabs[0].id, {
        action: message
    });

    return true;
};

$(async () => {
    await initColorTheme();

    $('#connect-button').click(async () => {
        await browser.runtime.sendMessage({
            action: 'associate'
        });

        // This does not work with Firefox because of https://bugzilla.mozilla.org/show_bug.cgi?id=1665380
        await sendMessageToTab('retrive_credentials_forced');
        close();
    });

    $('#reconnect-button').click(async () => {
        await browser.runtime.sendMessage({
            action: 'associate'
        });
        close();
    });

    $('#reload-status-button').click(async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'reconnect'
        }));
    });

    $('#reopen-database-button').click(async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'get_status',
            args: [ false, true ] // Set forcePopup to true
        }));
    });

    $('#redetect-fields-button').click(async () => {
        const res = await sendMessageToTab('redetect_fields');
        if (!res) {
            return;
        }

        statusResponse(await browser.runtime.sendMessage({
            action: 'get_status'
        }));
    });

    $('#lock-database-button').click(async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'lock_database'
        }));
    });

    $('#username-only-button').click(async () => {
        await sendMessageToTab('add_username_only_option');
        await sendMessageToTab('redetect_fields');
        $('#username-field-detected').hide();
    });

    statusResponse(await browser.runtime.sendMessage({
        action: 'get_status'
    }).catch((err) => {
        console.log('Error: Could not get status: ' + err);
    }));
});
