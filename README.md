# keepassxc-browser
Chrome extension for [KeePassXC](https://keepassxc.org/) with Native Messaging.

This is a heavily forked version of [pfn](https://github.com/pfn)'s [chromeIPass](https://github.com/pfn/passifox).
For testing purposes, please use following unofficial KeePassXC [release's](https://github.com/varjolintu/keepassxc/releases).

Get the extension for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/keepassxc-browser/) or [Chrome/Chromium](https://chrome.google.com/webstore/detail/keepassxc-browser/iopaggbpplllidnfmcghoonnokmjoicf).

## Protocol

Transmitting messages between KeePassXC and keepassxc-browser is totally rewritten. This is still under development.
Now the requests are encrypted by [TweetNaCl.js](https://github.com/dchest/tweetnacl-js) box method and does the following:

1. keepassxc-browser generates a key pair (with public and secret key) and transfers the public key to KeePassXC
2. When KeePassXC receives the public key it generates its own key pair and transfers the public key to keepassxc-browser
3. All messages (excluding get-databasehash) are now encrypted.
4. When keepassxc-browser sends a message it is encrypted with KeePassXC's public key, a random generated nonce and keepassxc-browser's secret key.
5. When KeePassXC sends a message it is encrypted with keepassxc-browser's public key etc.
6. Databases are stored based on the current public key used with `associate`. A new key pair for data transfer is generated each time keepassxc-browser is launched.

Encrypted messages are built with these JSON parameters:
- action - `test-associate`, `associate`, `get-logins`, `get-logins-count`, `set-login`...
- message - Encrypted message, base64 encoded
- nonce - 24 bytes long random data, base64 encoded. This must be the same when responding to a request.

### change-public-keys
Request:
```javascript
{
	"action": "change-public-keys",
	"publicKey": "<current public key>",
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

Response (success):
```javascript
{
	"action": "change-public-keys",
	"version": "2.1.2",
	"publicKey": "<host public key>",
	"success": "true"
}
```

### get-databasehash
Request:
```javascript
{
	"action": "get-databasehash"
}
```

Response (success):
```javascript
{
	"action": "hash",
	"hash": "29234e32274a32276e25666a42",
	"version": "2.1.2"
}
```

### associate
Unencrypted message:
```javascript
{
	"action": "associate",
	"key": "<current public key>"
}
```

Request:
```javascript
{
	"action": "associate",
	"message": encryptedMessage
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

Response message data (success, decrypted):
```javascript
{
	"hash": "29234e32274a32276e25666a42",
	"version": "2.1.2",
	"success": "true",
	"id": "testclient",
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

### test-associate
Unencrypted message:
```javascript
{
	"action": "test-associate",
	"id": "<saved database identifier>",
	"key": "<saved database public key>"
}
```

Request:
```javascript
{
	"action": "test-associate",
	"message": encryptedMessage
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

Response message data (success, decrypted):
```javascript
{
	"version": "2.1.2",
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
	"hash": "29234e32274a32276e25666a42",
	"id": "testclient",
	"success": "true"
}
```

### generate-password
Request:
```javascript
{
	"action": "generate-password",
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

Response message data (success, decrypted):
```javascript
{
	"version": "2.1.2",
	"entries": [
		{
			"login": 144,
			"password": "testclientpassword"
		}
	],
	"success": "true",
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

### get-logins
Unencrypted message:
```javascript
{
	"action": "get-logins",
	"url": "<snip>",
	"submitUrl": optional
}
```

Request:
```javascript
{
	"action": "get-logins",
	"message": encryptedMessage
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

Response message data (success, decrypted):
```javascript
{
	"count": "2",
	"entries" : [
	{
		"login": "user1",
		"name": "user1",
		"password": "passwd1"
	},
	{
		"login": "user2",
		"name": "user2",
		"password": "passwd2"
	}],
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
	"success": "true",
	"hash": "29234e32274a32276e25666a42",
	"version": "2.1.2"
}
```

### set-login
Unencrypted message:
```javascript
{
	"action": "set-login",
	"url": "<snip>",
	"submitUrl": "<snip>",
	"id": "testclient",
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
	"login": "user1",
	"password": "passwd1"
}
```

Request:
```javascript
{
	"action": "set-login",
	"message": encryptedMessage
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

Response message data (success, decrypted):
```javascript
{
	"count": null,
	"entries" : null,
	"error": "",
	"nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
	"success": "true",
	"hash": "29234e32274a32276e25666a42",
	"version": "2.1.2"
}
```

## Licenses

```
PassIFox & ChromeIPass Copyright © 2010-2017 Perry Nguyen  
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3 of the License.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
```

The following quick method to determine which browser is used with API calls by [David Rousset](https://github.com/davrous):
```javascript
window.browser = (function () {
  return window.msBrowser ||
    window.browser ||
    window.chrome;
})();
```

```
MIT License

Copyright (c) 2016 David Rousset

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```