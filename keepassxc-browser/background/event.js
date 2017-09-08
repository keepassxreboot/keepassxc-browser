var event = {};

event.onMessage = function(request, sender, callback) {
	if (request.action in event.messageHandlers) {
		//console.log('onMessage(' + request.action + ') for #' + sender.tab.id);
		if (!sender.hasOwnProperty('tab') || sender.tab.id < 1) {
			sender.tab = {};
			sender.tab.id = page.currentTabId;
		}

		event.invoke(event.messageHandlers[request.action], callback, sender.tab.id, request.args);

		// onMessage closes channel for callback automatically
		// if this method does not return true
		if (callback) {
			return true;
		}
	}
}

/**
 * Get interesting information about the given tab.
 * Function adapted from AdBlock-Plus.
 *
 * @param {function} handler to call after invoke
 * @param {function} callback to call after handler or null
 * @param {integer} senderTabId
 * @param {array} args
 * @param {bool} secondTime
 * @returns null (asynchronous)
 */
event.invoke = function(handler, callback, senderTabId, args, secondTime) {
	if (senderTabId < 1) {
		return;
	}

	if (!page.tabs[senderTabId]) {
		page.createTabEntry(senderTabId);
	}

	// remove information from no longer existing tabs
	page.removePageInformationFromNotExistingTabs();

	browser.tabs.get(senderTabId).then((tab) => {
		if (!tab) {
			return;
		}

		if (!tab.url) {
			// Issue 6877: tab URL is not set directly after you opened a window
			// using window.open()
			if (!secondTime) {
				window.setTimeout(function() {
					event.invoke(handler, callback, senderTabId, args, true);
				}, 250);
			}
			return;
		}

		if (!page.tabs[tab.id]) {
			page.createTabEntry(tab.id);
		}

		args = args || [];

		args.unshift(tab);
		args.unshift(callback);

		if (handler) {
			handler.apply(this, args);
		}
		else {
			console.log('undefined handler for tab ' + tab.id);
		}
	});
}


event.onShowAlert = function(callback, tab, message) {
	if (page.settings.supressAlerts) { console.log(message); }
	else { alert(message); }
}

event.showStatus = function(configured, tab, callback) {
	let keyId = null;
	if (configured) {
		keyId = keepass.keyRing[keepass.databaseHash].id;
	}

	browserAction.showDefault(null, tab);
	const errorMessage = page.tabs[tab.id].errorMessage;
	callback({
		identifier: keyId,
		configured: configured,
		databaseClosed: keepass.isDatabaseClosed,
		keePassXCAvailable: keepass.isKeePassXCAvailable,
		encryptionKeyUnrecognized: keepass.isEncryptionKeyUnrecognized,
		associated: keepass.isAssociated(),
		error: errorMessage ? errorMessage : null
	});
}

event.onLoadSettings = function(callback, tab) {
	browser.storage.local.get({'settings': {}}).then((item) => {
		callback(item.settings);
	}, (err) => {
		console.log('error loading settings: ' + err);
	});
}

event.onLoadKeyRing = function(callback, tab) {
	browser.storage.local.get({'keyRing': {}}).then(function(item) {
		keepass.keyRing = item.keyRing;
		if (keepass.isAssociated() && !keepass.keyRing[keepass.associated.hash]) {
			keepass.associated = {
				"value": false,
				"hash": null
			};
		}
		callback(item.keyRing);
	}, (err) => {
		console.log('error loading keyRing: ' + err);
	});
}

event.onSaveSettings = function(callback, tab, settings) {
	browser.storage.local.set({'settings': settings}).then(function() {
		event.onLoadSettings();
	});
}

event.onGetStatus = function(callback, tab) {
	keepass.testAssociation((response) => {
		keepass.isConfigured((configured) => {
			event.showStatus(configured, tab, callback);
		});
	}, tab);
}

event.onReconnect = function(callback, tab) {
	keepass.connectToNative();

	// Add a small timeout after reconnecting. Just to make sure. It's not pretty, I know :(
	setTimeout(() => { 
		keepass.generateNewKeyPair();
		keepass.changePublicKeys(tab, (pkRes) => {
			keepass.getDatabaseHash((gdRes) => {
				if (gdRes) {
					keepass.testAssociation((response) => {
						keepass.isConfigured((configured) => {
							event.showStatus(configured, tab, callback);
						});
					}, tab);
				}
			}, null);
		});
	}, 2000);
}

event.onPopStack = function(callback, tab) {
	browserAction.stackPop(tab.id);
	browserAction.show(null, tab);
}

event.onGetTabInformation = function(callback, tab) {
	const id = tab.id || page.currentTabId;
	callback(page.tabs[id]);
}

event.onGetConnectedDatabase = function(callback, tab) {
	callback({
		count: Object.keys(keepass.keyRing).length,
		identifier: (keepass.keyRing[keepass.associated.hash]) ? keepass.keyRing[keepass.associated.hash].id : null
	});
}

event.onGetKeePassXCVersions = function(callback, tab) {
	if (keepass.currentKeePassXC.version === 0) {
		keepass.getDatabaseHash((response) => {
			callback({current: keepass.currentKeePassXC.version, latest: keepass.latestKeePassXC.version});
		}, tab);
	}
	callback({current: keepass.currentKeePassXC.version, latest: keepass.latestKeePassXC.version});
}

event.onCheckUpdateKeePassXC = function(callback, tab) {
	keepass.checkForNewKeePassXCVersion();
	callback({current: keepass.currentKeePassXC.version, latest: keepass.latestKeePassXC.version});
}

event.onUpdateAvailableKeePassXC = function(callback, tab) {
	callback(keepass.keePassXCUpdateAvailable());
}

event.onRemoveCredentialsFromTabInformation = function(callback, tab) {
	const id = tab.id || page.currentTabId;
	page.clearCredentials(id);
}

event.onSetRememberPopup = function(callback, tab, username, password, url, usernameExists, credentialsList) {
	browserAction.setRememberPopup(tab.id, username, password, url, usernameExists, credentialsList);
}

event.onLoginPopup = function(callback, tab, logins) {
	let stackData = {
		level: 1,
		iconType: 'questionmark',
		popup: 'popup_login.html'
	}
	browserAction.stackUnshift(stackData, tab.id);
	page.tabs[tab.id].loginList = logins;
	browserAction.show(null, tab);
}

event.onHTTPAuthPopup = function(callback, tab, data) {
	let stackData = {
		level: 1,
		iconType: 'questionmark',
		popup: 'popup_httpauth.html'
	}
	browserAction.stackUnshift(stackData, tab.id);
	page.tabs[tab.id].loginList = data;
	browserAction.show(null, tab);
}

event.onMultipleFieldsPopup = function(callback, tab) {
	let stackData = {
		level: 1,
		iconType: 'normal',
		popup: 'popup_multiple-fields.html'
	}
	browserAction.stackUnshift(stackData, tab.id);
	browserAction.show(null, tab);
}

event.onPageClearLogins = function(callback, tab) {
	page.clearLogins(tab.id);
	callback();
}

// all methods named in this object have to be declared BEFORE this!
event.messageHandlers = {
	'add_credentials': keepass.addCredentials,
	'alert': event.onShowAlert,
	'associate': keepass.associate,
	'check_update_keepassxc': event.onCheckUpdateKeePassXC,
	'get_connected_database': event.onGetConnectedDatabase,
	'get_keepassxc_versions': event.onGetKeePassXCVersions,
	'get_status': event.onGetStatus,
	'get_tab_information': event.onGetTabInformation,
	'load_keyring': event.onLoadKeyRing,
	'load_settings': event.onLoadSettings,
	'page_clear_logins': event.onPageClearLogins,
	'pop_stack': event.onPopStack,
	'popup_login': event.onLoginPopup,
	'popup_multiple-fields': event.onMultipleFieldsPopup,
	'remove_credentials_from_tab_information': event.onRemoveCredentialsFromTabInformation,
	'retrieve_credentials': keepass.retrieveCredentials,
	'show_default_browseraction': browserAction.showDefault,
	'update_credentials': keepass.updateCredentials,
	'save_settings': event.onSaveSettings,
	'set_remember_credentials': event.onSetRememberPopup,
	'stack_add': browserAction.stackAdd,
	'update_available_keepassxc': event.onUpdateAvailableKeePassXC,
	'generate_password': keepass.generatePassword,
	'reconnect': event.onReconnect
};