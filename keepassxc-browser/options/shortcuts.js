'use strict';

let tempArray = [];
let keyArray = [];

document.querySelectorAll('input').forEach((b) => {
    b.addEventListener('keydown', e => handleKeyDown(e));
    b.addEventListener('keyup', e => handleKeyUp(e));
});

const saveButtons = document.querySelectorAll('.save-btn');
for (const b of saveButtons) {
    b.addEventListener('click', e => {
        updateShortcut(b.parentElement.parentElement.children[0].getAttribute('id'))
    });
}

const resetButtons = document.querySelectorAll('.reset-btn');
for (const b of resetButtons) {
    b.addEventListener('click', e => {
        resetShortcut(b.parentElement.parentElement.children[0].getAttribute('id'))
    });
}

async function handleKeyDown(e) {
    if (!e.repeat) {
        e.currentTarget.value = '';

        // Transform single keys to upper case for comparison
        const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        tempArray.push(key);
        keyArray.push(key);
    }
}

async function handleKeyUp(e) {
    if (!e.repeat) {
        e.currentTarget.value = '';
        const index = tempArray.indexOf(e.key.length === 1 ? e.key.toUpperCase() : e.key);
        if (index !== -1) {
            tempArray.splice(index, 1);
        }

        if (tempArray.length === 0) {
            let text = '';
            for (let i = 0; i < keyArray.length; ++i) {
                const currentText = keyArray[i] === 'Control' ? handleControl() : keyArray[i];
                text += currentText;
                if (i !== keyArray.length - 1) {
                    text += '+';
                }
            }

            keyArray = [];
            e.currentTarget.value = text;
        }
    }
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
            shortcut: document.querySelector(`#${shortcut}`).value
        });
        createAlert('success', shortcut);
    } catch(e) {
        console.log('Cannot change shortcut: ', e);
        createAlert('danger', shortcut);
    }
}

async function resetShortcut(shortcut) {
    await browser.commands.reset(shortcut);
    createAlert('info', shortcut);
    updateKeys();
}

// Ctrl behaves differently on different OS's. macOS needs to return MacCtrl instead of Ctrl (which will be handled as Command)
function handleControl() {
    return (navigator.platform === 'MacIntel') ? 'MacCtrl' : 'Ctrl';
}

const alertArea = document.querySelector('#alert-area');

/**
 * Creates a new alert that will disappear after 5 seconds
 * @param {'success' | 'danger' | 'info' } type - type of the alert
 * @param shortcut
 */
function createAlert(type, shortcut) {
    const alert = document.createElement('div');
    alert.classList.add('alert', 'alert-dismissible', `alert-${type}`, 'fade', 'in');
    alert.role = 'alert';

    if (type === 'success') {
        alert.textContent = tr('optionsShortcutsSuccess', shortcut);
    } else if (type === 'info') {
        alert.textContent = tr('optionsShortcutsInfo', shortcut);
    } else if (type === 'danger') {
        alert.textContent = tr('optionsShortcutsDanger', shortcut);
    } else {
        throw new TypeError(`Unknown alert type ${type}`);
    }

    alertArea.appendChild(alert);

    // Destroy the alert after five seconds
    setTimeout(() => {
        alertArea.removeChild(alert);
    }, 5000);
}

document.addEventListener('DOMContentLoaded', updateKeys);
