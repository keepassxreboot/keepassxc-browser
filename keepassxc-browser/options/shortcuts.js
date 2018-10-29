'use strict';

let tempArray = [];
let keyArray = [];

document.querySelectorAll('input').forEach((b) => {
    b.addEventListener('keydown', e => handleKeyDown(e));
    b.addEventListener('keyup', e => handleKeyUp(e));
});

const saveButtons = document.querySelectorAll('.btn-primary');
for (const b of saveButtons) {
    b.addEventListener('click', e => {
        updateShortcut(b.parentElement.children[1].getAttribute('id'))
    });
}

const resetButtons = document.querySelectorAll('.btn-danger');
for (const b of resetButtons) {
    b.addEventListener('click', e => {
        resetShortcut(b.parentElement.children[1].getAttribute('id'))
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
};

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
};

async function updateKeys() {
    const commands = await browser.commands.getAll();
    for (const c of commands) {
        const elem = document.getElementById(c.name);
        if (elem) {
            elem.value = c.shortcut;
        }
    }
};

async function updateShortcut(shortcut) {
    try {
         await browser.commands.update({
            name: shortcut,
            shortcut: document.querySelector('#' + shortcut).value
        });
        createBanner('success', shortcut);
    } catch(e) {
        console.log('Cannot change shortcut: ' + e);
        createBanner('danger', shortcut);
    }
};

async function resetShortcut(shortcut) {
    await browser.commands.reset(shortcut);
    createBanner('info', shortcut);
    updateKeys();
};

// Ctrl behaves differently on different OS's. macOS needs to return MacCtrl instead of Ctrl (which will be handled as Command)
function handleControl() {
    return (navigator.platform === 'MacIntel') ? 'MacCtrl' : 'Ctrl';
}

// Possible types: success, info, danger
function createBanner(type, shortcut) {
    const banner = document.createElement('div');
    banner.classList.add('alert', 'alert-dismissible', 'alert-' + type, 'fade', 'in');

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
};

document.addEventListener('DOMContentLoaded', updateKeys);
