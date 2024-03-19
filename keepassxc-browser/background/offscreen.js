'use strict';

async function retrieveColorScheme() {
    if (typeof window !== 'undefined') {
        // Firefox does not support the offscreen API but its background script still has a window (so far)
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    const offscreenUrl = browser.runtime.getURL('offscreen/offscreen.html');
    const existingContexts = await browser.runtime.getContexts({
        contextTypes: [ 'OFFSCREEN_DOCUMENT' ],
        documentUrls: [ offscreenUrl ],
    });
    if (existingContexts.length === 0) {
        await browser.offscreen.createDocument({
            url: offscreenUrl,
            reasons: [ 'MATCH_MEDIA' ],
            justification: 'Retrieve color scheme',
        });
    }

    const style = await browser.runtime.sendMessage({
        target: 'offscreen',
        action: 'retrieve_color_scheme',
    });
    if (!style) {
        // if messaging fails then use "light" icon
        return 'light';
    }
    return style;
}
