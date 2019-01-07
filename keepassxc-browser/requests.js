'use strict';

browser.runtime.onMessage.addListener(function(req, sender) {
    if ('action' in req) {
        if (req.action === 'fill_user_pass_with_specific_login') {
            if (cip.credentials[req.id]) {
                let combination = null;
                if (cip.u) {
                    cip.setValueWithChange(cip.u, cip.credentials[req.id].login);
                    combination = cipFields.getCombination('username', cip.u);
                    browser.runtime.sendMessage({
                        action: 'page_set_login_id', args: [req.id]
                    });
                    cip.u.focus();
                }
                if (cip.p) {
                    cip.setValueWithChange(cip.p, cip.credentials[req.id].password);
                    browser.runtime.sendMessage({
                        action: 'page_set_login_id', args: [req.id]
                    });
                    combination = cipFields.getCombination('password', cip.p);
                }

                let list = [];
                if (cip.fillInStringFields(combination.fields, cip.credentials[req.id].stringFields, list)) {
                    cipForm.destroy(false, {'password': list.list[0], 'username': list.list[1]});
                }
            }
        } else if (req.action === 'fill_user_pass') {
            _called.manualFillRequested = 'both';
            cip.receiveCredentialsIfNecessary().then((response) => {
                cip.fillInFromActiveElement(false);
            });
        } else if (req.action === 'fill_pass_only') {
            _called.manualFillRequested = 'pass';
            cip.receiveCredentialsIfNecessary().then((response) => {
                cip.fillInFromActiveElement(false, true); // passOnly to true
            });
        } else if (req.action === 'fill_totp') {
            cip.receiveCredentialsIfNecessary().then((response) => {
                cip.fillInFromActiveElementTOTPOnly(false);
            });
        } else if (req.action === 'activate_password_generator') {
            cip.initPasswordGenerator(cipFields.getAllFields());
        } else if (req.action === 'remember_credentials') {
            cip.contextMenuRememberCredentials();
        } else if (req.action === 'choose_credential_fields') {
            cipDefine.init();
        } else if (req.action === 'clear_credentials') {
            cipEvents.clearCredentials();
            return Promise.resolve();
        } else if (req.action === 'activated_tab') {
            cipEvents.triggerActivatedTab();
            return Promise.resolve();
        } else if (req.action === 'redetect_fields') {
            browser.runtime.sendMessage({
                action: 'load_settings',
            }).then((response) => {
                cip.settings = response;
                cip.initCredentialFields(true);
            });
        } else if (req.action === 'ignore-site') {
            cip.ignoreSite(req.args);
        }
        else if (req.action === 'check_database_hash' && 'hash' in req) {
            cip.detectDatabaseChange(req.hash);
        }
    }
});
