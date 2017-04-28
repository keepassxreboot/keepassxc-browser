# chromeKeePassXC
Chrome extension for [KeePassXC](https://keepassxc.org/) with Native Messaging.

This is a heavily forked version of [pfn](https://github.com/pfn)'s [chromeIPass](https://github.com/pfn/passifox).

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

## Protocol

Transmitting messages between KeePassXC and chromeKeePassXC is totally rewritten. This is still under development.
Now the requests are encrypted by [TweetNaCl.js](https://github.com/dchest/tweetnacl-js) box method and does the following:

1. chromeKeePassXC generates a key pair (with public and secret key) and transfers the public key to KeePassXC
2. When KeePassXC receives the public key it generates its own key pair and transfers the public key to chromeKeePassXC
3. All messages (excluding get-databasehash) are now encrypted.
4. When chromeKeePassXC sends a message it is encrypted with KeePassXC's public key, a random generated nonce and chromeKeePassXC's secret key.
5. When KeePassXC sends a message it is encrypted with chromeKeePassXC's public key etc.
6. Databases are stored based on the current public key used with `associate`. A new key pair for data transfer is generated each time chromeKeePassXC is launched.

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
