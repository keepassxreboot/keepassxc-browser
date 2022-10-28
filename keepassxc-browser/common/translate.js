'use strict';

const items = document.querySelectorAll('[data-i18n]');
for (const item of items) {
    let key = item.getAttribute('data-i18n');
    if (key) {
        let attr = '';
        [ attr, key ] = trAttribute(key);

        const placeholder = item.getAttribute('data-i18n-placeholder');
        const translation = placeholder ? browser.i18n.getMessage(key, placeholder) : browser.i18n.getMessage(key);
        if (attr) {
            item.setAttribute(attr, translation);
        } else if (item.hasAttribute('href')) {
            item.text = translation;
        } else {
            item.innerHTML = translation;
        }

        // Remove the translation attribute from the HTML element
        item.removeAttribute('data-i18n');
    }
}

// Check if a custom attribute is being translated using [attribute]key
function trAttribute(key) {
    let attr = /\[(\w+)\]/.exec(key);
    if (attr) {
        attr = attr[1];
        key = key.slice(key.indexOf(']') + 1);
    }

    return [ attr, key ];
}
