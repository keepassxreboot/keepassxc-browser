## keepassxc-protocol

Transmitting messages between KeePassXC and keepassxc-browser is totally rewritten. This is still under development.
Now the requests are encrypted by [TweetNaCl.js](https://github.com/dchest/tweetnacl-js) box method and does the following:

1. keepassxc-browser generates a key pair (with public and secret key) and transfers the public key to KeePassXC
2. When KeePassXC receives the public key it generates its own key pair and transfers the public key to keepassxc-browser. Public key is transferred in plain-text. Secret keys are never transferred or used anywhere except when encrypting/decrypting.
3. All messages between the browser extension and KeePassXC are now encrypted.
4. When keepassxc-browser sends a message it is encrypted with KeePassXC's public key, a random generated nonce and keepassxc-browser's secret key.
5. When KeePassXC sends a message it is encrypted with keepassxc-browser's public key and an incremented nonce.
6. Databases are stored with newly created public key used with `associate`. A new key pair for data transfer is generated each time keepassxc-browser is launched. This saved key is not used again, as it's only used for identification.

Thus there are three key pairs involved in every communication:
- `host key` - A temporary key pair created by KeePassXC to encrypt the communication of the current session.
- `client key` - A temporary key pair created by keepassxc-browser to encrypt the communication of the current session.
- `identification key` - A permanent key pair created by keepassxc-browser used to authenticate the browser in later sessions after it was successfully *associated* with a database. This one should be stored safely by the browser. Note that only the public key part is ever used which might be a tiny flaw in the protocol since that part is also stored in the database.

Encrypted messages are built with these JSON parameters:
- action - `test-associate`, `associate`, `get-logins`, `get-logins-count`, `set-login`...
- message - Encrypted message, base64 encoded
- nonce - 24 bytes long random data, base64 encoded. This is incremented to the response.
- clientID - 24 bytes long random data, base64 encoded. This is used for a single session to identify different browsers if multiple are used with proxy application.

Currently these messages are implemented:
- `change-public-keys`: Request for passing public keys from client to server and back.
- `get-databasehash`: Request for receiving the database hash (SHA256) of the current active database.
- `associate`: Request for associating a new client with KeePassXC.
- `test-associate`: Request for testing if the client has been associated with KeePassXC.
- `generate-password`: Request for generating a password. KeePassXC's settings are used.
- `get-logins`: Requests for receiving credentials for the current URL match.
- `set-login`: Request for adding or updating credentials to the database.
- `lock-database`: Request for locking the database from client.
- `database-locked`: A signal from KeePassXC, the current active database is locked.
- `database-unlocked`: A signal from KeePassXC, the current active database is unlocked.
- `get-totp`: Request for receiving the current TOTP.

### change-public-keys
Request:
```json
{
    "action": "change-public-keys",
    "publicKey": "<client public key>",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "clientID": "<clientID>"
}
```

Response (success):
```json
{
    "action": "change-public-keys",
    "version": "2.2.0",
    "publicKey": "<host public key>",
    "success": "true"
}
```

### get-databasehash
Unencrypted message:
```json
{
    "action": "get-databasehash"
}
```

Request:
```json
{
    "action": "get-databasehash",
    "message": "<encrypted message>",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "clientID": "<clientID>"
}
```

Response message data (success, decrypted):
```json
{
    "action": "hash",
    "hash": "29234e32274a32276e25666a42",
    "version": "2.2.0"
}
```

### associate
Unencrypted message:
```json
{
    "action": "associate",
    "key": "<client public key>",
    "idKey": "<a new identification public key>"
}
```

Request:
```json
{
    "action": "associate",
    "message": "<encrypted message>",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "clientID": "<clientID>"
}
```

Response message data (success, decrypted):
```json
{
    "hash": "29234e32274a32276e25666a42",
    "version": "2.2.0",
    "success": "true",
    "id": "testclient",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

### test-associate
Unencrypted message:
```json
{
    "action": "test-associate",
    "id": "<saved database identifier received from associate>",
    "key": "<saved identification public key>"
}
```

Request:
```json
{
    "action": "test-associate",
    "message": "<encrypted message>",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "clientID": "<clientID>"
}
```

Response message data (success, decrypted):
```json
{
    "version": "2.2.0",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "hash": "29234e32274a32276e25666a42",
    "id": "testclient",
    "success": "true"
}
```

### generate-password
Request (no unencrypted message is needed):
```json
{
    "action": "generate-password",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "clientID": "<clientID>"
}
```

Response message data (success, decrypted):
```json
{
    "version": "2.2.0",
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

Response message data (success, decrypted, KeePassXC 2.7.0 and later):
```json
{
    "version": "2.7.0",
    "password": "thePassword",
    "success": "true",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

### get-logins
Unencrypted message:
```json
{
    "action": "get-logins",
    "url": "<snip>",
    "submitUrl": "<optional>",
    "httpAuth": "<optional>",
    "keys": [
        {
            "id": "<saved database identifier received from associate>",
            "key": "<saved identification public key>"
        },
        ...
    ]
}
```

Request:
```json
{
    "action": "get-logins",
    "message": "<encrypted message>",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "clientID": "<clientID>"
}
```

Response message data (success, decrypted):
```json
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
        "password": "passwd2",
        "expired": "true"
    }],
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "success": "true",
    "hash": "29234e32274a32276e25666a42",
    "version": "2.2.0"
}
```

### set-login
Unencrypted message:
```json
{
    "action": "set-login",
    "url": "<snip>",
    "submitUrl": "<snip>",
    "id": "testclient",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "login": "user1",
    "password": "passwd1",
    "group": "<group name>",
    "groupUuid": "<group UUID>",
    "uuid": "<entry UUID>"
}
```

Request:
```json
{
    "action": "set-login",
    "message": "<encrypted message>",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "clientID": "<clientID>"
}
```

Response message data (success, decrypted):
```json
{
    "count": null,
    "entries" : null,
    "error": "",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "success": "true",
    "hash": "29234e32274a32276e25666a42",
    "version": "2.2.0"
}
```

### lock-database
Unencrypted message:
```json
{
    "action": "lock-database"
}
```

Request:
```json
{
    "action": "lock-database",
    "message": "<encrypted message>",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "clientID": "<clientID>"
}
```

Response message data (success always returns an error, decrypted):
```json
{
    "action": "lock-database",
    "errorCode": 1,
    "error": "Database not opened",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

### get-database-groups
Unencrypted message:
```json
{
    "action": "get-database-groups"
}
```

Request:
```json
{
    "action": "get-database-groups",
    "message": "<encrypted message>",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "clientID": "<clientID>"
}
```

Response message data (success, decrypted):
```json
{
    "defaultGroup": "<default group name>",
    "defaultGroupAlwaysAllow": false,
    "groups": [
        {
            "name": "Root",
            "uuid": "<group UUID>",
            "children": [
                {
                    "name": "KeePassXC-Browser Passwords",
                    "uuid": "<group UUID>",
                    "children": []
                },
                {
                    "name": "SecondRoot",
                    "uuid": "<group UUID>",
                    "children": [
                        {
                            "name": "Child",
                            "uuid": "<group UUID>",
                            "children": [
                                {
                                    "name": "GrandChild",
                                    "uuid": "<group UUID>",
                                    "children": []
                                }
                            ]
                        }
                    ]
                },
                {
                    "name": "ThirdRoot",
                    "uuid": "<group UUID>",
                    "children": [
                        {
                            "name": "Child2",
                            "uuid": "<group UUID>",
                            "children": []
                        }
                    ]
                },
                {
                    "name": "Child2",
                    "uuid": "<group UUID>",
                    "children": []
                }
            ]
        }
    ]
}
```
### create-new-group
Unencrypted message:
```json
{
    "action": "create-new-group",
    "groupName": "<group name or path>"
}
```

Request:
```json
{
    "action": "create-new-group",
    "message": "<encrypted message>",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q",
    "clientID": "<clientID>"
}
```

Response message data (success, decrypted):
```json
{
    "name": "<group name>",
    "uuid": "<group UUID>"
}
```

### get-totp (KeePassXC 2.6.1 and newer)
Request (no unencrypted message is needed):
```json
{
    "action": "get-totp",
    "uuid": "<entry UUID>"
}
```

Response message data (success, decrypted):
```json
{
    "totp": <TOTP>,
    "version": "2.2.0",
    "success": "true",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```

### request-autotype (KeePassXC 2.7.0 and newer)
Request (no unencrypted message is needed):
```json
{
    "action": "request-autotype",
    "search": "<base domain of URL>"
}
```

Response message data (success, decrypted):
```json
{
    "version": "2.7.0",
    "success": "true",
    "nonce": "tZvLrBzkQ9GxXq9PvKJj4iAnfPT0VZ3Q"
}
```
