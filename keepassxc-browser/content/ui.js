'use strict';

const MIN_TOTP_INPUT_LENGTH = 6;
const MAX_TOTP_INPUT_LENGTH = 10;
const MIN_INPUT_FIELD_WIDTH_PX = 8;
const MIN_INPUT_FIELD_OFFSET_WIDTH = 60;
const MIN_OPACITY = 0.7;
const MAX_OPACITY = 1;

const BLUE_BUTTON = 'kpxc-button kpxc-blue-button';
const GREEN_BUTTON = 'kpxc-button kpxc-green-button';
const ORANGE_BUTTON = 'kpxc-button kpxc-orange-button';
const RED_BUTTON = 'kpxc-button kpxc-red-button';
const GRAY_BUTTON_CLASS = 'kpxc-gray-button';

const ALLOWED_OBSERVER_NODETYPES = [
    Node.ELEMENT_NODE,
    Node.DOCUMENT_NODE,
    Node.DOCUMENT_FRAGMENT_NODE
];

const OBSERVER_OPTIONS = { attributes: true, attributeFilter: [ 'style' ] };

const DatabaseState = {
    DISCONNECTED: 0,
    LOCKED: 1,
    UNLOCKED: 2
};

let notificationWrapper;
let notificationTimeout;

// jQuery style wrapper for querySelector()
const $ = function(elem) {
    return document.querySelector(elem);
};

const kpxcUI = {};
kpxcUI.mouseDown = false;

if (document.body) {
    const bodyRect = document.body.getBoundingClientRect();
    kpxcUI.bodyRect = {
        left: bodyRect.left + window.pageXOffset,
        top: bodyRect.top + window.pageYOffset
    };
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

kpxcUI.getScrollTop = function() {
    return document.defaultView?.scrollY ?? document.scrollingElement?.scrollTop ?? 0;
};

kpxcUI.getScrollLeft = function() {
    return document.defaultView?.scrollX ?? document.scrollingElement?.scrollLeft ?? 0;
};

kpxcUI.getRelativeLeftPosition = function(rect) {
    return kpxcUI.bodyStyle.position.toLowerCase() === 'relative' ? rect.left - kpxcUI.bodyRect.left : rect.left;
};

kpxcUI.getRelativeTopPosition = function(rect) {
    return kpxcUI.bodyStyle.position.toLowerCase() === 'relative' ? rect.top - kpxcUI.bodyRect.top : rect.top;
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

kpxcUI.makeBannerDraggable = function(banner) {
    if (!banner) {
        return;
    }

    banner.draggable = true;

    banner.addEventListener('dragstart', (e) => {
        if (!e.isTrusted) {
            return;
        }

        e.dataTransfer.effectAllowed = 'copyMove';
        document.addEventListener('dragover', preventDefaultDragEnd);
    });

    banner.addEventListener('dragend', async (e) => {
        if (!e.isTrusted || !e.target) {
            return;
        }

        // If dragged to last third of the screen, move banner to bottom.
        // If dragged to first third of the screen, move banner to top.
        // If credential/group dialog is open, move it as well.
        const bannerDialog = e.target.querySelector('.kpxc-banner-dialog');
        if (e.y > e.view.innerHeight * (2 / 3) && e.target.classList.contains('kpxc-banner-on-top')) {
            e.target.classList.remove('kpxc-banner-on-top');
            e.target.classList.add('kpxc-banner-on-bottom');

            if (bannerDialog) {
                bannerDialog.style.top = '';
                bannerDialog.style.bottom = Pixels(e.target.offsetHeight);
                bannerDialog.classList.remove('kpxc-banner-dialog-top');
                bannerDialog.classList.add('kpxc-banner-dialog-bottom');
            }
            await sendMessage('banner_set_position', BannerPosition.BOTTOM);
        } else if (e.y < e.view.innerHeight * (1 / 3) && e.target.classList.contains('kpxc-banner-on-bottom')) {
            e.target.classList.remove('kpxc-banner-on-bottom');
            e.target.classList.add('kpxc-banner-on-top');

            if (bannerDialog) {
                bannerDialog.style.bottom = '';
                bannerDialog.style.top = Pixels(e.target.offsetHeight);
                bannerDialog.classList.remove('kpxc-banner-dialog-bottom');
                bannerDialog.classList.add('kpxc-banner-dialog-top');
            }
            await sendMessage('banner_set_position', BannerPosition.TOP);
        }

        document.removeEventListener('dragover', preventDefaultDragEnd);
    });
};

/**
 * Creates a self-disappearing notification banner to DOM
 * @param {string} type     Notification type: (success, info, warning, error)
 * @param {string} message  The message shown
 */
kpxcUI.createNotification = async function(type, message) {
    if (!kpxc.settings.showNotifications || !type || !message) {
        return;
    }

    // Send the notification to top window from iframe
    if (window.self !== window.top) {
        await sendMessage('frame_message', [ 'notification_from_frame', type, message ]);
        return;
    }

    // Removes notification from the body element
    const removeNotification = function() {
        // Catch cross-domain exception
        let parentBody;
        try {
            parentBody = window.parent.document.body;
        } catch(_e) {
            parentBody = window.document.body;
        }

        if (notificationWrapper && parentBody.contains(notificationWrapper)) {
            parentBody.removeChild(notificationWrapper);
            notificationWrapper = undefined;
            return;
        }

        // Notification is not in the parent
        if (notificationWrapper && parentBody !== window.document.body && window.document.body.contains(notificationWrapper)) {
            window.document.body.removeChild(notificationWrapper);
            notificationWrapper = undefined;
        }
    };

    logDebug(message);

    const notification = kpxcUI.createElement('div', 'kpxc-notification kpxc-notification-' + type, {});
    type = type.charAt(0).toUpperCase() + type.slice(1) + '!';

    const className = getIconClass('kpxc-banner-icon');
    const icon = kpxcUI.createElement('span', className, { 'alt': 'logo' });
    const label = kpxcUI.createElement('span', 'kpxc-label', {}, type);
    const msg = kpxcUI.createElement('span', '', {}, message);

    notification.addEventListener('click', function() {
        removeNotification();
    });

    notification.appendMultiple(icon, label, msg);

    const styleSheet = createStylesheet('css/notification.css');
    notificationWrapper = notificationWrapper || document.createElement('div');
    notificationWrapper.style.all = 'unset';
    notificationWrapper.style.display = 'none';
    styleSheet.addEventListener('load', () => notificationWrapper.style.display = 'block');
    this.shadowRoot = notificationWrapper.attachShadow({ mode: 'closed' });
    if (!this.shadowRoot) {
        return;
    }

    this.shadowRoot.append(styleSheet);
    this.shadowRoot.append(notification);
    document.body.append(notificationWrapper);

    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
    }

    // Destroy the banner after five seconds
    notificationTimeout = setTimeout(() => {
        removeNotification();
    }, 5000);
};

kpxcUI.createButton = function(color, textContent, callback) {
    const button = kpxcUI.createElement('button', color, {}, textContent);
    button.addEventListener('click', callback);
    return button;
};

// Observe and prevent style changes to wrapper div elements
kpxcUI.createWrapperObserver = function() {
    kpxcUI.wrapperObserver = new MutationObserver(function(mutations, obs) {
        for (const mut of mutations) {
            if (mut?.target && mut.target.style?.cssText !== 'all: unset;') {
                mut.target.removeAttribute('style');
                mut.target.style.all = 'unset';
            }
        }
    });
};

kpxcUI.observeWrapper = function(elem) {
    kpxcUI.wrapperObserver?.observe(elem, OBSERVER_OPTIONS);
};

// Observer <html> and <body> style changes
kpxcUI.createPageObserver = function() {
    kpxcUI.pageObserver = new MutationObserver(function(mutations, obs) {
        for (const mut of mutations) {
            const currentStyle = getComputedStyle(mut?.target);
            if (currentStyle.opacity && currentStyle.opacity < MIN_OPACITY) {
                kpxc.clearAllFromPage();
            }
        }
    });

    if (document?.documentElement && ALLOWED_OBSERVER_NODETYPES.includes(document.documentElement.nodeType)) {
        kpxcUI.pageObserver.observe(document.documentElement, OBSERVER_OPTIONS);
    }
    if (document?.body && ALLOWED_OBSERVER_NODETYPES.includes(document.body.nodeType)) {
        kpxcUI.pageObserver.observe(document.body, OBSERVER_OPTIONS);
    }
};

const initColorTheme = function(elem) {
    let theme = kpxc.settings['colorTheme'];
    if (theme === 'system') {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    elem.setAttribute('data-bs-theme', theme);
};

const createStylesheet = function(file) {
    const stylesheet = document.createElement('link');
    stylesheet.setAttribute('rel', 'stylesheet');
    stylesheet.setAttribute('href', browser.runtime.getURL(file));
    return stylesheet;
};

const preventDefaultDragEnd = function(e) {
    e?.preventDefault();
};

const logDebug = function(message, extra) {
    if (kpxc.settings.debugLogging) {
        debugLogMessage(message, extra);
    }
};

const initObservers = function() {
    kpxcUI.createWrapperObserver();
    kpxcUI.createPageObserver();
};

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

    kpxcUI.mouseDown = false;
});

if (document.readyState === 'complete' || (document.readyState !== 'loading' && !document.documentElement.doScroll)) {
    initObservers();
} else {
    document.addEventListener('DOMContentLoaded', initObservers);
}

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
    try {
        return this._attachShadow({ mode: 'closed' });
    } catch (e) {
        logError(e);
    }
};

Object.prototype.shadowSelector = function(value) {
    return this.shadowRoot ? this.shadowRoot.querySelector(value) : undefined;
};

Object.prototype.shadowSelectorAll = function(value) {
    return this.shadowRoot ? this.shadowRoot.querySelectorAll(value) : undefined;
};
