'use strict';

const MIN_TOTP_INPUT_LENGTH = 6;
const MAX_TOTP_INPUT_LENGTH = 10;
const MIN_INPUT_FIELD_WIDTH_PX = 8;
const MIN_INPUT_FIELD_OFFSET_WIDTH = 60;

const DatabaseState = {
    DISCONNECTED: 0,
    LOCKED: 1,
    UNLOCKED: 2
};

// jQuery style wrapper for querySelector()
const $ = function(elem) {
    return document.querySelector(elem);
};

// Returns a string with 'px' for CSS styles
const Pixels = function(value) {
    return String(value) + 'px';
};

// Basic icon class
class Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED, segmented = false) {
        this.databaseState = databaseState;
        this.icon = null;
        this.inputField = null;
        this.rtl = kpxcUI.isRTL(field);
        this.segmented = segmented;

        try {
            this.observer = new IntersectionObserver((entries) => {
                kpxcUI.updateFromIntersectionObserver(this, entries);
            });
        } catch (err) {
            console.log(err);
        }
    }

    switchIcon(state) {
        if (!this.icon) {
            return;
        }

        if (state === DatabaseState.UNLOCKED) {
            this.icon.style.filter = 'saturate(100%)';
        } else {
            this.icon.style.filter = 'saturate(0%)';
        }
    }

    removeIcon(attr) {
        this.inputField.removeAttribute(attr);
        this.shadowRoot.removeChild(this.icon);
        document.body.removeChild(this.shadowRoot.host);
    }
}

const kpxcUI = {};
kpxcUI.mouseDown = false;

if (document.body) {
    kpxcUI.bodyRect = document.body.getBoundingClientRect();
    kpxcUI.bodyStyle = getComputedStyle(document.body);
}

// Wrapper for creating elements
kpxcUI.createElement = function(type, classes, attributes, textContent) {
    const element = document.createElement(type);

    if (classes) {
        const splitted = classes.split(' ');
        for (const c of splitted) {
            element.classList.add(c);
        }
    }

    if (attributes !== undefined) {
        Object.keys(attributes).forEach((key) => {
            element.setAttribute(key, attributes[key]);
        });
    }

    if (textContent !== undefined) {
        element.textContent = textContent;
    }

    return element;
};

kpxcUI.monitorIconPosition = function(iconClass) {
    // Handle icon position on resize
    window.addEventListener('resize', function(e) {
        kpxcUI.updateIconPosition(iconClass);
    });

    // Handle icon position on scroll
    window.addEventListener('scroll', function(e) {
        kpxcUI.updateIconPosition(iconClass);
    });
};

kpxcUI.updateIconPosition = function(iconClass) {
    if (iconClass.inputField && iconClass.icon) {
        kpxcUI.setIconPosition(iconClass.icon, iconClass.inputField, iconClass.rtl, iconClass.segmented);
    }
};

kpxcUI.calculateIconOffset = function(field, size) {
    const offset = Math.floor((field.offsetHeight - size) / 3);
    return (offset < 0) ? 0 : offset;
};

kpxcUI.setIconPosition = function(icon, field, rtl = false, segmented = false) {
    const rect = field.getBoundingClientRect();
    const size = Number(icon.getAttribute('size'));
    const offset = kpxcUI.calculateIconOffset(field, size);
    let left = kpxcUI.bodyStyle.position.toLowerCase() === 'relative' ? rect.left - kpxcUI.bodyRect.left : rect.left;
    const top = kpxcUI.bodyStyle.position.toLowerCase() === 'relative' ? rect.top - kpxcUI.bodyRect.top : rect.top;

    // Add more space for the icon to show it at the right side of the field if TOTP fields are segmented
    if (segmented) {
        left += size + 10;
    }

    icon.style.top = Pixels(top + document.scrollingElement.scrollTop + offset + 1);
    icon.style.left = rtl
                    ? Pixels((left + document.scrollingElement.scrollLeft) + offset)
                    : Pixels(left + document.scrollingElement.scrollLeft + field.offsetWidth - size - offset);
};

kpxcUI.deleteHiddenIcons = function(iconList, attr) {
    const deletedIcons = [];
    for (const icon of iconList) {
        if (icon.inputField && !kpxcFields.isVisible(icon.inputField)) {
            const index = iconList.indexOf(icon);
            icon.removeIcon(attr);
            iconList.splice(index, 1);
            deletedIcons.push(icon.inputField);
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

kpxcUI.isRTL = function(field) {
    if (!field) {
        return false;
    }

    const style = getComputedStyle(field);
    if (style.textAlign.toLowerCase() === 'left') {
        return false;
    } else if (style.textAlign.toLowerCase() === 'right') {
        return true;
    }

    return kpxcFields.traverseParents(field,
        f => [ 'ltr', 'rtl' ].includes(f.getLowerCaseAttribute('dir')),
        f => ({ 'ltr': false, 'rtl': true })[f.getLowerCaseAttribute('dir')]);
};

/**
* Detects if the input field appears or disappears -> show/hide the icon
* - boundingClientRect with slightly (< -10) negative values -> hidden
* - intersectionRatio === 0 -> hidden
* - isIntersecting === false -> hidden
* - intersectionRatio > 0 -> shown
* - isIntersecting === true -> shown
*/
kpxcUI.updateFromIntersectionObserver = function(iconClass, entries) {
    for (const entry of entries) {
        const rect = DOMRectToArray(entry.boundingClientRect);

        if ((entry.intersectionRatio === 0 && !entry.isIntersecting) || (rect.some(x => x < -10))) {
            iconClass.icon.style.display = 'none';
        } else if (entry.intersectionRatio > 0 && entry.isIntersecting) {
            iconClass.icon.style.display = 'block';

            // Wait for possible DOM animations
            setTimeout(() => {
                kpxcUI.setIconPosition(iconClass.icon, entry.target, iconClass.rtl, iconClass.segmented);
            }, 400);
        }
    }
};

/**
 * Creates a self-disappearing notification banner to DOM
 * @param {string} type     Notification type: (success, info, warning, error)
 * @param {string} message  The message shown
 */
kpxcUI.createNotification = function(type, message) {
    if (!kpxc.settings.showNotifications || !type || !message) {
        return;
    }

    const banner = kpxcUI.createElement('div', 'kpxc-notification kpxc-notification-' + type, {});
    type = type.charAt(0).toUpperCase() + type.slice(1) + '!';

    const className = (isFirefox() ? 'kpxc-banner-icon-moz' : 'kpxc-banner-icon');
    const icon = kpxcUI.createElement('span', className, { 'alt': 'logo' });
    const label = kpxcUI.createElement('span', 'kpxc-label', {}, type);
    const msg = kpxcUI.createElement('span', '', {}, message);

    banner.addEventListener('click', function() {
        document.body.removeChild(banner);
    });

    banner.appendMultiple(icon, label, msg);
    document.body.appendChild(banner);

    // Destroy the banner after five seconds
    setTimeout(() => {
        if ($('.kpxc-notification')) {
            document.body.removeChild(banner);
        }
    }, 5000);
};

const DOMRectToArray = function(domRect) {
    return [ domRect.bottom, domRect.height, domRect.left, domRect.right, domRect.top, domRect.width, domRect.x, domRect.y ];
};

const initColorTheme = function(elem) {
    const colorTheme = kpxc.settings['colorTheme'];

    if (colorTheme === undefined || colorTheme === 'system') {
        elem.removeAttribute('data-color-theme');
    } else {
        elem.setAttribute('data-color-theme', colorTheme);
    }
};

const createStylesheet = function(file) {
    const stylesheet = document.createElement('link');
    stylesheet.setAttribute('rel', 'stylesheet');
    stylesheet.setAttribute('href', browser.runtime.getURL(file));
    return stylesheet;
};

// Enables dragging
document.addEventListener('mousemove', function(e) {
    if (!kpxcUI.mouseDown) {
        return;
    }

    if (kpxcPasswordDialog.selected === kpxcPasswordDialog.titleBar) {
        const xPos = e.clientX - kpxcPasswordDialog.diffX;
        const yPos = e.clientY - kpxcPasswordDialog.diffY;

        if (kpxcPasswordDialog.selected !== null) {
            kpxcPasswordDialog.dialog.style.left = Pixels(xPos);
            kpxcPasswordDialog.dialog.style.top = Pixels(yPos);
        }
    }

    if (kpxcDefine.selected === kpxcDefine.dialog) {
        const xPos = e.clientX - kpxcDefine.diffX;
        const yPos = e.clientY - kpxcDefine.diffY;

        if (kpxcDefine.selected !== null) {
            kpxcDefine.dialog.style.left = Pixels(xPos);
            kpxcDefine.dialog.style.top = Pixels(yPos);
        }
    }
});

document.addEventListener('mousedown', function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcUI.mouseDown = true;
});

document.addEventListener('mouseup', function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcPasswordDialog.selected = null;
    kpxcDefine.selected = null;
    kpxcUI.mouseDown = false;
});

HTMLDivElement.prototype.appendMultiple = function(...args) {
    for (const a of args) {
        this.append(a);
    }
};

Element.prototype.getLowerCaseAttribute = function(attr) {
    return this.getAttribute(attr) ? this.getAttribute(attr).toLowerCase() : undefined;
};

Element.prototype._attachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function () {
    return this._attachShadow({ mode: 'closed' });
};

Object.prototype.shadowSelector = function(value) {
    return this.shadowRoot ? this.shadowRoot.querySelector(value) : undefined;
};

Object.prototype.shadowSelectorAll = function(value) {
    return this.shadowRoot ? this.shadowRoot.querySelectorAll(value) : undefined;
};
