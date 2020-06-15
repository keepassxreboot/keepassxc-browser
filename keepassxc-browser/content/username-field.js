'use strict';

const kpxcUsernameIcons = {};
kpxcUsernameIcons.icons = [];

kpxcUsernameIcons.newIcon = function(field, databaseState = DatabaseState.DISCONNECTED) {
    kpxcUsernameIcons.icons.push(new UsernameFieldIcon(field, databaseState));
};

kpxcUsernameIcons.switchIcon = function(state) {
    kpxcUsernameIcons.icons.forEach(u => u.switchIcon(state));
};


class UsernameFieldIcon extends Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED) {
        super();
        this.databaseState = databaseState;
        this.icon = null;
        this.inputField = null;

        this.initField(field);
        kpxcUI.monitorIconPosition(this);
    }

    switchIcon(state) {
        if (!this.icon) {
            return;
        }

        this.icon.classList.remove('lock', 'lock-moz', 'unlock', 'unlock-moz', 'disconnected', 'disconnected-moz');
        this.icon.classList.add(getIconClassName(state));
        this.icon.title = getIconText(state);
    }
}

UsernameFieldIcon.prototype.initField = function(field) {
    if (!field
        || field.getAttribute('kpxc-username-field') === 'true'
        || field.getAttribute('kpxc-totp-field') === 'true'
        || (field.hasAttribute('kpxc-defined') && field.getAttribute('kpxc-defined') !== 'username')
        || !kpxcFields.isVisible(field)
        || field.readOnly) {
        return;
    }

    field.setAttribute('kpxc-username-field', 'true');

    // Observer the visibility
    if (this.observer) {
        this.observer.observe(field);
    }

    this.createIcon(field);
    this.inputField = field;
};

UsernameFieldIcon.prototype.createIcon = function(target) {
    // Remove any existing password generator icons from the input field
    if (target.getAttribute('kpxc-password-generator')) {
        kpxcPasswordDialog.removeIcon(target);
    }

    const field = target;
    const className = getIconClassName(this.databaseState);

    // Size the icon dynamically, but not greater than 24 or smaller than 14
    const size = Math.max(Math.min(24, field.offsetHeight - 4), 14);

    // Don't create the icon if the input field is too small
    if (field.offsetWidth < (size * 1.5) || field.offsetHeight < size) {
        this.observer.unobserve(field);
        return;
    }

    const offset = kpxcUI.calculateIconOffset(field, size);

    const icon = kpxcUI.createElement('div', 'kpxc kpxc-username-icon ' + className,
        {
            'title': getIconText(this.databaseState),
            'alt': tr('usernameFieldIcon'),
            'size': size,
            'offset': offset,
            'kpxc-pwgen-field-id': field.getAttribute('data-kpxc-id')
        });
    icon.style.zIndex = '10000000';
    icon.style.width = Pixels(size);
    icon.style.height = Pixels(size);

    icon.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }

        e.preventDefault();
        iconClicked(field, icon);
    });

    kpxcUI.setIconPosition(icon, field);
    this.icon = icon;

    const styleSheet = document.createElement('link');
    styleSheet.setAttribute('rel', 'stylesheet');
    styleSheet.setAttribute('href', browser.runtime.getURL('css/username.css'));

    const wrapper = document.createElement('div');
    this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    this.shadowRoot.append(styleSheet);
    this.shadowRoot.append(icon);
    document.body.append(wrapper);
};

const iconClicked = async function(field, icon) {
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
        fillCredentials(field);
    }
};

const getIconClassName = function(state = DatabaseState.UNLOCKED) {
    if (state === DatabaseState.LOCKED) {
        return (isFirefox() ? 'lock-moz' : 'lock');
    } else if (state === DatabaseState.DISCONNECTED) {
        return (isFirefox() ? 'lock-disconnected' : 'disconnected');
    }
    return (isFirefox() ? 'unlock-moz' : 'unlock');
};

const getIconText = function(state) {
    if (state === DatabaseState.LOCKED) {
        return tr('usernameLockedFieldText');
    } else if (state === DatabaseState.DISCONNECTED) {
        return tr('usernameDisconnectedFieldText');
    }

    return tr('usernameFieldText');
};

const fillCredentials = function(field) {
    const fieldId = field.getAttribute('data-kpxc-id');
    kpxcFields.prepareId(fieldId);

    const givenType = field.type === 'password' ? 'password' : 'username';
    const combination = kpxcFields.getCombination(givenType, fieldId);

    kpxc.fillInCredentials(combination, givenType === 'password', false);
};
