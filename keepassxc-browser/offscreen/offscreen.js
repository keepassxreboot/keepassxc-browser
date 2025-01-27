chrome.runtime.onMessage.addListener(({ target, action }, sender, sendResponse) => {
    if (target !== 'offscreen') {
        return;
    }
    if (action === 'retrieve_color_scheme') {
        const style = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        sendResponse(style);
    }
});
