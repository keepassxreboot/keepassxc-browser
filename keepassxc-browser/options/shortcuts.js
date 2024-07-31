/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

// From chrome://mozapps/content/extensions/shortcuts.js
const keyOptions = [
    e => String.fromCharCode(e.which), // A letter?
    e => e.code.toUpperCase(), // A letter.
    e => trimPrefix(e.code), // Digit3, ArrowUp, Numpad9.
    e => trimPrefix(e.key), // Digit3, ArrowUp, Numpad9.
    e => remapKey(e.key), // Comma, Period, Space.
];

// From chrome://mozapps/content/extensions/shortcuts.js
const validKeys = new Set([
    'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    'MediaNextTrack', 'MediaPlayPause', 'MediaPrevTrack', 'MediaStop',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'Up', 'Down', 'Left', 'Right', 'Comma', 'Period', 'Space'
]);

// From chrome://mozapps/content/extensions/shortcuts.js
const remapKeys = {
    ',': 'Comma',
    '.': 'Period',
    ' ': 'Space',
};

// From chrome://mozapps/content/extensions/shortcuts.js
function trimPrefix(string) {
    return string.replace(/^(?:Digit|Numpad|Arrow)/, '');
}

// From chrome://mozapps/content/extensions/shortcuts.js
function remapKey(string) {
    if (remapKeys.hasOwnProperty(string)) {
        return remapKeys[string];
    }

    return string;
}

// Modified from chrome://mozapps/content/extensions/shortcuts.js
function getStringForEvent(event) {
    for (const option of keyOptions) {
        const value = option(event);
        if (validKeys.has(value)) {
            return value;
        }
    }

    return '';
}

// From chrome://mozapps/content/extensions/shortcuts.js
function getShortcutForEvent(e) {
    let modifierMap;

    if (navigator.platform === 'MacIntel') {
        modifierMap = {
            MacCtrl: e.ctrlKey,
            Alt: e.altKey,
            Command: e.metaKey,
            Shift: e.shiftKey,
        };
    } else {
        modifierMap = {
            Ctrl: e.ctrlKey,
            Alt: e.altKey,
            Shift: e.shiftKey,
        };
    }

    return Object.entries(modifierMap)
        .filter(([ key, isDown ]) => isDown)
        .map(([ key ]) => key)
        .concat(getStringForEvent(e))
        .join('+');
}

// Modified from chrome://mozapps/content/extensions/shortcuts.js
function shortCutChanged(e) {
    const input = e.target;

    if (e.key === 'Escape') {
        input.blur();
        return;
    } else if (e.key === 'Tab') {
        return;
    }

    if (!e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Avoid triggering back-navigation.
            e.preventDefault();
            e.currentTarget.value = '';
            return;
        }
    }

    e.preventDefault();
    e.stopPropagation();

    const shortcutString = getShortcutForEvent(e);
    if (e.type === 'keyup' || !shortcutString.length) {
        return;
    }

    e.currentTarget.value = shortcutString;
}


(async function() {
    try {
        const settings = await browser.runtime.sendMessage({ action: 'load_settings' });
        let theme = settings['colorTheme'];
        if (theme === 'system') {
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-bs-theme', theme);

        document.querySelectorAll('input').forEach((b) => {
            b.addEventListener('keydown', e => shortCutChanged(e));
        });
    } catch (err) {
        console.log('Error loading options page: ' + err);
    }
})();

const saveButtons = document.querySelectorAll('.btn-primary');
for (const b of saveButtons) {
    b.addEventListener('click', (e) => {
        updateShortcut(b.parentElement.children[1].getAttribute('id'));
    });
}

const resetButtons = document.querySelectorAll('.btn-danger');
for (const b of resetButtons) {
    b.addEventListener('click', (e) => {
        resetShortcut(b.parentElement.children[1].getAttribute('id'));
    });
}

async function updateKeys() {
    const commands = await browser.commands.getAll();
    for (const c of commands) {
        const elem = document.getElementById(c.name);
        if (elem) {
            elem.value = c.shortcut;
        }
    }
}

async function updateShortcut(shortcut) {
    try {
        await browser.commands.update({
            name: shortcut,
            shortcut: document.querySelector('#' + shortcut).value
        });
        createBanner('success', shortcut);
    } catch (err) {
        console.log('Cannot change shortcut: ' + err);
        createBanner('danger', shortcut);
    }
}

async function resetShortcut(shortcut) {
    await browser.commands.reset(shortcut);
    createBanner('info', shortcut);
    updateKeys();
}

// Possible types: success, info, danger
function createBanner(type, shortcut) {
    const banner = document.createElement('div');
    banner.classList.add('alert', 'alert-dismissible', 'alert-' + type);

    if (type === 'success') {
        banner.textContent = tr('optionsShortcutsSuccess', shortcut);
    } else if (type === 'info') {
        banner.textContent = tr('optionsShortcutsInfo', shortcut);
    } else if (type === 'danger') {
        banner.textContent = tr('optionsShortcutsDanger', shortcut);
    } else {
        return;
    }

    document.body.appendChild(banner);

    // Destroy the banner after five seconds
    setTimeout(() => {
        document.body.removeChild(banner);
    }, 5000);
}

document.addEventListener('DOMContentLoaded', updateKeys);
