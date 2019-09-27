'use strict';

var kpxcUsernameField = {};
kpxcUsernameField.icon = null;
kpxcUsernameField.inputField = null;

try {
    kpxcUsernameField.observer = new IntersectionObserver((entries) => {
        kpxcUI.updateFromIntersectionObserver(kpxcUsernameField, entries);
    });
} catch (err) {
    console.log(err);
}

kpxcUsernameField.initField = function(field, databaseClosed = true) {
    if (!field || field.getAttribute('kpxc-username-field') === 'true') {
        return;
    }

    field.setAttribute('kpxc-username-field', 'true');

    // Observer the visibility
    if (kpxcUsernameField.observer) {
        kpxcUsernameField.observer.observe(field);
    }

    createIcon(field, databaseClosed);
    kpxcUsernameField.inputField = field;
};

kpxcUsernameField.switchIcon = function(locked) {
    const icons = $('.kpxc-username-icon');
    if (!icons || icons.length === 0) {
        return;
    }
    const icon = icons;

    if (locked) {
        icon.classList.remove(getIconClassName());
        icon.classList.add(getIconClassName(true));
        icon.title = tr('usernameLockedFieldText');
    } else {
        icon.classList.remove(getIconClassName(true));
        icon.classList.add(getIconClassName());
        icon.title = tr('usernameFieldText');
    }
};

const createIcon = function(target, databaseClosed) {
    // Remove any existing password generator icons from the input field
    if (target.getAttribute('kpxc-password-generator')) {
        kpxcPassword.removeIcon(target);
    }

    const field = target;
    const className = getIconClassName(databaseClosed);

    // Size the icon dynamically, but not greater than 24 or smaller than 14
    const size = Math.max(Math.min(24, field.offsetHeight - 4), 14);
    
    // Don't create the icon if the input field is too small
    if (field.offsetWidth < (size * 1.5) || field.offsetHeight < size) {
        kpxcUsernameField.observer.unobserve(field);
        return;
    }

    let offset = Math.floor((field.offsetHeight - size) / 3);
    offset = (offset < 0) ? 0 : offset;

    const icon = kpxcUI.createElement('div', 'kpxc kpxc-username-icon ' + className,
        {
            'title': databaseClosed ? tr('usernameLockedFieldText') : tr('usernameFieldText'),
            'alt': tr('usernameFieldIcon'),
            'size': size,
            'offset': offset,
            'kpxc-pwgen-field-id': field.getAttribute('data-kpxc-id')
        });
    icon.style.zIndex = '10000000';
    icon.style.width = Pixels(size);
    icon.style.height = Pixels(size);

    icon.addEventListener('click', async function(e) {
        if (!e.isTrusted) {
            return;
        }

        e.preventDefault();

        if (!kpxcFields.isVisible(field)) {
            document.body.removeChild(icon);
            field.removeAttribute('kpxc-username-field');
            return;
        }

        const connected = await browser.runtime.sendMessage({ action: 'is_connected' });
        if (!connected) {
            kpxcUI.createNotification('error', tr('errorNotConnected'));
            return;
        }

        const databaseHash = await browser.runtime.sendMessage({ action: 'check_database_hash' });
        if (databaseHash === '') {
            // Triggers database unlock
            _called.manualFillRequested = ManualFill.BOTH;
            await browser.runtime.sendMessage({
                action: 'get_database_hash',
                args: [ false, true ] // Set triggerUnlock to true
            });
        }

        if (icon.className.includes('unlock')) {
            fillCredentials();
        }
    });

    kpxcUI.setIconPosition(icon, field);
    kpxcUsernameField.icon = icon;
    document.body.appendChild(icon);
};

const getIconClassName = function(locked = false) {
    if (locked) {
        return (isFirefox() ? 'lock-moz' : 'lock');
    }
    return (isFirefox() ? 'unlock-moz' : 'unlock');
};

const fillCredentials = function() {
    const fieldId = kpxcUsernameField.inputField.getAttribute('data-kpxc-id');
    kpxcFields.prepareId(fieldId);

    const givenType = kpxcUsernameField.inputField.type === 'password' ? 'password' : 'username';
    const combination = kpxcFields.getCombination(givenType, fieldId);

    kpxc.fillInCredentials(combination, givenType === 'password', false);
};

// Handle icon position on window resize
window.addEventListener('resize', function(e) {
    kpxcUI.updateIconPosition(kpxcUsernameField);
});

// Handle icon position on scroll
window.addEventListener('scroll', function(e) {
    kpxcUI.updateIconPosition(kpxcUsernameField);
});
