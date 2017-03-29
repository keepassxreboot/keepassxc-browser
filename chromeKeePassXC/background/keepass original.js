var keepass = {};

keepass.associated = {"value": false, "hash": null};
keepass.isDatabaseClosed = false;
keepass.isKeePassHttpAvailable = false;
keepass.isEncryptionKeyUnrecognized = false;
keepass.currentKeePassHttp = {"version": 0, "versionParsed": 0};
keepass.latestKeePassHttp = (typeof(localStorage.latestKeePassHttp) == 'undefined') ? {"version": 0, "versionParsed": 0, "lastChecked": null} : JSON.parse(localStorage.latestKeePassHttp);
keepass.keySize = 8; // wtf? stupid cryptoHelpers
keepass.pluginUrlDefault = "http://localhost:19455/";
keepass.latestVersionUrl = "https://passifox.appspot.com/kph/latest-version.txt";
keepass.cacheTimeout = 30 * 1000; // milliseconds
keepass.databaseHash = "no-hash"; //no-hash = keepasshttp is too old and does not return a hash value
keepass.keyRing = (typeof(localStorage.keyRing) == 'undefined') ? {} : JSON.parse(localStorage.keyRing);
keepass.keyId = "chromeipass-cryptokey-name";
keepass.keyBody = "chromeipass-key";
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


	request.Login = keepass.encrypt(cryptoHelpers.encode_utf8(username), key, iv);

	request.Password = keepass.encrypt(cryptoHelpers.encode_utf8(password), key, iv);
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

	// unset error message
	page.tabs[tab.id].errorMessage = null;

	// is browser associated to keepass?
	if(!keepass.testAssociation(tab, triggerUnlock)) {
		browserAction.showDefault(null, tab);
		if(forceCallback) {
			callback([]);
		}
		return;
	}

	// build request
	var request = {
		"RequestType": "get-logins",
		"SortSelection": "true",
		"TriggerUnlock": (triggerUnlock === true) ? "true" : "false"
	};
	var verifier = keepass.setVerifier(request);
	var id = verifier[0];
	var key = verifier[1];
	var iv = request.Nonce;
	request.Url = keepass.encrypt(url, key, iv);

	if(submiturl) {
		request.SubmitUrl = keepass.encrypt(submiturl, key, iv);
	}

	// send request
	var result = keepass.send(request);
	var status = result[0];
	var response = result[1];
	var entries = [];

	// verify response
	if(keepass.checkStatus(status, tab)) {
		var r = JSON.parse(response);

		keepass.setCurrentKeePassHttpVersion(r.Version);

		if (keepass.verifyResponse(r, key, id)) {
			var rIv = r.Nonce;
			for (var i = 0; i < r.Entries.length; i++) {
				keepass.decryptEntry(r.Entries[i], key, rIv);
			}
			entries = r.Entries;
			keepass.updateLastUsed(keepass.databaseHash);
			if(entries.length == 0) {
				//questionmark-icon is not triggered, so we have to trigger for the normal symbol
				browserAction.showDefault(null, tab);
			}
		}
		else {
			console.log("RetrieveCredentials for " + url + " rejected");
		}
	}
	else {
		browserAction.showDefault(null, tab);
	}

	page.debug("keepass.retrieveCredentials() => entries.length = {1}", entries.length);

	callback(entries);
}

keepass.generatePassword = function (callback, tab, forceCallback) {
	// is browser associated to keepass?
	if(!keepass.testAssociation(tab)) {
		browserAction.showDefault(null, tab);
		if(forceCallback) {
			callback([]);
		}
		return;
	}

	if(keepass.currentKeePassHttp.versionParsed < 1400) {
		callback([]);
		return;
	}

	// build request
	var request = {
		RequestType: "generate-password"
	};
	var verifier = keepass.setVerifier(request);
	var id = verifier[0];
	var key = verifier[1];

	// send request
	var result = keepass.send(request);
	var status = result[0];
	var response = result[1];
	var passwords = [];

	// verify response
	if(keepass.checkStatus(status, tab)) {
		var r = JSON.parse(response);

		keepass.setCurrentKeePassHttpVersion(r.Version);

		if (keepass.verifyResponse(r, key, id)) {
			var rIv = r.Nonce;

			if(r.Entries) {
				for (var i = 0; i < r.Entries.length; i++) {
					keepass.decryptEntry(r.Entries[i], key, rIv);
				}
				passwords = r.Entries;
				keepass.updateLastUsed(keepass.databaseHash);
			}
			else {
				console.log("No entries returned. Is KeePassHttp up-to-date?");
			}
		}
		else {
			console.log("GeneratePassword rejected");
		}
	}
	else {
		browserAction.showDefault(null, tab);
	}

	callback(passwords);
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

	keepass.getDatabaseHash(tab);

	if(keepass.isDatabaseClosed || !keepass.isKeePassHttpAvailable) {
		return;
	}

	page.tabs[tab.id].errorMessage = null;

	var rawKey = cryptoHelpers.generateSharedKey(keepass.keySize * 2);
	var key = keepass.b64e(rawKey);

	var request = {
		RequestType: "associate",
		Key: key
	};

	keepass.setVerifier(request, key);

	var result = keepass.send(request);

	if(keepass.checkStatus(result[0], tab)) {
		var r = JSON.parse(result[1]);

		if(r.Version) {
			keepass.currentKeePassHttp = {
				"version": r.Version,
				"versionParsed": parseInt(r.Version.replace(/\./g,""))
			};
		}

		var id = r.Id;
		if(!keepass.verifyResponse(r, key)) {
			page.tabs[tab.id].errorMessage = "KeePass association failed, try again.";
		}
		else {
			keepass.setCryptoKey(id, key);
			keepass.associated.value = true;
			keepass.associated.hash = r.Hash || 0;
		}

		browserAction.show(callback, tab);
	}
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

keepass.send = function(request) {
	var xhr = new XMLHttpRequest();
	xhr.open("POST", keepass.getPluginUrl(), false);
	xhr.setRequestHeader("Content-Type", "application/json");
	try {
		var r = JSON.stringify(request);
		page.debug("Request: {1}", r);
		xhr.send(r);
	}
	catch (e) {
		console.log("KeePassHttp: " + e);
	}
	page.debug("Response: {1} => {2}", xhr.status, xhr.responseText);
	return [xhr.status, xhr.responseText];
}

keepass.checkStatus = function (status, tab) {
	var success = (status >= 200 && status <= 299);
	keepass.isDatabaseClosed = false;
	keepass.isKeePassHttpAvailable = true;

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
			keepass.isKeePassHttpAvailable = false;
			console.log("Could not connect to keepass");
			if(tab && page.tabs[tab.id]) {
				page.tabs[tab.id].errorMessage = "Is KeePassHttp installed and is KeePass running?";
			}
		}
	}

	page.debug("keepass.checkStatus({1}, [tabID]) => {2}", status, success);

	return success;
}

keepass.convertKeyToKeyRing = function() {
	if(keepass.keyId in localStorage && keepass.keyBody in localStorage && !("keyRing" in localStorage)) {
		var hash = keepass.getDatabaseHash(null);
		keepass.saveKey(hash, localStorage[keepass.keyId], localStorage[keepass.keyBody]);
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

keepass.getPluginUrl = function() {
	if(page.settings.hostname && page.settings.port) {
		return "http://" + page.settings.hostname + ":" + page.settings.port;
	}
	return keepass.pluginUrlDefault;
}

keepass.setCurrentKeePassHttpVersion = function(version) {
	if(version) {
		keepass.currentKeePassHttp = {
			"version": version,
			"versionParsed": parseInt(version.replace(/\./g,""))
		};
	}
}

keepass.keePassHttpUpdateAvailable = function() {
	if(page.settings.checkUpdateKeePassHttp && page.settings.checkUpdateKeePassHttp > 0) {
		var lastChecked = (keepass.latestKeePassHttp.lastChecked) ? new Date(keepass.latestKeePassHttp.lastChecked) : new Date("11/21/1986");
		var daysSinceLastCheck = Math.floor(((new Date()).getTime()-lastChecked.getTime())/86400000);
		if(daysSinceLastCheck >= page.settings.checkUpdateKeePassHttp) {
			keepass.checkForNewKeePassHttpVersion();
		}
	}

	return (keepass.currentKeePassHttp.versionParsed > 0 && keepass.currentKeePassHttp.versionParsed < keepass.latestKeePassHttp.versionParsed);
}

keepass.checkForNewKeePassHttpVersion = function() {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", keepass.latestVersionUrl, false);
	xhr.setRequestHeader("Content-Type", "application/json");
	try {
		xhr.send();
		var $version = xhr.responseText;
		if($version.substring(0, 1) == ":") {
			$version = $version.substring(xhr.responseText.indexOf("KeePassHttp") + 12);
			$version = $version.substring(0, $version.indexOf(":") - 1);
			keepass.latestKeePassHttp.version = $version;
			keepass.latestKeePassHttp.versionParsed = parseInt($version.replace(/\./g,""));
		}
		else {
			$version = -1;
		}
	}
	catch (e) {
		console.log("Error: " + e);
	}

	if($version != -1) {
		localStorage.latestKeePassHttp = JSON.stringify(keepass.latestKeePassHttp);
	}
	keepass.latestKeePassHttp.lastChecked = new Date();
}

keepass.testAssociation = function (tab, triggerUnlock) {
	keepass.getDatabaseHash(tab, triggerUnlock);

	if(keepass.isDatabaseClosed || !keepass.isKeePassHttpAvailable) {
		return false;
	}

	if(keepass.isAssociated()) {
		return true;
	}

	var request = {
		"RequestType": "test-associate",
		"TriggerUnlock": (triggerUnlock === true) ? "true" : false
	};
	var verifier = keepass.setVerifier(request);

	if(!verifier) {
		keepass.associated.value = false;
		keepass.associated.hash = null;
		return false;
	}

	var result = keepass.send(request);
	var status = result[0];
	var response = result[1];

	if(keepass.checkStatus(status, tab)) {
		var r = JSON.parse(response);
		var id = verifier[0];
		var key = verifier[1];

		if(r.Version) {
			keepass.currentKeePassHttp = {
				"version": r.Version,
				"versionParsed": parseInt(r.Version.replace(/\./g,""))
			};
		}

	keepass.isEncryptionKeyUnrecognized = false;
		if(!keepass.verifyResponse(r, key, id)) {
			var hash = r.Hash || 0;
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

	return keepass.isAssociated();
}

keepass.getDatabaseHash = function (tab, triggerUnlock) {
	var request = {
		"RequestType": "test-associate",
		"TriggerUnlock": (triggerUnlock === true) ? "true" : false
	};

	var oldDatabaseHash = keepass.databaseHash;

	var result = keepass.send(request);
	if(keepass.checkStatus(result[0], tab)) {
		var response = JSON.parse(result[1]);
		keepass.setCurrentKeePassHttpVersion(response.Version);
		keepass.databaseHash = response.Hash || "no-hash";
	}
	else {
		keepass.databaseHash = "no-hash";
	}

	if(oldDatabaseHash && oldDatabaseHash != keepass.databaseHash) {
		//console.log("clear association (old db hash != new db hash ==> " + oldDatabaseHash + " != " + keepass.databaseHash);
		keepass.associated.value = false;
		keepass.associated.hash = null;
	}

	return keepass.databaseHash;
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
		request.Id = id;
	}

	var iv = cryptoHelpers.generateSharedKey(keepass.keySize);
	request.Nonce = keepass.b64e(iv);

	//var decodedKey = keepass.b64d(key);
	request.Verifier = keepass.encrypt(request.Nonce, key, request.Nonce);

	return [id, key];
}

keepass.verifyResponse = function(response, key, id) {
	keepass.associated.value = response.Success;
	if (!response.Success) {
		keepass.associated.hash = null;
		return false;
	}

	keepass.associated.hash = keepass.databaseHash;

	var iv = response.Nonce;
	var value = keepass.decrypt(response.Verifier, key, iv, true);

	keepass.associated.value = (value == iv);

	if(id) {
		keepass.associated.value = (keepass.associated.value && id == response.Id);
	}

	keepass.associated.hash = (keepass.associated.value) ? keepass.databaseHash : null;

	return keepass.isAssociated();

}

keepass.b64e = function(d) {
	return btoa(keepass.to_s(d));
}

keepass.b64d = function(d) {
	return keepass.to_b(atob(d));
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

keepass.encrypt = function(input, key, iv) {
	return keepass.b64e(
		slowAES.encrypt(
			keepass.to_b(input),
			slowAES.modeOfOperation.CBC,
			keepass.b64d(key),
			keepass.b64d(iv)
		)
	);
}

keepass.decrypt = function(input, key, iv, toStr) {
	var output = slowAES.decrypt(
			keepass.b64d(input),
			slowAES.modeOfOperation.CBC,
			keepass.b64d(key),
			keepass.b64d(iv)
		);

	return toStr ? keepass.to_s(output) : output;
}

keepass.decryptEntry = function (e, key, iv) {
	e.Uuid = keepass.decrypt(e.Uuid, key, iv, true);
	e.Name = UTF8.decode(keepass.decrypt(e.Name, key, iv, true));
	e.Login = UTF8.decode(keepass.decrypt(e.Login, key, iv, true));
	e.Password = UTF8.decode(keepass.decrypt(e.Password, key, iv, true));

	if(e.StringFields) {
		for(var i = 0; i < e.StringFields.length; i++) {
			e.StringFields[i].Key = UTF8.decode(keepass.decrypt(e.StringFields[i].Key, key, iv, true))
			e.StringFields[i].Value = UTF8.decode(keepass.decrypt(e.StringFields[i].Value, key, iv, true))
		}
	}
}
