'use strict';

var isFirefox = function() {
    if (!(/Chrome/.test(navigator.userAgent) && /Google/.test(navigator.vendor))) {
        return true;
    }
    return false;
};

var showNotification = function(message) {
    browser.notifications.create({
        'type': 'basic',
        'iconUrl': browser.extension.getURL('icons/keepassxc_64x64.png'),
        'title': 'KeePassXC-Browser',
        'message': message
    });
};
