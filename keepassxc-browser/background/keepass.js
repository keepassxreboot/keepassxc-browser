var keepass = {};

keepass.associated = {"value": false, "hash": null};
keepass.keyPair = {publicKey: null, secretKey: null};
keepass.serverPublicKey = "";
keepass.isConnected = false;
keepass.isDatabaseClosed = false;
keepass.isKeePassXCAvailable = false;
keepass.isEncryptionKeyUnrecognized = false;
keepass.currentKeePassXC = {"version": 0, "versionParsed": 0};
keepass.latestKeePassXC = (typeof(localStorage.latestKeePassXC) == 'undefined') ? {"version": 0, "versionParsed": 0, "lastChecked": null} : JSON.parse(localStorage.latestKeePassXC);
keepass.requiredKeePassXC = 220;
keepass.nativeHostName = "com.varjolintu.keepassxc_browser";
keepass.nativePort = null;
keepass.keySize = 24;
keepass.latestVersionUrl = "https://api.github.com/repos/keepassxreboot/keepassxc/releases/latest";
keepass.cacheTimeout = 30 * 1000; // milliseconds
keepass.databaseHash = "no-hash"; //no-hash = KeePassXC is too old and does not return a hash value
keepass.keyRing = (typeof(localStorage.keyRing) == 'undefined') ? {} : JSON.parse(localStorage.keyRing);
keepass.keyId = "keepassxc-browser-cryptokey-name";
keepass.keyBody = "keepassxc-browser-key";

window.browser = (function () {
  return window.msBrowser ||
    window.browser ||
    window.chrome;
})();

keepass.addCredentials = function(callback, tab, username, password, url) {
	keepass.updateCredentials(callback, tab, null, username, password, url);
}

keepass.updateCredentials = function(callback, tab, entryId, username, password, url) {
	page.debug("keepass.updateCredentials(callback, {1}, {2}, {3}, [password], {4})", tab.id, entryId, username, url);

	// unset error message
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

		const dbkeys = keepass.getCryptoKey();
		const id = dbkeys[0];

		// build request
		let messageData = {
			action: "set-login",
			id: id,
			login: username,
			password: password,
			url: url,
			submitUrl: url
		};

		const nonce = nacl.randomBytes(keepass.keySize);

		if (entryId) {
			messageData.uuid = entryId;
		}

		const request = {
			action: "set-login",
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};
		console.log(request);

		keepass.callbackOnId(keepass.nativePort.onMessage, "set-login", (response) => {
			if (response.message && response.nonce) {
				const res = keepass.decrypt(response.message, response.nonce);
			  	if (!res)
			  	{
					console.log("Failed to decrypt message");
				}
				else
				{
					const message = nacl.util.encodeUTF8(res);
					const parsed = JSON.parse(message);
					let code = "error";

					if (keepass.verifyResponse(parsed, response.nonce)) {
						code = "success";
					}
					callback(code);
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
	page.debug("keepass.retrieveCredentials(callback, {1}, {2}, {3}, {4})", tab.id, url, submiturl, forceCallback);

	keepass.testAssociation((response) => {
		if (!response)
		{
			browserAction.showDefault(null, tab);
			if (forceCallback) {
				callback([]);
			}
			return;
		}

		// unset error message
		page.tabs[tab.id].errorMessage = null;

		if (!keepass.isConnected) {
			return;
		}

		let entries = [];
		const nonce = nacl.randomBytes(keepass.keySize);
		const dbkeys = keepass.getCryptoKey();
		const id = dbkeys[0];

		let messageData = {
			action: "get-logins",
			id: id,
			url: url
		};

		if (submiturl) {
			messageData.submitUrl = submiturl;
		}

		const request = {
			action: "get-logins",
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, "get-logins", (response) => {
			if (response.message && response.nonce) {
				const res = keepass.decrypt(response.message, response.nonce);
			  	if (!res)
			  	{
					console.log("Failed to decrypt message");
				}
				else
				{
					const message = nacl.util.encodeUTF8(res);
					const parsed = JSON.parse(message);

					keepass.setcurrentKeePassXCVersion(parsed.version);

					if (keepass.verifyResponse(parsed, response.nonce)) {
						entries = parsed.entries;
						keepass.updateLastUsed(keepass.databaseHash);
						if (entries.length == 0) {
							//questionmark-icon is not triggered, so we have to trigger for the normal symbol
							browserAction.showDefault(null, tab);
						}
						callback(entries);
					}
					else {
						console.log("RetrieveCredentials for " + url + " rejected");
					}
					page.debug("keepass.retrieveCredentials() => entries.length = {1}", entries.length);
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
	let listener = ( (port, id) => {
		let handler = (msg) => {
			if (msg && msg.action == id) {
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
		const nonce = nacl.randomBytes(keepass.keySize);

		const request = {
			action: "generate-password",
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, "generate-password", (response) => {
			if (response.message && response.nonce) {
				const res = keepass.decrypt(response.message, response.nonce);
			  	if (!res)
			  	{
					console.log("Failed to decrypt message");
				}
				else
				{
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
							console.log("No entries returned. Is KeePassXC up-to-date?");
						}
					}
					else {
						console.log("GeneratePassword rejected");
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

keepass.copyPassword = function(callback, tab, password) {
	browser.runtime.getBackgroundPage((bg) => {
		let c2c = bg.document.getElementById("copy2clipboard");
		if (!c2c) {
			let input = document.createElement('input');
			input.type = "text";
			input.id = "copy2clipboard";
			bg.document.getElementsByTagName('body')[0].appendChild(input);
			c2c = bg.document.getElementById("copy2clipboard");
		}

		c2c.value = password;
		c2c.select();
		try {
			document.execCommand("copy");
			c2c.value = "";
			callback(true);
		}
		catch (err) {
			console.log("Couldn't copy password to clipboard: " + err);
		}
	});
}

keepass.associate = function(callback, tab) {
	if (keepass.isAssociated()) {
		return;
	}

	keepass.getDatabaseHash((res) => {
		if (keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
			return;
		}

		page.tabs[tab.id].errorMessage = null;

		const key = keepass.b64e(keepass.keyPair.publicKey);
		const nonce = nacl.randomBytes(keepass.keySize);

		const messageData = {
			action: "associate",
			key: key
		};

		const request = {
			action: "associate",
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, "associate", (response) => {
			if (response.message && response.nonce) {
				const res = keepass.decrypt(response.message, response.nonce);
			  	if (!res)
			  	{
					console.log("Failed to decrypt message");
				}
				else
				{
					const message = nacl.util.encodeUTF8(res);
					const parsed = JSON.parse(message);

					if (parsed.version) {
						keepass.currentKeePassXC = {
							"version": parsed.version,
							"versionParsed": parseInt(parsed.version.replace(/\./g,""))};
					}

					const id = parsed.id;
					if (!keepass.verifyResponse(parsed, response.nonce)) {
						page.tabs[tab.id].errorMessage = "KeePassXC association failed, try again.";
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
				const errorMessage = "No KeePassXC public key available.";
				page.tabs[tab.id].errorMessage = errorMessage;
				console.log(errorMessage);
			}
			callback(false);
			return false;
		}

		const nonce = nacl.randomBytes(keepass.keySize);
		const dbkeys = keepass.getCryptoKey();
		if (dbkeys == null) {
			if (tab && page.tabs[tab.id]) {
				const errorMessage = "No saved databases found.";
				page.tabs[tab.id].errorMessage = errorMessage;
				console.log(errorMessage);
			}
			callback(false);
			return false;
		}

		const id = dbkeys[0];
		const idkey = dbkeys[1];

		const messageData = {
			action: "test-associate",
			id: id,
			key: idkey
		};
		
		const request = {
			action: "test-associate",
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, "test-associate", (response) => {
			if (response.message && response.nonce) {
				const res = keepass.decrypt(response.message, response.nonce);
		  		if (!res) {
					console.log("Failed to decrypt message");
				}
				else
				{
					const message = nacl.util.encodeUTF8(res);
					const parsed = JSON.parse(message);

					if (parsed.version) {
						keepass.currentKeePassXC = {
							"version": parsed.version,
							"versionParsed": parseInt(parsed.version.replace(/\./g,""))};
					}

					const id = parsed.id;
					keepass.isEncryptionKeyUnrecognized = false;
					if (!keepass.verifyResponse(parsed, response.nonce)) {
						const hash = response.hash || 0;
						keepass.deleteKey(hash);
						keepass.isEncryptionKeyUnrecognized = true;
						console.log("Encryption key is not recognized!");
						page.tabs[tab.id].errorMessage = "Encryption key is not recognized.";
						keepass.associated.value = false;
						keepass.associated.hash = null;
					}
					else if (!keepass.isAssociated()) {
						console.log("Association was not successful");
						page.tabs[tab.id].errorMessage = "Association was not successful.";
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
		page.tabs[tab.id].errorMessage = "Not connected with KeePassXC.";
		callback([]);
		return;
	}

	if (!keepass.serverPublicKey) {
		keepass.changePublicKeys(tab, function(res) {});
	}

	const nonce = nacl.randomBytes(keepass.keySize);

	const messageData = {
		action: "get-databasehash"
	};

	const request = {
		action: "get-databasehash",
		message: keepass.encrypt(messageData, nonce),
		nonce: keepass.b64e(nonce)
	};

	keepass.callbackOnId(keepass.nativePort.onMessage, "get-databasehash", (response) => {
		if (response.message && response.nonce) {
			const res = keepass.decrypt(response.message, response.nonce);
		  	if (!res)
		  	{
				console.log("Failed to decrypt message");
			}
			else
			{
				const message = nacl.util.encodeUTF8(res);
				const parsed = JSON.parse(message);

				if (parsed.hash)
				{
					console.log("hash reply received: "+ parsed.hash);
					const oldDatabaseHash = keepass.databaseHash;
					keepass.setcurrentKeePassXCVersion(parsed.version);
					keepass.databaseHash = parsed.hash || "no-hash";

					if (oldDatabaseHash && oldDatabaseHash != keepass.databaseHash) {
						keepass.associated.value = false;
						keepass.associated.hash = null;
					}

					statusOK();
					callback(parsed.hash);
				}
				else if (parsed.errorCode)
				{
					keepass.databaseHash = "no-hash";
					keepass.isDatabaseClosed = true;
					console.log("Error: KeePass database is not opened.");
					if (tab && page.tabs[tab.id]) {
						page.tabs[tab.id].errorMessage = "KeePass database is not opened.";
					}
					callback(keepass.databaseHash);
				}	
			}
		}
		else
		{
			keepass.databaseHash = "no-hash";
			if (tab && page.tabs[tab.id]) {
				page.tabs[tab.id].errorMessage = response.error.length > 0 ? response.error : "Database hash not received.";
			}
			callback(keepass.databaseHash);
		}	
	});
	keepass.nativePort.postMessage(request);
}

keepass.changePublicKeys = function(tab, callback) {
	if (!keepass.isConnected) {
		return;
	}

	const key = keepass.b64e(keepass.keyPair.publicKey);
	let nonce = nacl.randomBytes(keepass.keySize);
	nonce = keepass.b64e(nonce)

	const message = {
		"action": "change-public-keys",
		"publicKey": key,
		"proxyPort": (page.settings.port ? page.settings.port : 19700),
		"nonce": nonce
	}

	keepass.callbackOnId(keepass.nativePort.onMessage, "change-public-keys", function(response) {
		if (response.version) {
			keepass.currentKeePassXC = {
				"version": response.version,
				"versionParsed": parseInt(response.version.replace(/\./g,""))
			};
		}

		if (!keepass.verifyKeyResponse(response, key, nonce)) {
			if (tab && page.tabs[tab.id]) {
				page.tabs[tab.id].errorMessage = "Key change was not successful.";
				console.log("Key change was not successful.");
				callback(false);
			}
		}
		else {
			console.log("Server public key: " + keepass.b64e(keepass.serverPublicKey));
		}
		callback(true);

	});
	keepass.nativePort.postMessage(message);
}

keepass.generateNewKeyPair = function() {
	keepass.keyPair = nacl.box.keyPair();
	//console.log(keepass.b64e(keepass.keyPair.publicKey) + " " + keepass.b64e(keepass.keyPair.secretKey));
}

keepass.isConfigured = function(callback) {
	if (typeof(keepass.databaseHash) == "undefined") {
		keepass.getDatabaseHash((dbHash) => {
			callback(keepass.databaseHash in keepass.keyRing);
		}, null);
	}
	else
	{
		callback(keepass.databaseHash in keepass.keyRing);
	}
}

keepass.isAssociated = function() {
	return (keepass.associated.value && keepass.associated.hash && keepass.associated.hash == keepass.databaseHash);
}

keepass.convertKeyToKeyRing = function() {
	if (keepass.keyId in localStorage && keepass.keyBody in localStorage && !("keyRing" in localStorage)) {
		keepass.getDatabaseHash((hash) => {
			keepass.saveKey(hash, localStorage[keepass.keyId], localStorage[keepass.keyBody]);

			if ("keyRing" in localStorage) {
				delete localStorage[keepass.keyId];
				delete localStorage[keepass.keyBody];
			}
		}, null);
	}

	if ("keyRing" in localStorage) {
		delete localStorage[keepass.keyId];
		delete localStorage[keepass.keyBody];
	}
}

keepass.saveKey = function(hash, id, key) {
	if (!(hash in keepass.keyRing)) {
		keepass.keyRing[hash] = {
			"id": id,
			"key": key,
			"hash": hash,
			"icon": "blue",
			"created": new Date(),
			"last-used": new Date()
		}
	}
	else {
		keepass.keyRing[hash].id = id;
		keepass.keyRing[hash].key = key;
		keepass.keyRing[hash].hash = hash;
	}
	localStorage.keyRing = JSON.stringify(keepass.keyRing);
}

keepass.updateLastUsed = function(hash) {
	if ((hash in keepass.keyRing)) {
		keepass.keyRing[hash].lastUsed = new Date();
		localStorage.keyRing = JSON.stringify(keepass.keyRing);
	}
}

keepass.deleteKey = function(hash) {
	delete keepass.keyRing[hash];
	localStorage.keyRing = JSON.stringify(keepass.keyRing);
}

keepass.setcurrentKeePassXCVersion = function(version) {
	if (version) {
		keepass.currentKeePassXC = {
			"version": version,
			"versionParsed": parseInt(version.replace(/\./g,""))
		};
	}
}

keepass.keePassXCUpdateAvailable = function() {
	if (page.settings.checkUpdateKeePassXC && page.settings.checkUpdateKeePassXC > 0) {
		const lastChecked = (keepass.latestKeePassXC.lastChecked) ? new Date(keepass.latestKeePassXC.lastChecked) : new Date("11/21/1986");
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
	xhr.open("GET", keepass.latestVersionUrl, true);
	xhr.onload = function(e) {
		if (xhr.readyState == 4) {
			if (xhr.status == 200) {
				const json = JSON.parse(xhr.responseText);
				if (json.tag_name) {
					version = json.tag_name;
					keepass.latestKeePassXC.version = version;
					keepass.latestKeePassXC.versionParsed = parseInt(version.replace(/\./g,""));
				}
			}
		}

		if (version != -1) {
			localStorage.latestKeePassXC = JSON.stringify(keepass.latestKeePassXC);
		}
	};

	xhr.onerror = function(e) {
		console.log("checkForNewKeePassXCVersion error: " + e);
	}

	xhr.send();
	keepass.latestKeePassXC.lastChecked = new Date();
}

keepass.connectToNative = function() {
	if (!keepass.isConnected) {
		keepass.nativeConnect();
	}
}

function statusOK() {
	keepass.isDatabaseClosed = false;
	keepass.isKeePassXCAvailable = true;
}

keepass.onNativeMessage = function (response) {
	//console.log("Received message: " + JSON.stringify(response));
}

function onDisconnected() {
	console.log("Failed to connect: " + browser.runtime.lastError.message);
	keepass.nativePort = null;
	keepass.isConnected = false;
	keepass.isDatabaseClosed = true;
	keepass.isKeePassXCAvailable = false;
}

keepass.nativeConnect = function() {
	console.log("Connecting to native messaging host " + keepass.nativeHostName)
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

	reply = (response.nonce == nonce);

	if (response.publicKey) {
		keepass.serverPublicKey = keepass.b64d(response.publicKey);
		reply = true;
	}

	return reply;

}

keepass.verifyResponse = function(response, nonce, id) {
	keepass.associated.value = response.success;
	if (response.success != "true") {
		keepass.associated.hash = null;
		return false;
	}

	keepass.associated.hash = keepass.databaseHash;

	if (keepass.b64d(response.nonce).length !== nacl.secretbox.nonceLength)
		return false;

	keepass.associated.value = (response.nonce == nonce);

	if (id) {
		keepass.associated.value = (keepass.associated.value && id == response.id);
	}

	keepass.associated.hash = (keepass.associated.value) ? keepass.databaseHash : null;

	return keepass.isAssociated();

}

keepass.handleError = function(tabId, errorMessage, errorCode) {
	console.log("Received error " + errorCode + ": " + errorMessage);
	page.tabs[tabId].errorMessage = errorMessage;
}

keepass.b64e = function(d) {
	return nacl.util.encodeBase64(d);
}

keepass.b64d = function(d) {
	return nacl.util.decodeBase64(d);
}

keepass.getCryptoKey = function() {
	if (!(keepass.databaseHash in keepass.keyRing)) {
		return null;
	}

	const id = keepass.keyRing[keepass.databaseHash].id;
	let key = null;

	if (id) {
		key = keepass.keyRing[keepass.databaseHash].key;
	}

	return key ? [id, key] : null;
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
	console.log("Cannot encrypt message! Server public key needed.");
	return "";
}

keepass.decrypt = function(input, nonce, toStr) {
	const m = keepass.b64d(input);
	const n = keepass.b64d(nonce);
	return nacl.box.open(m, n, keepass.serverPublicKey, keepass.keyPair.secretKey);
}
