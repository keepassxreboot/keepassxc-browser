'use strict';

HTMLElement.prototype.show = function() {
    this.style.display = 'block';
};

HTMLElement.prototype.hide = function() {
    this.style.display = 'none';
};

// Disables the browser's internal password manager and let the extension take the control
const updateDefaultPasswordManager = async function() {
    const permissionResponse = await browser.permissions.request({ permissions: [ 'privacy' ] });
    if (!permissionResponse) {
        return false;
    }

    const passwordSavingEnabled = await browser.privacy.services.passwordSavingEnabled.get({});
    if (passwordSavingEnabled?.levelOfControl === 'controllable_by_this_extension') {
        await browser.privacy.services.passwordSavingEnabled.set({
            value: false,
        });
        return true;
    } else if (passwordSavingEnabled?.levelOfControl === 'controlled_by_this_extension') {
        await browser.privacy.services.passwordSavingEnabled.clear({});
    }

    return false;
};
