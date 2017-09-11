var keepass = {};

keepass.associated = {'value': false, 'hash': null};
keepass.keyPair = {publicKey: null, secretKey: null};
keepass.serverPublicKey = '';
keepass.isConnected = false;
keepass.isDatabaseClosed = false;
keepass.isKeePassXCAvailable = false;
keepass.isEncryptionKeyUnrecognized = false;
keepass.currentKeePassXC = {'version': 0, 'versionParsed': 0};
keepass.latestKeePassXC = (typeof(localStorage.latestKeePassXC) === 'undefined') ? {'version': 0, 'versionParsed': 0, 'lastChecked': null} : JSON.parse(localStorage.latestKeePassXC);
keepass.requiredKeePassXC = 220;
keepass.nativeHostName = 'com.varjolintu.keepassxc_browser';
keepass.nativePort = null;
keepass.keySize = 24;
keepass.latestVersionUrl = 'https://api.github.com/repos/keepassxreboot/keepassxc/releases/latest';
keepass.cacheTimeout = 30 * 1000; // milliseconds
keepass.databaseHash = 'no-hash'; //no-hash = KeePassXC is too old and does not return a hash value
keepass.keyRing = (typeof(localStorage.keyRing) === 'undefined') ? {} : JSON.parse(localStorage.keyRing);
keepass.keyId = 'keepassxc-browser-cryptokey-name';
keepass.keyBody = 'keepassxc-browser-key';

const kpActions = {
	SET_LOGIN: 'set-login',
	GET_LOGINS: 'get-logins',
	GENERATE_PASSWORD: 'generate-password',
	ASSOCIATE: 'associate',
	TEST_ASSOCIATE: 'test-associate',
	GET_DATABASE_HASH: 'get-databasehash',
	CHANGE_PUBLIC_KEYS: 'change-public-keys'
};

const kpErrors = {
	UNKNOWN_ERROR: 0,
	DATABASE_NOT_OPENED: 1,
    DATABASE_HASH_NOT_RECEIVED: 2,
    CLIENT_PUBLIC_KEY_NOT_RECEIVED: 3,
    CANNOT_DECRYPT_MESSAGE: 4,
    TIMEOUT_OR_NOT_CONNECTED: 5,
    ACTION_CANCELLED_OR_DENIED: 6,
    PUBLIC_KEY_NOT_FOUND: 7,
    ASSOCIATION_FAILED: 8,
    KEY_CHANGE_FAILED: 9,
    ENCRYPTION_KEY_UNRECOGNIZED: 10,
    NO_SAVED_DATABASES_FOUND: 11,

    errorMessages : {
    	0: { msg: 'Unknown error' },
    	1: { msg: 'Database not opened' },
		2: { msg: 'Database hash not received' },
		3: { msg: 'Client public key not reveiced' },
		4: { msg: 'Cannot decrypt message' },
		5: { msg: 'Timeout or not connected to KeePassXC' },
		6: { msg: 'Action cancelled or denied' },
		7: { msg: 'Cannot encrypt message or public key not found. Is Native Messaging enabled in KeePassXC?' },
		8: { msg: 'KeePassXC association failed, try again.' },
		9: { msg: 'Key change was not successful.' },
		10: { msg: 'Encryption key is not recognized' },
		11: { msg: 'No saved databases found.' }
	},

	getError(errorCode) {
		return this.errorMessages[errorCode].msg;
	}
};

browser.storage.local.get({
	'latestKeePassXC': {'version': 0, 'versionParsed': 0, 'lastChecked': null},
	'keyRing': {}})
	.then((item) => {
		keepass.latestKeePassXC = item.latestKeePassXC;
		keepass.keyRing = JSON.parse(item.keyRing);
});

keepass.addCredentials = function(callback, tab, username, password, url) {
	keepass.updateCredentials(callback, tab, null, username, password, url);
}

keepass.updateCredentials = function(callback, tab, entryId, username, password, url) {
	page.debug('keepass.updateCredentials(callback, {1}, {2}, {3}, [password], {4})', tab.id, entryId, username, url);
	page.tabs[tab.id].errorMessage = null;

	keepass.testAssociation((response) => {
		if (!response)
		{
			browserAction.showDefault(null, tab);
			if (forceCallback) {
				callback([]);
			}
			return;
		}

		const kpAction = kpActions.SET_LOGIN;
		const {dbid} = keepass.getCryptoKey();
		const nonce = nacl.randomBytes(keepass.keySize);

		let messageData = {
			action: kpAction,
			id: dbid,
			login: username,
			password: password,
			url: url,
			submitUrl: url
		};

		if (entryId) {
			messageData.uuid = entryId;
		}

		const request = {
			action: kpAction,
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};
		console.log(request);

		keepass.callbackOnId(keepass.nativePort.onMessage, kpAction, (response) => {
			if (response.message && response.nonce) {
				const res = keepass.decrypt(response.message, response.nonce);
			  	if (res) {
					const message = nacl.util.encodeUTF8(res);
					const parsed = JSON.parse(message);
					callback(keepass.verifyResponse(parsed, response.nonce) ? 'success' : 'error');
				}
			}
			else if (response.error && response.errorCode) {
				keepass.handleError(tab.id, response.error, response.errorCode);
			}
			else {
				browserAction.showDefault(null, tab);
			}
		});
		keepass.nativePort.postMessage(request);
	});
}

keepass.retrieveCredentials = function (callback, tab, url, submiturl, forceCallback, triggerUnlock) {
	page.debug('keepass.retrieveCredentials(callback, {1}, {2}, {3}, {4})', tab.id, url, submiturl, forceCallback);

	keepass.testAssociation((response) => {
		if (!response)
		{
			browserAction.showDefault(null, tab);
			if (forceCallback) {
				callback([]);
			}
			return;
		}

		page.tabs[tab.id].errorMessage = null;

		if (!keepass.isConnected) {
			callback([]);
			return;
		}

		let entries = [];
		const kpAction = kpActions.GET_LOGINS;
		const nonce = nacl.randomBytes(keepass.keySize);
		const {dbid} = keepass.getCryptoKey();

		let messageData = {
			action: kpAction,
			id: dbid,
			url: url
		};

		if (submiturl) {
			messageData.submitUrl = submiturl;
		}

		const request = {
			action: kpAction,
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, kpAction, (response) => {
			if (response.message && response.nonce) {
				const res = keepass.decrypt(response.message, response.nonce);
			  	if (res) {
					const message = nacl.util.encodeUTF8(res);
					const parsed = JSON.parse(message);
					keepass.setcurrentKeePassXCVersion(parsed.version);

					if (keepass.verifyResponse(parsed, response.nonce)) {
						entries = parsed.entries;
						keepass.updateLastUsed(keepass.databaseHash);
						if (entries.length === 0) {
							// questionmark-icon is not triggered, so we have to trigger for the normal symbol
							browserAction.showDefault(null, tab);
						}
						callback(entries);
					}
					else {
						console.log('RetrieveCredentials for ' + url + ' rejected');
					}
					page.debug('keepass.retrieveCredentials() => entries.length = {1}', entries.length);
				}
			}
			else if (response.error && response.errorCode) {
				keepass.handleError(tab.id, response.error, response.errorCode);
			}
			else {
				browserAction.showDefault(null, tab);
			}
		});
		keepass.nativePort.postMessage(request);
	}, tab);
}

// Redirects the callback to a listener (handleReply())
keepass.callbackOnId = function (ev, id, callback) {
	let listener = ((port, id) => {
		let handler = (msg) => {
			if (msg && msg.action === id) {
				ev.removeListener(handler);
				callback(msg);
			}
		}
		return handler;
	})(ev, id, callback);
	ev.addListener(listener);
}

keepass.generatePassword = function (callback, tab, forceCallback) {
	if (!keepass.isConnected) {
		callback([]);
		return;
	}

	keepass.testAssociation((taresponse) => {
		if (!taresponse)
		{
			browserAction.showDefault(null, tab);
			if (forceCallback) {
				callback([]);
			}
			return;
		}

		if (keepass.currentKeePassXC.versionParsed < keepass.requiredKeePassXC) {
			callback([]);
			return;
		}

		let passwords = [];
		const kpAction = kpActions.GENERATE_PASSWORD;
		const nonce = nacl.randomBytes(keepass.keySize);

		const request = {
			action: kpAction,
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, kpAction, (response) => {
			if (response.message && response.nonce) {
				const res = keepass.decrypt(response.message, response.nonce);
			  	if (res) {
					const message = nacl.util.encodeUTF8(res);
					const parsed = JSON.parse(message);
					keepass.setcurrentKeePassXCVersion(parsed.version);

					if (keepass.verifyResponse(parsed, response.nonce)) {
						const rIv = response.nonce;
						if (parsed.entries) {
							passwords = parsed.entries;
							keepass.updateLastUsed(keepass.databaseHash);
						}
						else {
							console.log('No entries returned. Is KeePassXC up-to-date?');
						}
					}
					else {
						console.log('GeneratePassword rejected');
					}
					callback(passwords);
				}
			}
			else if (response.error && response.errorCode) {
				keepass.handleError(tab.id, response.error, response.errorCode);
			}
		});
		keepass.nativePort.postMessage(request);
	}, tab);
}

keepass.associate = function(callback, tab) {
	if (keepass.isAssociated()) {
		callback([]);
		return;
	}

	keepass.getDatabaseHash((res) => {
		if (keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
			callback([]);
			return;
		}

		page.tabs[tab.id].errorMessage = null;

		const kpAction = kpActions.ASSOCIATE;
		const key = keepass.b64e(keepass.keyPair.publicKey);
		const nonce = nacl.randomBytes(keepass.keySize);

		const messageData = {
			action: kpAction,
			key: key
		};

		const request = {
			action: kpAction,
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, kpAction, (response) => {
			if (response.message && response.nonce) {
				const res = keepass.decrypt(response.message, response.nonce);
			  	if (res) {
					const message = nacl.util.encodeUTF8(res);
					const parsed = JSON.parse(message);
					keepass.setcurrentKeePassXCVersion(parsed.version);
					const id = parsed.id;

					if (!keepass.verifyResponse(parsed, response.nonce)) {
						keepass.handleError(tab, kpErrors.ASSOCIATION_FAILED);
					}
					else {
						keepass.setCryptoKey(id, key);	// Save the current public key as id key for the database
						keepass.associated.value = true;
						keepass.associated.hash = parsed.hash || 0;
					}

					browserAction.show(callback, tab);
				}
			}
			else if (response.error && response.errorCode) {
				keepass.handleError(tab.id, response.error, response.errorCode);
			}
		});
		keepass.nativePort.postMessage(request);
	}, tab);
}

keepass.testAssociation = function (callback, tab, triggerUnlock) {
	if (tab && page.tabs[tab.id]) {
		page.tabs[tab.id].errorMessage = null;
	}

	keepass.getDatabaseHash((dbHash) => {
		if (!dbHash) {
			callback(false);
			return false;
		}

		if (keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
			callback(false);
			return false;
		}

		if (keepass.isAssociated()) {
			callback(true);
			return true;
		}

		if (!keepass.serverPublicKey) {
			if (tab && page.tabs[tab.id]) {
				handleError(tab, kpErrors.PUBLIC_KEY_NOT_FOUND);
			}
			callback(false);
			return false;
		}

		const kpAction = kpActions.TEST_ASSOCIATE;
		const nonce = nacl.randomBytes(keepass.keySize);
		const {dbid, dbkey} = keepass.getCryptoKey();

		if (dbkey === null || dbid === null) {
			if (tab && page.tabs[tab.id]) {
				keepass.handleError(tab, kpErrors.NO_SAVED_DATABASES_FOUND);
			}
			callback(false);
			return false;
		}

		const messageData = {
			action: kpAction,
			id: dbid,
			key: dbkey
		};
		
		const request = {
			action: kpAction,
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, kpAction, (response) => {
			if (response.message && response.nonce) {
				const res = keepass.decrypt(response.message, response.nonce);
		  		if (res) {
					const message = nacl.util.encodeUTF8(res);
					const parsed = JSON.parse(message);
					keepass.setcurrentKeePassXCVersion(parsed.version);
					const id = parsed.id;
					keepass.isEncryptionKeyUnrecognized = false;

					if (!keepass.verifyResponse(parsed, response.nonce)) {
						const hash = response.hash || 0;
						keepass.deleteKey(hash);
						keepass.isEncryptionKeyUnrecognized = true;
						keepass.handleError(tab, kpErrors.ENCRYPTION_KEY_UNRECOGNIZED);
						keepass.associated.value = false;
						keepass.associated.hash = null;
					}
					else if (!keepass.isAssociated()) {
						keepass.handleError(tab, kpErrors.ASSOCIATION_FAILED);
					}
					else {
						if (tab && page.tabs[tab.id]) {
							delete page.tabs[tab.id].errorMessage;
						}
					}
				}
			}
			else if (response.error && response.errorCode) {
				keepass.handleError(tab.id, response.error, response.errorCode);
			}
			callback(keepass.isAssociated());
		});
		keepass.nativePort.postMessage(request);
	}, tab, triggerUnlock);
}

keepass.getDatabaseHash = function (callback, tab, triggerUnlock) {
	if (!keepass.isConnected) {
		keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
		callback([]);
		return;
	}

	if (!keepass.serverPublicKey) {
		keepass.changePublicKeys(tab, null);
	}

	const kpAction = kpActions.GET_DATABASE_HASH;
	const nonce = nacl.randomBytes(keepass.keySize);

	const messageData = {
		action: kpAction
	};

	const encrypted = keepass.encrypt(messageData, nonce);
	if (encrypted.length <= 0) {
		 keepass.handleError(tab, kpErrors.PUBLIC_KEY_NOT_FOUND);
		 callback(keepass.databaseHash);
		 return;
	}

	const request = {
		action: kpAction,
		message: encrypted,
		nonce: keepass.b64e(nonce)
	};

	keepass.callbackOnId(keepass.nativePort.onMessage, kpAction, (response) => {
		if (response.message && response.nonce) {
			const res = keepass.decrypt(response.message, response.nonce);
		  	if (res) {
				const message = nacl.util.encodeUTF8(res);
				const parsed = JSON.parse(message);

				if (parsed.hash) {
					const oldDatabaseHash = keepass.databaseHash;
					keepass.setcurrentKeePassXCVersion(parsed.version);
					keepass.databaseHash = parsed.hash || 'no-hash';

					if (oldDatabaseHash && oldDatabaseHash != keepass.databaseHash) {
						keepass.associated.value = false;
						keepass.associated.hash = null;
					}

					keepass.isDatabaseClosed = false;
					keepass.isKeePassXCAvailable = true;
					callback(parsed.hash);
				}
				else if (parsed.errorCode) {
					keepass.databaseHash = 'no-hash';
					keepass.isDatabaseClosed = true;
					keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
					callback(keepass.databaseHash);
				}	
			}
		}
		else {
			keepass.databaseHash = 'no-hash';
			keepass.isDatabaseClosed = true;
			keepass.handleError(tab, response.errorCode, response.error);
			callback(keepass.databaseHash);
		}	
	});
	keepass.nativePort.postMessage(request);
}

keepass.changePublicKeys = function(tab, callback) {
	if (!keepass.isConnected) {
		callback([]);
		return;
	}

	const kpAction = kpActions.CHANGE_PUBLIC_KEYS;
	const key = keepass.b64e(keepass.keyPair.publicKey);
	let nonce = nacl.randomBytes(keepass.keySize);
	nonce = keepass.b64e(nonce)

	const message = {
		action: kpAction,
		publicKey: key,
		proxyPort: (page.settings.port ? page.settings.port : 19700),
		nonce: nonce
	}

	keepass.callbackOnId(keepass.nativePort.onMessage, kpAction, (response) => {
		keepass.setcurrentKeePassXCVersion(response.version);

		if (!keepass.verifyKeyResponse(response, key, nonce)) {
			if (tab && page.tabs[tab.id]) {
				keepass.handleError(tab, kpErrors.KEY_CHANGE_FAILED);
				callback(false);
			}
		}
		else {
			keepass.isKeePassXCAvailable = true;
			console.log('Server public key: ' + keepass.b64e(keepass.serverPublicKey));
		}
		callback(true);
	});
	keepass.nativePort.postMessage(message);
}

keepass.generateNewKeyPair = function() {
	keepass.keyPair = nacl.box.keyPair();
	//console.log(keepass.b64e(keepass.keyPair.publicKey) + ' ' + keepass.b64e(keepass.keyPair.secretKey));
}

keepass.isConfigured = function(callback) {
	if (typeof(keepass.databaseHash) === 'undefined') {
		keepass.getDatabaseHash((dbHash) => {
			callback(keepass.databaseHash in keepass.keyRing);
		}, null);
	}
	else {
		callback(keepass.databaseHash in keepass.keyRing);
	}
}

keepass.isAssociated = function() {
	return (keepass.associated.value && keepass.associated.hash && keepass.associated.hash === keepass.databaseHash);
}

keepass.migrateKeyRing = () => {
	return new Promise((resolve, reject) => {
		browser.storage.local.get('keyRing').then((item) => {
			let keyring = item.keyRing;
			if ('keyRing' in localStorage) {
				if (!keyring) {
					keyring = JSON.parse(localStorage['keyRing']);
					browser.storage.local.set({'keyRing': JSON.stringify(keyring)});
				}
				delete localStorage['keyRing'];
			}
			if (keepass.keyId in localStorage && keepass.keyBody in localStorage) {
				if (!keyring) {
					const hash = keepass.getDatabaseHash(null);
					keepass.saveKey(hash, localStorage[keepass.keyId], localStorage[keepass.keyBody]);
				}
				delete localStorage[keepass.keyId];
				delete localStorage[keepass.keyBody];
			}
			resolve();
		});
	});
};

keepass.saveKey = function(hash, id, key) {
	if (!(hash in keepass.keyRing)) {
		keepass.keyRing[hash] = {
			id: id,
			key: key,
			hash: hash,
			created: new Date(),
			lastUsed: new Date()
		}
	}
	else {
		keepass.keyRing[hash].id = id;
		keepass.keyRing[hash].key = key;
		keepass.keyRing[hash].hash = hash;
	}
	browser.storage.local.set({'keyRing': JSON.stringify(keepass.keyRing)});
}

keepass.updateLastUsed = function(hash) {
	if ((hash in keepass.keyRing)) {
		keepass.keyRing[hash].lastUsed = new Date();
		browser.storage.local.set({'keyRing': JSON.stringify(keepass.keyRing)});
	}
}

keepass.deleteKey = function(hash) {
	delete keepass.keyRing[hash];
	browser.storage.local.set({'keyRing': JSON.stringify(keepass.keyRing)});
}

keepass.setcurrentKeePassXCVersion = function(version) {
	if (version) {
		keepass.currentKeePassXC = {
			version: version,
			versionParsed: Number(version.replace(/\./g, ''))
		};
	}
}

keepass.keePassXCUpdateAvailable = function() {
	if (page.settings.checkUpdateKeePassXC && page.settings.checkUpdateKeePassXC > 0) {
		const lastChecked = (keepass.latestKeePassXC.lastChecked) ? new Date(keepass.latestKeePassXC.lastChecked) : new Date('11/21/1986');
		const daysSinceLastCheck = Math.floor(((new Date()).getTime()-lastChecked.getTime())/86400000);
		if (daysSinceLastCheck >= page.settings.checkUpdateKeePassXC) {
			keepass.checkForNewKeePassXCVersion();
		}
	}

	return (keepass.currentKeePassXC.versionParsed > 0 && keepass.currentKeePassXC.versionParsed < keepass.latestKeePassXC.versionParsed);
}

keepass.checkForNewKeePassXCVersion = function() {
	let xhr = new XMLHttpRequest();
	let version = -1;

	xhr.onload = function(e) {
		if (xhr.readyState === 4 && xhr.status === 200) {
			const json = JSON.parse(xhr.responseText);
			if (json.tag_name) {
				version = json.tag_name;
				keepass.latestKeePassXC.version = version;
				keepass.latestKeePassXC.versionParsed = Number(version.replace(/\./g, ''));
			}
		}

		if (version !== -1) {
			browser.storage.local.set({'latestKeePassXC': keepass.latestKeePassXC});
		}
	};

	xhr.onerror = function(e) {
		console.log('checkForNewKeePassXCVersion error:' + e);
	}

	try {
		xhr.open('GET', keepass.latestVersionUrl, true);
		xhr.send();
	}
	catch (ex) {
		console.log(ex);
	}
	keepass.latestKeePassXC.lastChecked = new Date();
}

keepass.connectToNative = function() {
	if (!keepass.isConnected) {
		keepass.nativeConnect();
	}
}

keepass.onNativeMessage = function (response) {
	//console.log('Received message: ' + JSON.stringify(response));
}

function onDisconnected() {
	keepass.nativePort = null;
	keepass.isConnected = false;
	keepass.isDatabaseClosed = true;
	keepass.isKeePassXCAvailable = false;
	keepass.associated.value = false;
	keepass.associated.hash = null;
	console.log('Failed to connect: ' + (browser.runtime.lastError === null ? 'Unknown error' : browser.runtime.lastError.message));
}

keepass.nativeConnect = function() {
	console.log('Connecting to native messaging host ' + keepass.nativeHostName)
	keepass.nativePort = browser.runtime.connectNative(keepass.nativeHostName);
	keepass.nativePort.onMessage.addListener(keepass.onNativeMessage);
	keepass.nativePort.onDisconnect.addListener(onDisconnected);
	keepass.isConnected = true;
}

keepass.verifyKeyResponse = function(response, key, nonce) {
	if (!response.success || !response.publicKey) {
		keepass.associated.hash = null;
		return false;
	}

	let reply = false;
	if (keepass.b64d(nonce).length !== nacl.secretbox.nonceLength)
		return false;

	reply = (response.nonce === nonce);

	if (response.publicKey) {
		keepass.serverPublicKey = keepass.b64d(response.publicKey);
		reply = true;
	}

	return reply;

}

keepass.verifyResponse = function(response, nonce, id) {
	keepass.associated.value = response.success;
	if (response.success !== 'true') {
		keepass.associated.hash = null;
		return false;
	}

	keepass.associated.hash = keepass.databaseHash;

	if (keepass.b64d(response.nonce).length !== nacl.secretbox.nonceLength)
		return false;

	keepass.associated.value = (response.nonce === nonce);

	if (id) {
		keepass.associated.value = (keepass.associated.value && id === response.id);
	}

	keepass.associated.hash = (keepass.associated.value) ? keepass.databaseHash : null;

	return keepass.isAssociated();

}

keepass.handleError = function(tab, errorCode, errorMessage = '') {
	if (errorMessage.length === 0) {
		errorMessage = kpErrors.getError(errorCode);
	}
	console.log('Error ' + errorCode + ': ' + errorMessage);
	if (tab && page.tabs[tab.id]) {
		page.tabs[tab.id].errorMessage = errorMessage;
	}
}

keepass.b64e = function(d) {
	return nacl.util.encodeBase64(d);
}

keepass.b64d = function(d) {
	return nacl.util.decodeBase64(d);
}

keepass.getCryptoKey = function() {
	let dbkey = null;
	let dbid = null;
	if (!(keepass.databaseHash in keepass.keyRing)) {
		return {dbid, dbkey};
	}

	dbid = keepass.keyRing[keepass.databaseHash].id;

	if (dbid) {
		dbkey = keepass.keyRing[keepass.databaseHash].key;
	}

	return {dbid, dbkey};
}

keepass.setCryptoKey = function(id, key) {
	keepass.saveKey(keepass.databaseHash, id, key);
}

keepass.encrypt = function(input, nonce) {
	const messageData = nacl.util.decodeUTF8(JSON.stringify(input));

	if (keepass.serverPublicKey) {
		const message = nacl.box(messageData, nonce, keepass.serverPublicKey, keepass.keyPair.secretKey);
		if (message) {
			return keepass.b64e(message);
		}
	}
	return '';
}

keepass.decrypt = function(input, nonce, toStr) {
	const m = keepass.b64d(input);
	const n = keepass.b64d(nonce);
	const res = nacl.box.open(m, n, keepass.serverPublicKey, keepass.keyPair.secretKey);
	return res;
}
