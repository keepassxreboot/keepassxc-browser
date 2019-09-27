'use strict';

// jQuery style wrapper for querySelector()
var $ = function(elem) {
    return document.querySelector(elem);
};

// Returns a string with 'px' for CSS styles
var Pixels = function(value) {
    return String(value) + 'px';
};

var kpxcUI = {};

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

kpxcUI.updateIconPosition = function(iconClass) {
    if (iconClass.inputField && iconClass.icon) {
        kpxcUI.setIconPosition(iconClass.icon, iconClass.inputField);
    }
};

kpxcUI.setIconPosition = function(icon, field) {
    const rect = field.getBoundingClientRect();
    const offset = Number(icon.getAttribute('offset'));
    const size = Number(icon.getAttribute('size'));

    icon.style.top = Pixels((rect.top + document.scrollingElement.scrollTop) + offset + 1);
    icon.style.left = Pixels((rect.left + document.scrollingElement.scrollLeft) + field.offsetWidth - size - offset);
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
                kpxcUI.setIconPosition(iconClass.icon, entry.target);
            }, 500);
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

// Enables dragging
document.addEventListener('mousemove', function(e) {
    if (kpxcPassword.selected === kpxcPassword.titleBar) {
        const xPos = e.clientX - kpxcPassword.diffX;
        const yPos = e.clientY - kpxcPassword.diffY;

        if (kpxcPassword.selected !== null) {
            kpxcPassword.dialog.style.left = Pixels(xPos);
            kpxcPassword.dialog.style.top = Pixels(yPos);
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

document.addEventListener('mouseup', function() {
    kpxcPassword.selected = null;
    kpxcDefine.selected = null;
});

HTMLDivElement.prototype.appendMultiple = function(...args) {
    for (const a of args) {
        this.append(a);
    }
};

Element.prototype.getLowerCaseAttribute = function(attr) {
    return this.getAttribute(attr) ? this.getAttribute(attr).toLowerCase() : undefined;
};
