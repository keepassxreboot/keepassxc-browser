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
keepass.requiredKeePassXC = 214;
keepass.nativeHostName = "com.varjolintu.keepassxc_browser";
keepass.nativePort = null;
keepass.keySize = 24;
keepass.latestVersionUrl = "https://raw.githubusercontent.com/keepassxreboot/keepassxc/develop/CHANGELOG";
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

// Not tested
keepass.updateCredentials = function(callback, tab, entryId, username, password, url) {
	page.debug("keepass.updateCredentials(callback, {1}, {2}, {3}, [password], {4})", tab.id, entryId, username, url);

	// unset error message
	page.tabs[tab.id].errorMessage = null;

	keepass.testAssociation(function(response) {
		if (!response)
		{
			browserAction.showDefault(null, tab);
			if (forceCallback) {
				callback([]);
			}
			return;
		}

		var dbkeys = keepass.getCryptoKey();
		var id = dbkeys[0];

		// build request
		var messageData = {
			action: "set-login",
			id: id,
			login: username,
			password: password,
			url: url,
			submitUrl: url
		};

		var key = keepass.b64e(keepass.keyPair.publicKey);
		var nonce = nacl.randomBytes(keepass.keySize);

		if (entryId) {
			messageData.uuid = entryId;
		}

		var request = {
			action: "set-login",
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};
		console.log(request);

		keepass.callbackOnId(keepass.nativePort.onMessage, "set-login", function(response) {
			if (response.message && response.nonce) {
				var res = keepass.decrypt(response.message, response.nonce);
			  	if (!res)
			  	{
					console.log("Failed to decrypt message");
				}
				else
				{
					var message = nacl.util.encodeUTF8(res);
					var parsed = JSON.parse(message);
					var code = "error";

					if (keepass.verifyResponse(parsed, response.nonce)) {
						code = "success";
					}
					callback(code);
				}
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

	keepass.testAssociation(function(response) {
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

		var entries = [];
		var key = keepass.b64e(keepass.keyPair.publicKey);
		var nonce = nacl.randomBytes(keepass.keySize);
		var dbkeys = keepass.getCryptoKey();
		var id = dbkeys[0];

		var messageData = {
			action: "get-logins",
			id: id,
			url: url
		};

		if (submiturl) {
			messageData.submitUrl = submiturl;
		}

		var request = {
			action: "get-logins",
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, "get-logins", function(response) {
			if (response.message && response.nonce) {
				var res = keepass.decrypt(response.message, response.nonce);
			  	if (!res)
			  	{
					console.log("Failed to decrypt message");
				}
				else
				{
					var message = nacl.util.encodeUTF8(res);
					var parsed = JSON.parse(message);

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
			else {
				browserAction.showDefault(null, tab);
			}
		});
		keepass.nativePort.postMessage(request);
	}, tab);
}

// Redirects the callback to a listener (handleReply())
keepass.callbackOnId = function (ev, id, callback) {
	var listener = ( function(port, id) {
		var handler = function(msg) {
			if(msg.action == id) {
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

	keepass.testAssociation(function(response) {
		if (!response)
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

		var passwords = [];
		var key = keepass.b64e(keepass.keyPair.publicKey);
		var nonce = nacl.randomBytes(keepass.keySize);

		var request = {
			action: "generate-password",
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, "generate-password", function(response) {
			if (response.message && response.nonce) {
				var res = keepass.decrypt(response.message, response.nonce);
			  	if (!res)
			  	{
					console.log("Failed to decrypt message");
				}
				else
				{
					var message = nacl.util.encodeUTF8(res);
					var parsed = JSON.parse(message);

					keepass.setcurrentKeePassXCVersion(parsed.version);
					if (keepass.verifyResponse(parsed, response.nonce)) {
						var rIv = response.nonce;
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
		});
		keepass.nativePort.postMessage(request);
	}, tab);
}

keepass.copyPassword = function(callback, tab, password) {
	browser.runtime.getBackgroundPage(function(bg) {
		var c2c = bg.document.getElementById("copy2clipboard");
		if (!c2c) {
			var input = document.createElement('input');
			input.type = "text";
			input.id = "copy2clipboard";
			bg.document.getElementsByTagName('body')[0].appendChild(input);
			c2c = bg.document.getElementById("copy2clipboard");
		}

		c2c.value = password;
		c2c.select();
		document.execCommand("copy");
		c2c.value = "";
		callback(true);
	});
}

keepass.associate = function(callback, tab) {
	if (keepass.isAssociated()) {
		return;
	}

	keepass.getDatabaseHash(function(res) {
		if (keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
			return;
		}

		page.tabs[tab.id].errorMessage = null;

		var key = keepass.b64e(keepass.keyPair.publicKey);
		var nonce = nacl.randomBytes(keepass.keySize);

		var messageData = {
			action: "associate",
			key: key
		};

		var request = {
			action: "associate",
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, "associate", function(response) {
			if (response.message && response.nonce) {
				var res = keepass.decrypt(response.message, response.nonce);
			  	if (!res)
			  	{
					console.log("Failed to decrypt message");
				}
				else
				{
					var message = nacl.util.encodeUTF8(res);
					var parsed = JSON.parse(message);

					if (parsed.version) {
						keepass.currentKeePassXC = {
							"version": parsed.version,
							"versionParsed": parseInt(parsed.version.replace(/\./g,""))};
					}

					var id = parsed.id;
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
		});
		keepass.nativePort.postMessage(request);
	}, tab);
}

keepass.testAssociation = function (callback, tab, triggerUnlock) {
	keepass.getDatabaseHash(function(dbHash) {
		if (!dbHash) {
			callback(false);
			return;
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
				var errorMessage = "No KeePassXC public key available.";
				page.tabs[tab.id].errorMessage = errorMessage;
				console.log(errorMessage);
			}
			callback(false);
			return false;
		}

		var key = keepass.b64e(keepass.keyPair.publicKey);
		var nonce = nacl.randomBytes(keepass.keySize);
		var dbkeys = keepass.getCryptoKey();
		if (dbkeys == null) {
			if (tab && page.tabs[tab.id]) {
				var errorMessage = "No saved databases found.";
				page.tabs[tab.id].errorMessage = errorMessage;
				console.log(errorMessage);
			}
			callback(false);
			return false;
		}

		var id = dbkeys[0];
		var idkey = dbkeys[1];

		var messageData = {
			action: "test-associate",
			id: id,
			key: idkey
		};
		
		var request = {
			action: "test-associate",
			message: keepass.encrypt(messageData, nonce),
			nonce: keepass.b64e(nonce)
		};

		keepass.callbackOnId(keepass.nativePort.onMessage, "test-associate", function(response) {
			if (response.message && response.nonce) {
				var res = keepass.decrypt(response.message, response.nonce);
		  		if (!res) {
					console.log("Failed to decrypt message");
				}
				else
				{
					var message = nacl.util.encodeUTF8(res);
					var parsed = JSON.parse(message);

					if (parsed.version) {
						keepass.currentKeePassXC = {
							"version": parsed.version,
							"versionParsed": parseInt(parsed.version.replace(/\./g,""))};
					}

					var id = parsed.id;
					keepass.isEncryptionKeyUnrecognized = false;
					if (!keepass.verifyResponse(parsed, response.nonce)) {
						var hash = response.hash || 0;
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

	var message = { "action": "get-databasehash" };
	keepass.callbackOnId(keepass.nativePort.onMessage, "get-databasehash", function(response) {
		if (response.hash)
		{
			console.log("hash reply received: "+ response.hash);
			var oldDatabaseHash = keepass.databaseHash;
			keepass.setcurrentKeePassXCVersion(response.version);
			keepass.databaseHash = response.hash || "no-hash";

			if (oldDatabaseHash && oldDatabaseHash != keepass.databaseHash) {
				keepass.associated.value = false;
				keepass.associated.hash = null;
			}

			statusOK();
			callback(response.hash);
		}
		else if (response.errorCode)
		{
			keepass.databaseHash = "no-hash";
			keepass.isDatabaseClosed = true;
			console.log("Error: KeePass database is not opened.");
			if (tab && page.tabs[tab.id]) {
				page.tabs[tab.id].errorMessage = "KeePass database is not opened.";
			}
			callback(keepass.databaseHash);
		}
		else
		{
			keepass.databaseHash = "no-hash";
			if (tab && page.tabs[tab.id]) {
				page.tabs[tab.id].errorMessage = "Database hash not received.";
			}
			callback(keepass.databaseHash);
		}
	});
	keepass.nativePort.postMessage(message);
}

keepass.changePublicKeys = function(tab, callback) {
	if (!keepass.isConnected) {
		return;
	}

	var key = keepass.b64e(keepass.keyPair.publicKey);
	var nonce = nacl.randomBytes(keepass.keySize);
	nonce = keepass.b64e(nonce);

	var message = {
		"action": "change-public-keys",
		"publicKey": key,
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
		keepass.getDatabaseHash(function(dbHash) {
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
		keepass.getDatabaseHash(function(hash) {
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
		var lastChecked = (keepass.latestKeePassXC.lastChecked) ? new Date(keepass.latestKeePassXC.lastChecked) : new Date("11/21/1986");
		var daysSinceLastCheck = Math.floor(((new Date()).getTime()-lastChecked.getTime())/86400000);
		if (daysSinceLastCheck >= page.settings.checkUpdateKeePassXC) {
			keepass.checkForNewKeePassXCVersion();
		}
	}

	return (keepass.currentKeePassXC.versionParsed > 0 && keepass.currentKeePassXC.versionParsed < keepass.latestKeePassXC.versionParsed);
}

keepass.checkForNewKeePassXCVersion = function() {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", keepass.latestVersionUrl, true);
	xhr.onload = function(e) {
		if (xhr.readyState == 4) {
			if (xhr.status == 200) {
				var $version = xhr.responseText;
				if ($version.substring(0, 1) == "2") {
					$version = $version.substring(0, $version.indexOf(" "));
					keepass.latestKeePassXC.version = $version;
					keepass.latestKeePassXC.versionParsed = parseInt($version.replace(/\./g,""));
				}
			}
			else {
				$version = -1;
			}
		}

		if ($version != -1) {
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

	var reply = false;

	var respnonce = keepass.b64d(response.nonce);
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

	var id = keepass.keyRing[keepass.databaseHash].id;
	var key = null;

	if (id) {
		key = keepass.keyRing[keepass.databaseHash].key;
	}

	return key ? [id, key] : null;
}

keepass.setCryptoKey = function(id, key) {
	keepass.saveKey(keepass.databaseHash, id, key);
}

keepass.encrypt = function(input, nonce) {
	var messageData = nacl.util.decodeUTF8(JSON.stringify(input));
	var message = nacl.box(messageData, nonce, keepass.serverPublicKey, keepass.keyPair.secretKey);
	if (!message) {
		return "";
	}
	return keepass.b64e(message);
}

keepass.decrypt = function(input, nonce, toStr) {
	var m = keepass.b64d(input);
	var n = keepass.b64d(nonce);
	return nacl.box.open(m, n, keepass.serverPublicKey, keepass.keyPair.secretKey);
}
