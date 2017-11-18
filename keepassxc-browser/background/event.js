const kpxcEvent = {};

kpxcEvent.onMessage = function(request, sender, callback) {
	if (request.action in kpxcEvent.messageHandlers) {
		//console.log('onMessage(' + request.action + ') for #' + sender.tab.id);
		if (!sender.hasOwnProperty('tab') || sender.tab.id < 1) {
			sender.tab = {};
			sender.tab.id = page.currentTabId;
		}

		kpxcEvent.invoke(kpxcEvent.messageHandlers[request.action], callback, sender.tab.id, request.args);

		// onMessage closes channel for callback automatically
		// if this method does not return true
		if (callback) {
			return true;
		}
	}
};

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
kpxcEvent.invoke = function(handler, callback, senderTabId, args, secondTime) {
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
					kpxcEvent.invoke(handler, callback, senderTabId, args, true);
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
	}).catch((e) => {console.log(e);});
};

kpxcEvent.onShowAlert = function(callback, tab, message) {
	if (page.settings.supressAlerts) { console.log(message); }
	else { alert(message); }
};

kpxcEvent.showStatus = function(configured, tab, callback) {
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
};

kpxcEvent.onLoadSettings = function(callback, tab) {
	browser.storage.local.get({'settings': {}}).then((item) => {
		callback(item.settings);
	}, (err) => {
		console.log('error loading settings: ' + err);
	});
};

kpxcEvent.onLoadKeyRing = function(callback, tab) {
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
};

kpxcEvent.onSaveSettings = function(callback, tab, settings) {
	browser.storage.local.set({'settings': settings}).then(function() {
		kpxcEvent.onLoadSettings(callback, tab);
	});
};

kpxcEvent.onGetStatus = function(callback, tab, internalPoll = false) {
	// When internalPoll is true the event is triggered from content script in intervals -> don't poll KeePassXC
	if (!internalPoll) {
		keepass.testAssociation((response) => {
			if (!response) {
				kpxcEvent.showStatus(false, tab, callback);
				return;
			}

			keepass.isConfigured().then((configured) => {
				kpxcEvent.showStatus(configured, tab, callback);
			});
		}, tab, true);
	} else {
		keepass.isConfigured().then((configured) => {
			kpxcEvent.showStatus(configured, tab, callback);
		});
	}
};

kpxcEvent.onReconnect = function(callback, tab) {
	keepass.connectToNative();

	// Add a small timeout after reconnecting. Just to make sure. It's not pretty, I know :(
	setTimeout(() => {
		keepass.generateNewKeyPair();
		keepass.changePublicKeys(tab).then((pkRes) => {
			keepass.getDatabaseHash((gdRes) => {
				if (gdRes) {
					keepass.testAssociation((response) => {
						keepass.isConfigured().then((configured) => {
							kpxcEvent.showStatus(configured, tab, callback);
						}).catch((e) => {console.log(e);});
					}, tab);
				}
			}, null);
		});
	}, 2000);
};

kpxcEvent.lockDatabase = function(callback, tab) {
	keepass.lockDatabase(tab).then((response => {
		kpxcEvent.showStatus(true, tab, callback);
	}));
};

kpxcEvent.onPopStack = function(callback, tab) {
	browserAction.stackPop(tab.id);
	browserAction.show(null, tab);
};

kpxcEvent.onGetTabInformation = function(callback, tab) {
	const id = tab.id || page.currentTabId;
	callback(page.tabs[id]);
};

kpxcEvent.onGetConnectedDatabase = function(callback, tab) {
	callback({
		count: Object.keys(keepass.keyRing).length,
		identifier: (keepass.keyRing[keepass.associated.hash]) ? keepass.keyRing[keepass.associated.hash].id : null
	});
};

kpxcEvent.onGetKeePassXCVersions = function(callback, tab) {
	if(keepass.currentKeePassXC.version == 0) {
		keepass.getDatabaseHash((res) => {
			callback({"current": keepass.currentKeePassXC.version, "latest": keepass.currentKeePassXC.version});
		}, tab);
	} else {
		callback({"current": keepass.currentKeePassXC.version, "latest": keepass.currentKeePassXC.version});
}
};

kpxcEvent.onCheckUpdateKeePassXC = function(callback, tab) {
	keepass.checkForNewKeePassXCVersion();
	callback({current: keepass.currentKeePassXC.version, latest: keepass.latestKeePassXC.version});
};

kpxcEvent.onUpdateAvailableKeePassXC = function(callback, tab) {
	callback(keepass.keePassXCUpdateAvailable());
};

kpxcEvent.onRemoveCredentialsFromTabInformation = function(callback, tab) {
	const id = tab.id || page.currentTabId;
	page.clearCredentials(id);
};

kpxcEvent.onSetRememberPopup = function(callback, tab, username, password, url, usernameExists, credentialsList) {
	browserAction.setRememberPopup(tab.id, username, password, url, usernameExists, credentialsList);
};

kpxcEvent.onLoginPopup = function(callback, tab, logins) {
	let stackData = {
		level: 1,
		iconType: 'questionmark',
		popup: 'popup_login.html'
	};
	browserAction.stackUnshift(stackData, tab.id);
	page.tabs[tab.id].loginList = logins;
	browserAction.show(null, tab);
};

kpxcEvent.onHTTPAuthPopup = function(callback, tab, data) {
	let stackData = {
		level: 1,
		iconType: 'questionmark',
		popup: 'popup_httpauth.html'
	};
	browserAction.stackUnshift(stackData, tab.id);
	page.tabs[tab.id].loginList = data;
	browserAction.show(null, tab);
};

kpxcEvent.onMultipleFieldsPopup = function(callback, tab) {
	let stackData = {
		level: 1,
		iconType: 'normal',
		popup: 'popup_multiple-fields.html'
	};
	browserAction.stackUnshift(stackData, tab.id);
	browserAction.show(null, tab);
};

kpxcEvent.pageClearLogins = function(callback, tab) {
	page.clearLogins(tab.id);
	callback();
};

kpxcEvent.oldDatabaseHash = 'no-hash';
kpxcEvent.checkDatabaseHash = function(callback, tab) {
	keepass.checkDatabaseHash((response) => {
		callback({old: kpxcEvent.oldDatabaseHash, new: response});
		kpxcEvent.oldDatabaseHash = response;
	});
};

// all methods named in this object have to be declared BEFORE this!
kpxcEvent.messageHandlers = {
	'add_credentials': keepass.addCredentials,
	'alert': kpxcEvent.onShowAlert,
	'associate': keepass.associate,
	'check_update_keepassxc': kpxcEvent.onCheckUpdateKeePassXC,
	'get_connected_database': kpxcEvent.onGetConnectedDatabase,
	'get_keepassxc_versions': kpxcEvent.onGetKeePassXCVersions,
	'get_status': kpxcEvent.onGetStatus,
	'get_tab_information': kpxcEvent.onGetTabInformation,
	'load_keyring': kpxcEvent.onLoadKeyRing,
	'load_settings': kpxcEvent.onLoadSettings,
	'page_clear_logins': kpxcEvent.pageClearLogins,
	'pop_stack': kpxcEvent.onPopStack,
	'popup_login': kpxcEvent.onLoginPopup,
	'popup_multiple-fields': kpxcEvent.onMultipleFieldsPopup,
	'remove_credentials_from_tab_information': kpxcEvent.onRemoveCredentialsFromTabInformation,
	'retrieve_credentials': keepass.retrieveCredentials,
	'show_default_browseraction': browserAction.showDefault,
	'update_credentials': keepass.updateCredentials,
	'save_settings': kpxcEvent.onSaveSettings,
	'set_remember_credentials': kpxcEvent.onSetRememberPopup,
	'stack_add': browserAction.stackAdd,
	'update_available_keepassxc': kpxcEvent.onUpdateAvailableKeePassXC,
	'generate_password': keepass.generatePassword,
	'reconnect': kpxcEvent.onReconnect,
	'lock-database': kpxcEvent.lockDatabase,
	'check_databasehash': kpxcEvent.checkDatabaseHash
};
