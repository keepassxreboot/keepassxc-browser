'use strict';

// jQuery style wrapper for querySelector()
var $ = function(elem) {
    return document.querySelector(elem);
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

// Enables dragging
document.addEventListener('mousemove', function(e) {
    if (kpxcPassword.selected === kpxcPassword.titleBar) {
        const xPos = e.clientX - kpxcPassword.diffX;
        const yPos = e.clientY - kpxcPassword.diffY;

        if (kpxcPassword.selected !== null) {
            kpxcPassword.dialog.style.left = xPos + 'px';
            kpxcPassword.dialog.style.top = yPos + 'px';
        }
    }

    if (kpxcDefine.selected === kpxcDefine.dialog) {
        const xPos = e.clientX - kpxcDefine.diffX;
        const yPos = e.clientY - kpxcDefine.diffY;

        if (kpxcDefine.selected !== null) {
            kpxcDefine.dialog.style.left = xPos + 'px';
            kpxcDefine.dialog.style.top = yPos + 'px';
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
