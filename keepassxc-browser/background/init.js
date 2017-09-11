// since version 2.0 the extension is using a keyRing instead of a single key-name-pair
keepass.migrateKeyRing().then(() => {
	// load settings
	page.initSettings().then(() => {
		// initial connection with KeePassHttp
		keepass.connectToNative();
		keepass.generateNewKeyPair();
		keepass.changePublicKeys(null, (pkRes) => {
			// create tab information structure for every opened tab
			page.initOpenedTabs().then(() => {
				keepass.getDatabaseHash((gdRes) => {
					
				}, null);
			});
		});
	});
});

// Milliseconds for intervall (e.g. to update browserAction)
let _interval = 250;


/**
 * Generate information structure for created tab and invoke all needed
 * functions if tab is created in foreground
 * @param {object} tab
 */
browser.tabs.onCreated.addListener((tab) => {
	if (tab.id > 0) {
		//console.log('browser.tabs.onCreated(' + tab.id+ ')');
		if (tab.selected) {
			page.currentTabId = tab.id;
			event.invoke(page.switchTab, null, tab.id, []);
		}
	}
});

/**
 * Remove information structure of closed tab for freeing memory
 * @param {integer} tabId
 * @param {object} removeInfo
 */
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
	delete page.tabs[tabId];
	if (page.currentTabId === tabId) {
		page.currentTabId = -1;
	}
});

/**
 * Remove stored credentials on switching tabs.
 * Invoke functions to retrieve credentials for focused tab
 * @param {object} activeInfo
 */
browser.tabs.onActivated.addListener((activeInfo) => {
	// remove possible credentials from old tab information
    page.clearCredentials(page.currentTabId, true);
	browserAction.removeRememberPopup(null, {'id': page.currentTabId}, true);

	browser.tabs.get(activeInfo.tabId).then((info) => {
		if (info && info.id) {
			page.currentTabId = info.id;
			if (info.status === 'complete') {
				//console.log('event.invoke(page.switchTab, null, '+info.id + ', []);');
				event.invoke(page.switchTab, null, info.id, []);
			}
		}
	});
});

/**
 * Update browserAction on every update of the page
 * @param {integer} tabId
 * @param {object} changeInfo
 */
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete') {
		event.invoke(browserAction.removeRememberPopup, null, tabId, []);
	}
});

// Retrieve Credentials and try auto-login for HTTPAuth requests
if (browser.webRequest.onAuthRequired) {
	let handleReq = httpAuth.handleRequestPromise;
	let reqType = 'blocking';
	let opts = { urls: ['<all_urls>'] };

	if (!isFirefox) {
		handleReq = httpAuth.handleRequestCallback;
		reqType = 'asyncBlocking';
	}

	browser.webRequest.onAuthRequired.addListener(handleReq, opts, [reqType]);
	browser.webRequest.onCompleted.addListener(httpAuth.requestCompleted, opts);
	browser.webRequest.onErrorOccurred.addListener(httpAuth.requestCompleted, opts);
}

browser.runtime.onMessage.addListener(event.onMessage);

const contextMenuItems = [
	{title: 'Fill &User + Pass', action: 'fill_user_pass'},
	{title: 'Fill &Pass Only', action: 'fill_pass_only'},
	{title: 'Show Password &Generator Icons', action: 'activate_password_generator'},
	{title: '&Save credentials', action: 'remember_credentials'}
]

// Create context menu items
for (const item of contextMenuItems) {
	browser.contextMenus.create({
		title: item.title,
		contexts: [ 'editable' ],
		onclick: (info, tab) => {
			browser.tabs.sendMessage(tab.id, {
				action: item.action
			}).catch((e) => {console.log(e);});
		}
	});
}

// Listen for keyboard shortcuts specified by user
browser.commands.onCommand.addListener((command) => {
	if (command === 'fill-username-password') {
		browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
			if (tabs.length) {
				browser.tabs.sendMessage(tabs[0].id, { action: 'fill_user_pass' });
			}
		});
	}

	if (command === 'fill-password') {
		browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
			if (tabs.length) {
				browser.tabs.sendMessage(tabs[0].id, { action: 'fill_pass_only' });
			}
		});
	}
});

// Interval which updates the browserAction (e.g. blinking icon)
window.setInterval(function() {
	browserAction.update(_interval);
}, _interval);