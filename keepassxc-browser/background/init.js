// since version 2.0 the extension is using a keyRing instead of a single key-name-pair
keepass.convertKeyToKeyRing();
// load settings
page.initSettings();
// create tab information structure for every opened tab
page.initOpenedTabs();
// initial connection with KeePassXC
keepass.connectToNative();
keepass.generateNewKeyPair();
keepass.changePublicKeys(null, function(pkRes) {
	keepass.getDatabaseHash(function(gdRes) {}, null);
});

window.browser = (function () {
  return window.msBrowser ||
    window.browser ||
    window.chrome;
})();

// set initial tab-ID
browser.tabs.query({"active": true, "windowId": browser.windows.WINDOW_ID_CURRENT}, function(tabs) {
	if (tabs.length === 0)
		return; // For example: only the background devtools or a popup are opened
	page.currentTabId = tabs[0].id;
});
// Milliseconds for intervall (e.g. to update browserAction)
var _interval = 250;


/**
 * Generate information structure for created tab and invoke all needed
 * functions if tab is created in foreground
 * @param {object} tab
 */
browser.tabs.onCreated.addListener(function(tab) {
	if (tab.id > 0) {
		//console.log("browser.tabs.onCreated(" + tab.id+ ")");
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
browser.tabs.onRemoved.addListener(function(tabId, removeInfo) {
	delete page.tabs[tabId];
	if (page.currentTabId == tabId) {
		page.currentTabId = -1;
	}
});

/**
 * Remove stored credentials on switching tabs.
 * Invoke functions to retrieve credentials for focused tab
 * @param {object} activeInfo
 */
browser.tabs.onActivated.addListener(function(activeInfo) {
	// remove possible credentials from old tab information
    page.clearCredentials(page.currentTabId, true);
	browserAction.removeRememberPopup(null, {"id": page.currentTabId}, true);

	browser.tabs.get(activeInfo.tabId, function(info) {
		//console.log(info.id + ": " + info.url);
		if (info && info.id) {
			page.currentTabId = info.id;
			if (info.status == "complete") {
				//console.log("event.invoke(page.switchTab, null, "+info.id + ", []);");
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
browser.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
	if (changeInfo.status == "complete") {
		event.invoke(browserAction.removeRememberPopup, null, tabId, []);
	}
});


/**
 * Retrieve Credentials and try auto-login for HTTPAuth requests
 */
browser.webRequest.onAuthRequired.addListener(httpAuth.handleRequest,
	{ urls: ["<all_urls>"] }, ["asyncBlocking"]
);

/**
 * Interaction between background-script and front-script
 */
browser.runtime.onMessage.addListener(event.onMessage);


/**
 * Add context menu entry for filling in username + password
 */
browser.contextMenus.create({
	"title": "Fill User + Pass",
	"contexts": [ "editable" ],
	"onclick": function(info, tab) {
		browser.tabs.sendMessage(tab.id, {
			action: "fill_user_pass"
		});
	}
});

/**
 * Add context menu entry for filling in only password which matches for given username
 */
browser.contextMenus.create({
	"title": "Fill Pass Only",
	"contexts": [ "editable" ],
	"onclick": function(info, tab) {
		browser.tabs.sendMessage(tab.id, {
			action: "fill_pass_only"
		});
	}
});

/**
 * Add context menu entry for creating icon for generate-password dialog
 */
browser.contextMenus.create({
	"title": "Show Password Generator Icons",
	"contexts": [ "editable" ],
	"onclick": function(info, tab) {
		browser.tabs.sendMessage(tab.id, {
			action: "activate_password_generator"
		});
	}
});

/**
 * Add context menu entry for creating icon for generate-password dialog
 */
browser.contextMenus.create({
	"title": "Save credentials",
	"contexts": [ "editable" ],
	"onclick": function(info, tab) {
		browser.tabs.sendMessage(tab.id, {
			action: "remember_credentials"
		});
	}
});

/**
 * Listen for keyboard shortcuts specified by user
 */
browser.commands.onCommand.addListener(function(command) {
	if (command === "fill-username-password") {
		browser.tabs.query({ active: true, currentWindow: true }, function(tabs) {
			if (tabs.length) {
				browser.tabs.sendMessage(tabs[0].id, { action: "fill_user_pass" });
			}
		});
	}

	if (command === "fill-password") {
		browser.tabs.query({ active: true, currentWindow: true }, function(tabs) {
			if (tabs.length) {
				browser.tabs.sendMessage(tabs[0].id, { action: "fill_pass_only" });
			}
		});
	}
});

/**
 * Interval which updates the browserAction (e.g. blinking icon)
 */
window.setInterval(function() {
	browserAction.update(_interval);
}, _interval);