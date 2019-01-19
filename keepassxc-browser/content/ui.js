'use strict';

// jQuery style wrapper for querySelector()
var $ = function(elem)
{
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
document.onmousemove = function(e) {
    if (kpxcPassword.selected === kpxcPassword.titleBar) {
        const x_pos = e.clientX - kpxcPassword.diffX;
        const y_pos = e.clientY - kpxcPassword.diffY;

        if (kpxcPassword.selected !== null) {
            kpxcPassword.dialog.style.left = x_pos + 'px';
            kpxcPassword.dialog.style.top = y_pos + 'px';
        }
    }

    if (kpxcDefine.selected === kpxcDefine.dialog) {
        const x_pos = e.clientX - kpxcDefine.diffX;
        const y_pos = e.clientY - kpxcDefine.diffY;

        if (kpxcDefine.selected !== null) {
            kpxcDefine.dialog.style.left = x_pos + 'px';
            kpxcDefine.dialog.style.top = y_pos + 'px';
        }
    }
};

document.onmouseup = function() {
    kpxcPassword.selected = null;
    kpxcDefine.selected = null;
};

HTMLDivElement.prototype.appendMultiple = function(...args) {
    for (const a of args) {
        this.append(a);
    }
};
