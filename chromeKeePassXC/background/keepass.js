var keepass = {};

keepass.associated = {"value": false, "hash": null};
keepass.isConnected = false;
keepass.isDatabaseClosed = false;
keepass.isKeePassXCAvailable = false;
keepass.useSecretBox = false;
keepass.isEncryptionKeyUnrecognized = false;
keepass.currentKeePassXC = {"version": 0, "versionParsed": 0};
keepass.latestKeePassXC = (typeof(localStorage.latestKeePassXC) == 'undefined') ? {"version": 0, "versionParsed": 0, "lastChecked": null} : JSON.parse(localStorage.latestKeePassXC);
keepass.requiredKeePassXC = 212;
keepass.nativeHostName = "com.varjolintu.chromekeepassxc";
keepass.nativePort = null;
keepass.keySize = 8;
keepass.latestVersionUrl = "https://raw.githubusercontent.com/keepassxreboot/keepassxc/develop/CHANGELOG";
keepass.cacheTimeout = 30 * 1000; // milliseconds
keepass.databaseHash = "no-hash"; //no-hash = keepasshttp is too old and does not return a hash value
keepass.keyRing = (typeof(localStorage.keyRing) == 'undefined') ? {} : JSON.parse(localStorage.keyRing);
keepass.keyId = "chromekeepassxc-cryptokey-name";
keepass.keyBody = "chromekeepassxc-key";
keepass.to_s = cryptoHelpers.convertByteArrayToString;
keepass.to_b = cryptoHelpers.convertStringToByteArray;


keepass.addCredentials = function(callback, tab, username, password, url) {
	keepass.updateCredentials(callback, tab, null, username, password, url);
}

keepass.updateCredentials = function(callback, tab, entryId, username, password, url) {
	page.debug("keepass.updateCredentials(callback, {1}, {2}, {3}, [password], {4})", tab.id, entryId, username, url);

	// unset error message
	page.tabs[tab.id].errorMessage = null;

	// is browser associated to keepass?
	if(!keepass.testAssociation(tab)) {
		browserAction.showDefault(null, tab);
		callback("error");
		return;
	}

	// build request
	var request = {
		RequestType: "set-login"
	};
	var verifier = keepass.setVerifier(request);
	var id = verifier[0];
	var key = verifier[1];
	var iv = request.Nonce;


	request.Login = keepass.encrypt(nacl.util.encode_UTF8(username), key, iv);

	request.Password = keepass.encrypt(nacl.util.encode_UTF8(password), key, iv);
	request.Url = keepass.encrypt(url, key, iv);
	request.SubmitUrl = keepass.encrypt(url, key, iv);

	if(entryId) {
		request.Uuid = keepass.encrypt(entryId, key, iv);
	}

	// send request
	var result = keepass.send(request);
	var status = result[0];
	var response = result[1];

	// verify response
	var code = "error";
	if(keepass.checkStatus(status, tab)) {
		var r = JSON.parse(response);
		if (keepass.verifyResponse(r, key, id)) {
			code = "success";
		}
		else {
			code = "error";
		}
	}

	callback(code);
}

keepass.retrieveCredentials = function (callback, tab, url, submiturl, forceCallback, triggerUnlock) {
	page.debug("keepass.retrieveCredentials(callback, {1}, {2}, {3}, {4})", tab.id, url, submiturl, forceCallback);

	// is browser associated to keepass?
	if(!keepass.testAssociation(tab)) {
		browserAction.showDefault(null, tab);
		callback("error");
		return;
	}

	// unset error message
	page.tabs[tab.id].errorMessage = null;

	if (!keepass.isConnected) {
		return;
	}

	var entries = [];
	message = { 
		"action": "get-logins",
		"url": url
	};

	var verifier = keepass.setVerifier(message);
	var id = verifier[0];
	var key = verifier[1];
	var iv = message.nonce;
	var entries = [];

	keepass.callbackOnId(keepass.nativePort.onMessage, "get-logins-reply", function(response) {
		if (response) {
			keepass.setcurrentKeePassXCVersion(response.version);

			if (keepass.verifyResponse(response, key, id)) {
				var rIv = response.nonce;
				for (var i = 0; i < response.entries.length; i++) {
					keepass.decryptEntry(response.entries[i], key, rIv);
				}
				entries = response.entries;
				keepass.updateLastUsed(keepass.databaseHash);
				if(entries.length == 0) {
					//questionmark-icon is not triggered, so we have to trigger for the normal symbol
					browserAction.showDefault(null, tab);
				}
				callback(entries);
			}
			else {
				console.log("RetrieveCredentials for " + url + " rejected");
			}
		}
		else {
			browserAction.showDefault(null, tab);
		}
	});
	keepass.nativePort.postMessage(message);
	page.debug("keepass.retrieveCredentials() => entries.length = {1}", entries.length);
}

// Handles the replies with callback provided
keepass.handleReply = function (msg) {
	// Specific callback handling. Needed?
	/*var reply;
	if (msg.action == "generate-reply") {
		
	}
	else {
		reply = msg;
	}
	return reply;*/
	return msg;
}

// Redirects the callback to a listener (handleReply())
keepass.callbackOnId = function (ev, id, callback) {
	var listener = ( function(port, id) {
		var handler = function(msg) {
			if(msg.action == id) {
				var reply = keepass.handleReply(msg);
				ev.removeListener(handler);
				callback(reply);				
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

	// is browser associated to keepass?
	if(!keepass.testAssociation(tab)) {
		browserAction.showDefault(null, tab);
		callback("error");
		return;
	}

	if(keepass.currentKeePassXC.versionParsed < keepass.requiredKeePassXC) {
		callback([]);
		return;
	}

	var passwords = [];
	message = { "action": "generate-password" };
	var verifier = keepass.setVerifier(message);
	var id = verifier[0];
	var key = verifier[1];

	keepass.callbackOnId(keepass.nativePort.onMessage, "generate-reply", function(response) {
		console.log("Handling generate-reply");
		keepass.setcurrentKeePassXCVersion(response.version);
		var passwords = [];

		if (keepass.verifyResponse(response, key, id)) {
			var rIv = response.nonce;

			if(response.entries) {
				for (var i = 0; i < response.entries.length; i++) {
					keepass.decryptEntry(response.entries[i], key, rIv);
				}
				passwords = response.entries;
				keepass.updateLastUsed(keepass.databaseHash);
			}
			else {
				console.log("No entries returned. Is KeePassHttp up-to-date?");
			}
		}
		else {
			console.log("GeneratePassword rejected");
		}
		callback(passwords);
	});
	keepass.nativePort.postMessage(message);
}

keepass.copyPassword = function(callback, tab, password) {
	var bg = chrome.extension.getBackgroundPage();
	var c2c = bg.document.getElementById("copy2clipboard");
	if(!c2c) {
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
}

keepass.associate = function(callback, tab) {
	if(keepass.isAssociated()) {
		return;
	}

	keepass.getDatabaseHash(callback, tab);

	if(keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
		return;
	}

	page.tabs[tab.id].errorMessage = null;

	//var rawKey = nacl.randomBytes(keepass.keySize * 2);
	var rawKey = [41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56]; // This is just for testing with the test client. KSorLC0uLzAxMjM0NTY3OA== )*+,-./012345678
	//console.log(rawKey);
	var key = keepass.b64e(rawKey);

	var request = {
		action: "associate",
		key: key
	};

	keepass.setVerifier(request, key);

	keepass.callbackOnId(keepass.nativePort.onMessage, "associate-reply", function(response) {
		if (response.version) {
			keepass.currentKeePassXC = {
				"version": response.version,
				"versionParsed": parseInt(response.version.replace(/\./g,""))}
			;
		}

		var id = response.id;
		if(!keepass.verifyResponse(response, key)) {
			page.tabs[tab.id].errorMessage = "KeePassXC association failed, try again.";
		}
		else {
			keepass.setCryptoKey(id, key);
			keepass.associated.value = true;
			keepass.associated.hash = response.hash || 0;
		}

		browserAction.show(callback, tab);
	});
	
	keepass.nativePort.postMessage(request);
}

keepass.testAssociation = function (tab, triggerUnlock) {
	keepass.getDatabaseHash(null, tab, triggerUnlock);

	if(keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
		return false;
	}

	if(keepass.isAssociated()) {
		return true;
	}

	var message = {
		"action": "test-associate",
	};
	var verifier = keepass.setVerifier(message);

	if(!verifier) {
		keepass.associated.value = false;
		keepass.associated.hash = null;
		return false;
	}

	keepass.callbackOnId(keepass.nativePort.onMessage, "test-associate-reply", function(response) {
		if (response) {
			var id = verifier[0];
			var key = verifier[1];

			if(response.version) {
				keepass.currentKeePassXC = {
					"version": response.version,
					"versionParsed": parseInt(response.version.replace(/\./g,""))
				};
			}

			keepass.isEncryptionKeyUnrecognized = false;
			if(!keepass.verifyResponse(response, key, id)) {
				var hash = response.hash || 0;
				keepass.deleteKey(hash);
				keepass.isEncryptionKeyUnrecognized = true;
				console.log("Encryption key is not recognized!");
				page.tabs[tab.id].errorMessage = "Encryption key is not recognized.";
				keepass.associated.value = false;
				keepass.associated.hash = null;
			}
			else if(!keepass.isAssociated()) {
				console.log("Association was not successful");
				page.tabs[tab.id].errorMessage = "Association was not successful.";
			}
		}
	});
	keepass.nativePort.postMessage(message);

	return keepass.isAssociated();
}

keepass.getDatabaseHash = function (callback, tab, triggerUnlock) {
	if (!keepass.isConnected) {
		return;
	}

	message = { "action": "get-databasehash" };
	keepass.callbackOnId(keepass.nativePort.onMessage, "hash-reply", function(response) {
		console.log("hash-reply received: "+ response.hash);
		var oldDatabaseHash = keepass.databaseHash;
		keepass.setcurrentKeePassXCVersion(response.version);
		keepass.databaseHash = response.hash || "no-hash";

		if(oldDatabaseHash && oldDatabaseHash != keepass.databaseHash) {
			keepass.associated.value = false;
			keepass.associated.hash = null;
		}

		statusOK();
		return keepass.databaseHash;
	});
	keepass.nativePort.postMessage(message);
}

keepass.isConfigured = function() {
	if(typeof(keepass.databaseHash) == "undefined") {
		keepass.getDatabaseHash();
	}
	return (keepass.databaseHash in keepass.keyRing);
}

keepass.isAssociated = function() {
	return (keepass.associated.value && keepass.associated.hash && keepass.associated.hash == keepass.databaseHash);
}

// Needed?
keepass.checkStatus = function (status, tab) {
	var success = (status >= 200 && status <= 299);
	keepass.isDatabaseClosed = false;
	keepass.isKeePassXCAvailable = true;

	if(tab && page.tabs[tab.id]) {
		delete page.tabs[tab.id].errorMessage;
	}
	if (!success) {
		keepass.associated.value = false;
		keepass.associated.hash = null;
		if(tab && page.tabs[tab.id]) {
			page.tabs[tab.id].errorMessage = "Unknown error: " + status;
		}
		console.log("Error: "+ status);
		if (status == 503) {
			keepass.isDatabaseClosed = true;
			console.log("KeePass database is not opened");
			if(tab && page.tabs[tab.id]) {
				page.tabs[tab.id].errorMessage = "KeePass database is not opened.";
			}
		}
		else if (status == 0) {
			keepass.isKeePassXCAvailable = false;
			console.log("Could not connect to keepass");
			if(tab && page.tabs[tab.id]) {
				page.tabs[tab.id].errorMessage = "Is KeePassXC installed and running?";
			}
		}
	}

	page.debug("keepass.checkStatus({1}, [tabID]) => {2}", status, success);

	return success;
}

keepass.convertKeyToKeyRing = function() {
	if(keepass.keyId in localStorage && keepass.keyBody in localStorage && !("keyRing" in localStorage)) {
		//var hash = keepass.getDatabaseHash(null);
		//keepass.saveKey(hash, localStorage[keepass.keyId], localStorage[keepass.keyBody]);

		keepass.getDatabaseHash(function(hash) {
			keepass.saveKey(hash, localStorage[keepass.keyId], localStorage[keepass.keyBody]);
		}, null);
	}

	if("keyRing" in localStorage) {
		delete localStorage[keepass.keyId];
		delete localStorage[keepass.keyBody];
	}
}

keepass.saveKey = function(hash, id, key) {
	if(!(hash in keepass.keyRing)) {
		keepass.keyRing[hash] = {
			"id": id,
			"key": key,
			"icon": "blue",
			"created": new Date(),
			"last-used": new Date()
		}
	}
	else {
		keepass.keyRing[hash].id = id;
		keepass.keyRing[hash].key = key;
	}
	localStorage.keyRing = JSON.stringify(keepass.keyRing);
}

keepass.updateLastUsed = function(hash) {
	if((hash in keepass.keyRing)) {
		keepass.keyRing[hash].lastUsed = new Date();
		localStorage.keyRing = JSON.stringify(keepass.keyRing);
	}
}

keepass.deleteKey = function(hash) {
	delete keepass.keyRing[hash];
	localStorage.keyRing = JSON.stringify(keepass.keyRing);
}

keepass.getIconColor = function() {
	return ((keepass.databaseHash in keepass.keyRing) && keepass.keyRing[keepass.databaseHash].icon) ? keepass.keyRing[keepass.databaseHash].icon : "blue";
}

keepass.setcurrentKeePassXCVersion = function(version) {
	if(version) {
		keepass.currentKeePassXC = {
			"version": version,
			"versionParsed": parseInt(version.replace(/\./g,""))
		};
	}
}

keepass.keePassXCUpdateAvailable = function() {
	if(page.settings.checkUpdateKeePassXC && page.settings.checkUpdateKeePassXC > 0) {
		var lastChecked = (keepass.latestKeePassXC.lastChecked) ? new Date(keepass.latestKeePassXC.lastChecked) : new Date("11/21/1986");
		var daysSinceLastCheck = Math.floor(((new Date()).getTime()-lastChecked.getTime())/86400000);
		if(daysSinceLastCheck >= page.settings.checkUpdateKeePassXC) {
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
				if($version.substring(0, 1) == "2") {			
					$version = $version.substring(0, $version.indexOf(" "));
					keepass.latestKeePassXC.version = $version;
					keepass.latestKeePassXC.versionParsed = parseInt($version.replace(/\./g,""));
				}
			}
			else {
				$version = -1;
			}
		}

		if($version != -1) {
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
	console.log("Received message: " + JSON.stringify(response));
}

function onDisconnected() {
  console.log("Failed to connect: " + chrome.runtime.lastError.message);
  keepass.nativePort = null;
  keepass.isConnected = false;
}

keepass.nativeConnect = function() {
	console.log("Connecting to native messaging host " + keepass.nativeHostName)
	keepass.nativePort = chrome.runtime.connectNative(keepass.nativeHostName);
	keepass.nativePort.onMessage.addListener(keepass.onNativeMessage);
	keepass.nativePort.onDisconnect.addListener(onDisconnected);
	keepass.isConnected = true;
}

keepass.setVerifier = function(request, inputKey) {
	var key = inputKey || null;
	var id = null;

	if(!key) {
		var info = keepass.getCryptoKey();
		if (info == null) {
			return null;
		}
		id = info[0];
		key = info[1];
	}

	if(id) {
		request.id = id;
	}

	var nonce = nacl.randomBytes(keepass.keySize * 2);
	request.nonce = keepass.b64e(nonce);
	request.verifier = keepass.encrypt(request.nonce, key, request.nonce);

	var test = keepass.encrypt("Aeh9maerCjE5v5V8Tz2YxA==", key, "Aeh9maerCjE5v5V8Tz2YxA==");
	console.log(test);

	return [id, key];
}

keepass.verifyResponse = function(response, key, id) {
	keepass.associated.value = response.success;
	if (!response.success) {
		keepass.associated.hash = null;
		return false;
	}

	keepass.associated.hash = keepass.databaseHash;

	var nonce = response.nonce;
	var value = keepass.decrypt(response.verifier, key, nonce, true);

	keepass.associated.value = (value == nonce);

	if(id) {
		keepass.associated.value = (keepass.associated.value && id == response.id);
	}

	keepass.associated.hash = (keepass.associated.value) ? keepass.databaseHash : null;

	return keepass.isAssociated();

}

keepass.b64e = function(d) {
	//return btoa(keepass.to_s(d));
	return nacl.util.encodeBase64(d);
}

keepass.b64d = function(d) {
	//return keepass.to_b(atob(d));
	return nacl.util.decodeBase64(d);
}

keepass.getCryptoKey = function() {
	if(!(keepass.databaseHash in keepass.keyRing)) {
		return null;
	}

	var id = keepass.keyRing[keepass.databaseHash].id;
	var key = null;

	if(id) {
		key = keepass.keyRing[keepass.databaseHash].key;
	}

	return key ? [id, key] : null;
}

keepass.setCryptoKey = function(id, key) {
	keepass.saveKey(keepass.databaseHash, id, key);
}

keepass.encrypt = function(input, key, nonce) {
	return keepass.b64e(slowAES.encrypt(keepass.to_b(input), slowAES.modeOfOperation.CBC, keepass.b64d(key), keepass.b64d(nonce)));
	//return keepass.b64e(nacl.secretbox(keepass.to_b(input), keepass.b64d(nonce), keepass.b64d(key)));
}

keepass.decrypt = function(input, key, nonce, toStr) {
	var output = slowAES.decrypt(keepass.b64d(input), slowAES.modeOfOperation.CBC, keepass.b64d(key), keepass.b64d(nonce));
	//var output = nacl.secretbox.open(keepass.b64d(input), keepass.b64d(nonce), keepass.b64d(key));
	return toStr ? keepass.to_s(output) : output;
}

keepass.decryptEntry = function (box, key, nonce) {
	var e = keepass.useSecretBox ? nacl.secretbox.open(box, nonce, key) : box;
	if (e)
	{
		e.uuid = keepass.decrypt(e.uuid, key, nonce, true);
		e.name = UTF8.decode(keepass.decrypt(e.name, key, nonce, true));
		e.login = UTF8.decode(keepass.decrypt(e.login, key, nonce, true));
		e.password = UTF8.decode(keepass.decrypt(e.password, key, nonce, true));

		if(e.StringFields) {
			for(var i = 0; i < e.StringFields.length; i++) {
				e.StringFields[i].Key = UTF8.decode(keepass.decrypt(e.StringFields[i].Key, key, nonce, true))
				e.StringFields[i].Value = UTF8.decode(keepass.decrypt(e.StringFields[i].Value, key, nonce, true))
			}
		}
	}
}
