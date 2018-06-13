var assert = require('assert'),
    rewire = require('rewire'),
    browser = require('sinon-chrome');

var BG_URL = '../keepassxc-browser/background/';

// Unit tests
describe('Unit tests with background/keepass.js', function() {
    it('Test error message handling', function() {
        var keepass = rewire(BG_URL + 'keepass.js');
        var kpErrors = keepass.__get__('kpErrors');
        var page = keepass.__get__('page');
        var tab = { id: 0 };

        keepass.handleError(tab, 123, 'A manually set error message');
        assert.equal(page.tabs[tab.id].errorMessage, 'A manually set error message');

        keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
        assert.equal(page.tabs[tab.id].errorMessage, kpErrors.errorMessages[kpErrors.CANNOT_DECRYPT_MESSAGE].msg);

        keepass.handleError(tab, kpErrors.EMPTY_MESSAGE_RECEIVED);
        assert.equal(page.tabs[tab.id].errorMessage, kpErrors.errorMessages[kpErrors.EMPTY_MESSAGE_RECEIVED].msg);
    });

    it('Test nonce incrementation', function() {
        var keepass = rewire(BG_URL + 'keepass.js');
        var nacl = rewire(BG_URL + 'nacl.min.js');
        nacl.util = rewire(BG_URL + 'nacl-util.min.js');

        var nonce = keepass.getNonce();
        var incrementedNonce = keepass.incrementedNonce(nonce);
        nonce = nacl.util.decodeBase64(nonce);
        incrementedNonce = nacl.util.decodeBase64(incrementedNonce);
        assert.equal(nonce[0] + 1, incrementedNonce[0]);
    });

    it('Test encryption and decryption', function() {
        var keepass = rewire(BG_URL + 'keepass.js');
        var nacl = rewire(BG_URL + 'nacl.min.js');
        nacl.util = rewire(BG_URL + 'nacl-util.min.js');

        var serverPublicKey = nacl.util.decodeBase64('EhpnWP2r3LVllNv3wzASjdEZnJD6ICMkhedegxT2BX8=');
        var serverSecretKey = nacl.util.decodeBase64('ZhpIDkRYkhz6oujjkBY5HfRJtYAfj7ln/bYqLagUyvg=');
        var nonce = keepass.getNonce();
        var clientMessage = '{message: \'a test message\'}';
        var serverMessage = '{message: \'a test response\', success: \'true\'}';

        keepass.generateNewKeyPair();   // Client keypair
        keepass.serverPublicKey = serverPublicKey;

        // Client sends this
        const encryptedClient = keepass.encrypt(clientMessage, nonce);
        console.log('Encrypted client message: ' + encryptedClient);

        // Simulate a situation where server receives the message and decrypts it
        const decryptedServer = nacl.box.open(nacl.util.decodeBase64(encryptedClient), nacl.util.decodeBase64(nonce), keepass.keyPair.publicKey, serverSecretKey);
        var decryptedMessage = JSON.parse(nacl.util.encodeUTF8(decryptedServer));
        console.log('Decrypted client reply: ' + decryptedMessage);
        assert.equal(decryptedMessage, clientMessage);

        // Simulates what server does when responding
        keepass.associated.hash = 'test';
        keepass.databaseHash = 'test';
        var incrementedNonce = keepass.incrementedNonce(nonce);
        const encryptedServer = nacl.box(nacl.util.decodeUTF8(serverMessage), nacl.util.decodeBase64(incrementedNonce), keepass.keyPair.publicKey, serverSecretKey);
        console.log('Encrypted server message: ' + nacl.util.encodeBase64(encryptedServer));

        // Client decrypts the response
        const serverReply = keepass.decrypt(nacl.util.encodeBase64(encryptedServer), incrementedNonce);
        const message = nacl.util.encodeUTF8(serverReply);
        console.log('Decrypted server reply: ' + message);
        assert.equal(message, serverMessage);
    });
});
