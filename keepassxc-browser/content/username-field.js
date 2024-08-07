'use strict';

const kpxcUsernameIcons = {};
kpxcUsernameIcons.icons = [];
kpxcUsernameIcons.detectedFields = [];

kpxcUsernameIcons.newIcon = function(field, databaseState = DatabaseState.DISCONNECTED) {
    kpxcUsernameIcons.icons.push(new UsernameFieldIcon(field, databaseState));
};

kpxcUsernameIcons.switchIcon = function(state) {
    kpxcUsernameIcons.icons.forEach(u => u.switchIcon(state));
};

kpxcUsernameIcons.deleteHiddenIcons = function() {
    kpxcUI.deleteHiddenIcons(kpxcUsernameIcons.icons);
};

kpxcUsernameIcons.isValid = function(field) {
    if (!field
        || field.offsetWidth < MIN_INPUT_FIELD_OFFSET_WIDTH
        || field.readOnly
        || kpxcIcons.hasIcon(field)
        || (!kpxcFields.isCustomLoginFieldsUsed() && !kpxcFields.isVisible(field))) {
        return false;
    }

    return true;
};


class UsernameFieldIcon extends Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED) {
        super(field, databaseState);

        this.initField(field);
        kpxcUI.monitorIconPosition(this);
    }

    switchIcon(state) {
        if (!this.icon) {
            return;
        } else {
            this.observer.disconnect();
        }

        this.icon.classList.remove('lock', 'lock-moz', 'unlock', 'unlock-moz', 'disconnected', 'disconnected-moz');
        this.icon.classList.add(getIconClassName(state));
        this.icon.title = getIconText(state);

        if (kpxc.credentials.length === 0 && state === DatabaseState.UNLOCKED) {
            this.icon.style.filter = 'saturate(0%)';
        } else {
            this.icon.style.filter = 'saturate(100%)';
        }
    }
}

UsernameFieldIcon.prototype.initField = function(field) {
    // Observer the visibility
    if (this.observer) {
        this.observer.observe(field);
    }

    this.createIcon(field);
    this.inputField = field;
};

UsernameFieldIcon.prototype.createIcon = function(field) {
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

        e.stopPropagation();
        iconClicked(field, icon);
    });

    icon.addEventListener('mousedown', ev => ev.stopPropagation());
    icon.addEventListener('mouseup', ev => ev.stopPropagation());

    kpxcUI.setIconPosition(icon, field, this.rtl);
    this.icon = icon;
    this.createWrapper('css/username.css');
};

const iconClicked = async function(field, icon) {
    if (!kpxcFields.isCustomLoginFieldsUsed() && !kpxcFields.isVisible(field)) {
        icon.parentNode.removeChild(icon);
        return;
    }

    // Try to reconnect if KeePassXC for the case we're not currently connected
    const connected = await kpxc.reconnect();
    if (!connected) {
        return;
    }

    if (kpxc.databaseState !== DatabaseState.UNLOCKED) {
        // Triggers database unlock
        await sendMessage('page_set_manual_fill', ManualFill.BOTH);
        await sendMessage('get_database_hash', [ false, true ]); // Set triggerUnlock to true
        field.focus();
    }

    if (icon.className.includes('unlock')) {
        fillCredentials(field);
    }
};

const getIconClassName = function(state = DatabaseState.UNLOCKED) {
    if (state === DatabaseState.LOCKED) {
        return (isFirefox() ? 'lock-moz' : 'lock');
    } else if (state === DatabaseState.DISCONNECTED) {
        return (isFirefox() ? 'disconnected-moz' : 'disconnected');
    }

    return (isFirefox() ? 'unlock-moz' : 'unlock');
};

const getIconText = function(state) {
    if (state === DatabaseState.LOCKED) {
        return tr('usernameLockedFieldText');
    } else if (state === DatabaseState.DISCONNECTED) {
        return tr('usernameDisconnectedFieldText');
    }

    return kpxc.credentials.length === 0 ? tr('usernameFieldTextNoCredentials') : tr('usernameFieldText');
};

const fillCredentials = async function(field) {
    const combination = await kpxcFields.getCombination(field);
    kpxcFill.fillFromUsernameIcon(combination);
};
