'use strict';

const POLLING_INTERVAL = 1000; // ms
let previousStatus;
let reloadCount = 0;

function hideAll() {
    $('#initial-state').hide();
    $('#error-encountered').hide();
    $('#need-reconfigure').hide();
    $('#not-configured').hide();
    $('#configured-and-associated').hide();
    $('#configured-not-associated').hide();
    $('#lock-database-button').hide();
    $('#getting-started-guide').hide();
    $('#database-not-opened').hide();
    $('#credentials-list').hide();
    $('#http-auth-credentials-list').hide();
}

function handleStatusResponse(response) {
    hideAll();

    // Error situations
    if (!response.keePassXCAvailable) {
        $('#error-message').textContent = response.error;
        $('#error-encountered').show();

        if (response.showGettingStartedGuideAlert) {
            $('#getting-started-guide').show();
        }

        if (response.showTroubleshootingGuideAlert && reloadCount >= 2) {
            $('#troubleshooting-guide').show();
        } else {
            $('#troubleshooting-guide').hide();
        }
        return;
    } else if (response.keePassXCAvailable && response.databaseClosed) {
        $('#database-error-message').textContent = response.error;
        $('#database-not-opened').show();
        return;
    } else if (!response.configured) {
        $('#not-configured').show();
        return;
    } else if (response.encryptionKeyUnrecognized) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').textContent = response.error;
        return;
    } else if (!response.associated) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').textContent = response.error;
        return;
    } else if (response.error) {
        $('#error-encountered').show();
        $('#error-message').textContent = response.error;
        return;
    }

    // Show the popup content based on status
    if (response?.popupData?.popup === PopupState.LOGIN) {
        $('#credentials-list').show();
        $('#configured-and-associated').hide();
        initializeLoginList();
    } else if (response?.popupData?.popup === PopupState.HTTP_AUTH) {
        $('#http-auth-credentials-list').show();
        $('#configured-and-associated').hide();
        initializeHttpAuthLoginList();
    } else {
        // PopupState.DEFAULT
        $('#credentials-list').hide();
        $('#http-auth-credentials-list').hide();
        $('#configured-and-associated').show();
        $('#associated-identifier').textContent = response.identifier;
    }

    $('#lock-database-button').show();

    // Show button for adding Username-Only Detection for the site
    if (response.usernameFieldDetected) {
        $('#username-field-detected').show();
    }

    // Show button for allowing Cross-Origin IFrames for the site
    if (response.iframeDetected) {
        $('#iframe-detected').show();
    }

    reloadCount = 0;
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
        handleStatusResponse(await browser.runtime.sendMessage({
            action: 'reconnect'
        }));

        // Shows the Troubleshooting Guide alert every third time Reload button is pressed when popup is open
        if (reloadCount > 2) {
            reloadCount = 0;
        }
        reloadCount++;
    });

    $('#reopen-database-button').addEventListener('click', async () => {
        handleStatusResponse(await browser.runtime.sendMessage({
            action: 'get_status',
            args: [ false, true ] // Set forcePopup to true
        }));
        window.close();
    });

    $('#redetect-fields-button').addEventListener('click', async () => {
        const res = await sendMessageToTab('redetect_fields');
        if (!res) {
            return;
        }

        handleStatusResponse(await browser.runtime.sendMessage({
            action: 'get_status'
        }));
    });

    $('#lock-database-button').addEventListener('click', async () => {
        handleStatusResponse(await browser.runtime.sendMessage({
            action: 'lock_database'
        }));
    });

    $('#username-only-button').addEventListener('click', async () => {
        await sendMessageToTab('add_username_only_option');
        await sendMessageToTab('redetect_fields');
        $('#username-field-detected').hide();
    });

    $('#allow-iframe-button').addEventListener('click', async () => {
        await sendMessageToTab('add_allow_iframes_option');
        await sendMessageToTab('redetect_fields');
        $('#iframe-detected').hide();
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

    // For HTTP Basic Auth
    $('#btn-dismiss').addEventListener('click', async () => {
        // Return empty credentials
        browser.runtime.sendMessage({
            action: 'fill_http_auth',
            args: { login: '', password: '' }
        });

        close();
    });

    async function getNewStatus() {
        return await browser.runtime.sendMessage({
            action: 'get_status'
        }).catch((err) => {
            logError('Could not get status: ' + err);
        });
    }

    // Get status right after popup has been opened
    handleStatusResponse(await getNewStatus());

    // Poll status
    setInterval(async () => {
        // Check if the popup state has been changed or database has been opened/closed
        const currentStatus = await getNewStatus();
        if (previousStatus?.popupData?.popup !== currentStatus?.popupData?.popup
            || previousStatus?.databaseClosed !== currentStatus?.databaseClosed
            || previousStatus?.keePassXCAvailable !== currentStatus?.keePassXCAvailable) {
            previousStatus = currentStatus;
            handleStatusResponse(currentStatus);
        }
    }, POLLING_INTERVAL);
})();
