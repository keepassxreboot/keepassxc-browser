var isFirefox = false;
if (typeof browser !== 'undefined') {
	isFirefox = true;
}

window.browser = (function () { return window.msBrowser || window.browser || window.chrome; })();