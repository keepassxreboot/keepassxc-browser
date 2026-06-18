'use strict';

/**
 * @Object kpxcIcons
 * Icon handling.
 */
const kpxcIcons = {};
kpxcIcons.icons = [];
kpxcIcons.iconTypes = {
    DEFAULT: 0, // Username icon
    PASSWORD: 1,
    TOTP: 2
};

// Adds an icon to input field
kpxcIcons.addIcon = async function(field, iconType) {
    if (!field || !Object.values(kpxcIcons.iconTypes).includes(iconType)) {
        return;
    }

    let iconSet = false;
    if (iconType === kpxcIcons.iconTypes.DEFAULT && kpxcUsernameIcons.isValid(field)) {
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
                // Use password input directly from form if found (Epicgames)
                const passwordField = c.form?.querySelector('input[type=password]');
                if (c.form && passwordField) {
                    kpxcIcons.addIcon(passwordField, kpxcIcons.iconTypes.DEFAULT);
                } else {
                    kpxcIcons.addIcon(c.passwordInputs[0], kpxcIcons.iconTypes.DEFAULT);
                }
            }
            const usernameFieldVisible = c.username && kpxcFields.isVisible(c.username);
            
            if (c.username && !c.username.readOnly && usernameFieldVisible) {
                kpxcIcons.addIcon(c.username, kpxcIcons.iconTypes.DEFAULT);
            } else if (c.password && (!c.username || (c.username && (c.username.readOnly || !usernameFieldVisible)))) {
                // Single password field, or username field is hidden (e.g. two-step login)
                kpxcIcons.addIcon(c.password, kpxcIcons.iconTypes.DEFAULT);
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

kpxcIcons.calculateIconOffset = function(field, size) {
    const offset = Math.floor((field.offsetHeight / 2) - (size / 2) - 1);
    return (offset < 0) ? 0 : offset;
};

// Delete all icons that have been hidden from the page view
kpxcIcons.deleteAllHiddenIcons = function() {
    kpxcIcons.deleteIcons(kpxcUsernameIcons.icons);
    kpxcIcons.deleteIcons(kpxcPasswordIcons.icons);
    kpxcIcons.deleteIcons(kpxcTOTPIcons.icons);
};

// Delete hidden icons from the list
kpxcIcons.deleteIcons = function(iconList) {
    const deletedIcons = [];
    for (const icon of iconList) {
        if (icon.inputField && (!kpxcFields.isVisible(icon.inputField) || icon.inputField?.disabled)) {
            const index = iconList.indexOf(icon);
            icon.removeIcon();
            iconList.splice(index, 1);
            deletedIcons.push(icon.inputField);

            // Delete the input field from detected fields so the icon can be detected again
            const inputFieldIndex = kpxc.inputs.indexOf(icon.inputField);
            if (inputFieldIndex >= 0) {
                kpxc.inputs.splice(inputFieldIndex, 1);
            }
        }
    }

    // Remove the same icons from kpxcIcons.icons array
    for (const input of deletedIcons) {
        const index = kpxcIcons.icons.findIndex(e => e.field === input);
        if (index >= 0) {
            kpxcIcons.icons.splice(index, 1);
        }
    }
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

kpxcIcons.monitorIconPosition = function(iconClass) {
    // Handle icon position on resize
    window.addEventListener('resize', function(e) {
        kpxcIcons.updateIconPosition(iconClass);
    });

    // Handle icon position on scroll
    window.addEventListener('scroll', function(e) {
        kpxcIcons.updateIconPosition(iconClass);
    });

    window.addEventListener('transitionend', function(e) {
        if (matchesWithNodeName(e.target, 'INPUT') || matchesWithNodeName(e.target, 'TEXTAREA')) {
            kpxcIcons.updateIconPosition(iconClass);
        }
    });
};

kpxcIcons.setIconPosition = function(icon, field, rtl = false, segmented = false) {
    const rect = field.getBoundingClientRect();
    const size = Number(icon.getAttribute('size'));
    const offset = kpxcIcons.calculateIconOffset(field, size);
    const zoom = kpxcUI.bodyStyle.zoom || 1;
    let left = kpxcUI.getRelativeLeftPosition(rect) / zoom;
    let top = kpxcUI.getRelativeTopPosition(rect) / zoom;

    // Add more space for the icon to show it at the right side of the field if TOTP fields are segmented
    if (segmented) {
        left += size + 10;
    }

    // Adjusts the icon offset for certain sites
    const iconOffset = kpxcSites.iconOffset(left, top, size, field?.getLowerCaseAttribute('type'));
    if (iconOffset) {
        left = iconOffset[0];
        top = iconOffset[1];
    }

    const scrollTop = kpxcUI.getScrollTop() / zoom;
    const scrollLeft = kpxcUI.getScrollLeft() / zoom;
    icon.style.top = Pixels(top + scrollTop + offset + 1);
    icon.style.left = rtl
        ? Pixels(left + scrollLeft + offset)
        : Pixels(left + scrollLeft + field.offsetWidth - size - offset);
};

// Sets the icons to corresponding database lock status
kpxcIcons.switchIcons = async function() {
    const uuid = await sendMessage('page_get_login_id');

    kpxcUsernameIcons.switchIcon(kpxc.databaseState, uuid);
    kpxcPasswordIcons.switchIcon(kpxc.databaseState, uuid);
    kpxcTOTPIcons.switchIcon(kpxc.databaseState, uuid);
};

/**
* Detects if the input field appears or disappears -> show/hide the icon
* - boundingClientRect with slightly (< -10) negative values -> hidden
* - intersectionRatio === 0 -> hidden
* - isIntersecting === false -> hidden
* - intersectionRatio > 0 -> shown
* - isIntersecting === true -> shown
*/
kpxcIcons.updateFromIntersectionObserver = function(iconClass, entries) {
    for (const entry of entries) {
        const rect = DOMRectToArray(entry.boundingClientRect);

        if ((entry.intersectionRatio === 0 && !entry.isIntersecting) || (rect.some(x => x < -10))) {
            iconClass.icon.style.display = 'none';
        } else if (entry.intersectionRatio > 0 && entry.isIntersecting) {
            iconClass.icon.style.display = 'block';

            // Wait for possible DOM animations
            setTimeout(() => {
                kpxcIcons.setIconPosition(iconClass.icon, entry.target, iconClass.rtl, iconClass.segmented);
            }, 400);
        }
    }
};

kpxcIcons.updateIconPosition = function(iconClass) {
    if (iconClass.inputField && iconClass.icon) {
        kpxcIcons.setIconPosition(iconClass.icon, iconClass.inputField, iconClass.rtl, iconClass.segmented);
    }
};

const DOMRectToArray = function (domRect) {
    return [
        domRect.bottom,
        domRect.height,
        domRect.left,
        domRect.right,
        domRect.top,
        domRect.width,
        domRect.x,
        domRect.y,
    ];
};
