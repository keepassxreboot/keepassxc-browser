'use strict';

/**
 * @Object kpxcIcons
 * Icon handling.
 */
const kpxcIcons = {};
kpxcIcons.icons = [];
kpxcIcons.iconTypes = { USERNAME: 0, PASSWORD: 1, TOTP: 2 };

// Adds an icon to input field
kpxcIcons.addIcon = async function(field, iconType) {
    if (!field || iconType < 0 || iconType > 2) {
        return;
    }

    let iconSet = false;
    if (iconType === kpxcIcons.iconTypes.USERNAME && kpxcUsernameIcons.isValid(field)) {
        kpxcUsernameIcons.newIcon(field, kpxc.databaseState);
        iconSet = true;
    } else if (iconType === kpxcIcons.iconTypes.PASSWORD && kpxcPasswordIcons.isValid(field)) {
        kpxcPasswordIcons.newIcon(field, kpxc.databaseState);
        iconSet = true;
    } else if (iconType === kpxcIcons.iconTypes.TOTP && kpxcTOTPIcons.isValid(field)) {
        kpxcTOTPIcons.newIcon(field, kpxc.databaseState);
        iconSet = true;
    }

    if (iconSet) {
        kpxcIcons.icons.push({
            field: field,
            iconType: iconType
        });
    }
};

// Adds all icons from a form struct
kpxcIcons.addIconsFromForm = async function(form) {
    const addUsernameIcons = async function(c) {
        if (kpxc.settings.showLoginFormIcon && await kpxc.passwordFilledWithExceptions(c) === false) {
            // Special case where everything else has been hidden, but a single password field is now displayed.
            // For example PayPal and Amazon is handled like this.
            if (c.username && !c.password && c.passwordInputs.length === 1) {
                kpxcIcons.addIcon(c.passwordInputs[0], kpxcIcons.iconTypes.USERNAME);
            }

            if (c.username && !c.username.readOnly) {
                kpxcIcons.addIcon(c.username, kpxcIcons.iconTypes.USERNAME);
            } else if (c.password && (!c.username || (c.username && c.username.readOnly))) {
                // Single password field
                kpxcIcons.addIcon(c.password, kpxcIcons.iconTypes.USERNAME);
            }
        }
    };

    const addPasswordIcons = async function(c) {
        // Show password icons also with forms without any username field
        if (kpxc.settings.usePasswordGeneratorIcons
            && ((c.username && c.password) || (!c.username && c.passwordInputs.length > 0))) {
            for (const input of c.passwordInputs) {
                kpxcIcons.addIcon(input, kpxcIcons.iconTypes.PASSWORD);
            }
        }
    };

    const addTOTPIcons = async function(c) {
        if (c.totp && kpxc.settings.showOTPIcon) {
            kpxcIcons.addIcon(c.totp, kpxcIcons.iconTypes.TOTP);
        }
    };

    await Promise.all([
        await addUsernameIcons(form),
        await addPasswordIcons(form),
        await addTOTPIcons(form)
    ]);
};

// Delete all icons that have been hidden from the page view
kpxcIcons.deleteHiddenIcons = function() {
    kpxcUsernameIcons.deleteHiddenIcons();
    kpxcPasswordIcons.deleteHiddenIcons();
    kpxcTOTPIcons.deleteHiddenIcons();
};

// Initializes all icons needed to be shown
kpxcIcons.initIcons = async function(combinations = []) {
    if (combinations.length === 0) {
        return;
    }

    for (const form of kpxcForm.savedForms) {
        await kpxcIcons.addIconsFromForm(form);
    }

    // Check for other combinations that are not in any form,
    // or there's a form that wasn't present in savedForms (and it's not null)
    for (const c of combinations) {
        if (!c.form || (c.form && !kpxcForm.savedForms.some(sf => sf.form === c.form))) {
            await kpxcIcons.addIconsFromForm(c);
        }
    }
};

kpxcIcons.hasIcon = function(field) {
    return !field ? false : kpxcIcons.icons.some(i => i.field === field);
};

// Sets the icons to corresponding database lock status
kpxcIcons.switchIcons = async function() {
    const uuid = await sendMessage('page_get_login_id');

    kpxcUsernameIcons.switchIcon(kpxc.databaseState, uuid);
    kpxcPasswordIcons.switchIcon(kpxc.databaseState, uuid);
    kpxcTOTPIcons.switchIcon(kpxc.databaseState, uuid);
};
