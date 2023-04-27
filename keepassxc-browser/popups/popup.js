'use strict';

let reloadCount = 0;

HTMLElement.prototype.show = function() {
    this.style.display = 'block';
};

HTMLElement.prototype.hide = function() {
    this.style.display = 'none';
};

function statusResponse(status) {
    $('#initial-state').hide();
    $('#error-encountered').hide();
    $('#need-reconfigure').hide();
    $('#not-configured').hide();
    $('#configured-and-associated').hide();
    $('#configured-not-associated').hide();
    $('#lock-database-button').hide();
    $('#getting-started-guide').hide();

    if (!status.keePassXCAvailable) {
        $('#error-message').textContent = status.error;
        $('#error-encountered').show();

        if (status.showGettingStartedGuideAlert) {
            $('#getting-started-guide').show();
        }

        if (status.showTroubleshootingGuideAlert && reloadCount >= 2) {
            $('#troubleshooting-guide').show();
        } else {
            $('#troubleshooting-guide').hide();
        }

        return;
    }

    // Only supported with Protocol V2
    if (status.databaseAssociationStatuses) {
        // This can be also shown when isAnyAssociated is true?
        if (status.databaseAssociationStatuses.associationNeeded) {
            $('#not-configured').show();
        }

        if (status.keePassXCAvailable && status.databaseAssociationStatuses.areAllLocked) {
            $('#database-error-message').textContent = status.error;
            $('#database-not-opened').show();
        }

        if (status.databaseAssociationStatuses.isAnyAssociated) {
            $('#configured-and-associated').show();
            $('#associated-identifier').textContent = status.identifier;
            $('#lock-database-button').show();

            if (status.usernameFieldDetected) {
                $('#username-field-detected').show();
            }

            reloadCount = 0;
        }

        return;
    }

    if (status.keePassXCAvailable && status.databaseClosed) {
        $('#database-error-message').textContent = status.error;
        $('#database-not-opened').show();
    } else if (!status.configured) {
        $('#not-configured').show();
    } else if (status.encryptionKeyUnrecognized) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').textContent = status.error;
    } else if (!status.associated) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').textContent = status.error;
    } else if (status.error !== null) {
        $('#error-encountered').show();
        $('#error-message').textContent = status.error;
    } else {
        $('#configured-and-associated').show();
        $('#associated-identifier').textContent = status.identifier;
        $('#lock-database-button').show();

        if (status.usernameFieldDetected) {
            $('#username-field-detected').show();
        }

        reloadCount = 0;
    }
}

const sendMessageToTab = async function(message) {
    const tab = await getCurrentTab();
    if (!tab) {
        return false; // Only the background devtools or a popup are opened
    }

    await browser.tabs.sendMessage(tab.id, {
        action: message
    });

    return true;
};

(async () => {
    resizePopup();
    await initColorTheme();

    $('#connect-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'associate'
        });

        // This does not work with Firefox because of https://bugzilla.mozilla.org/show_bug.cgi?id=1665380
        await sendMessageToTab('retrive_credentials_forced');
        close();
    });

    $('#reconnect-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'associate'
        });
        close();
    });

    $('#reload-status-button').addEventListener('click', async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'reconnect'
        }));

        // Shows the Troubleshooting Guide alert every third time Reload button is pressed when popup is open
        if (reloadCount > 2) {
            reloadCount = 0;
        }
        reloadCount++;
    });

    $('#reopen-database-button').addEventListener('click', async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'get_status',
            args: [ false, true ] // Set triggerUnlock to true
        }));
    });

    $('#redetect-fields-button').addEventListener('click', async () => {
        const res = await sendMessageToTab('redetect_fields');
        if (!res) {
            return;
        }

        statusResponse(await browser.runtime.sendMessage({
            action: 'get_status'
        }));
    });

    $('#lock-database-button').addEventListener('click', async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'lock_database'
        }));
    });

    $('#username-only-button').addEventListener('click', async () => {
        await sendMessageToTab('add_username_only_option');
        await sendMessageToTab('redetect_fields');
        $('#username-field-detected').hide();
    });

    $('#getting-started-alert-close-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'hide_getting_started_guide_alert'
        });
    });

    $('#troubleshooting-guide-alert-close-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'hide_troubleshooting_guide_alert'
        });
    });

    statusResponse(await browser.runtime.sendMessage({
        action: 'get_status'
    }).catch((err) => {
        logError('Could not get status: ' + err);
    }));
})();
