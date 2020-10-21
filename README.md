# KeePassXC-Browser

Browser extension for [KeePassXC](https://keepassxc.org/) with [Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).

Based on [pfn](https://github.com/pfn)'s [chromeIPass](https://github.com/pfn/passifox).
Some changes merged also from [smorks](https://github.com/smorks)' [KeePassHttp-Connector](https://github.com/smorks/keepasshttp-connector).

## Download and use

This browser extension was first supported in KeePassXC 2.3.0 (release end of 2017). In general it is advised to only use the latest available release.

Get the extension for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/keepassxc-browser/) or [Chrome/Chromium](https://chrome.google.com/webstore/detail/keepassxc-browser/oboonakemofpalcgghocfoadofidjkkk) or [Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/pdffhmdngciaglkoonimfcmckehcpafo) (requires KeePassXC 2.5.3 or newer).

Please see this [document](https://keepassxc.org/docs/KeePassXC_GettingStarted.html#_setup_browser_integration) for instructions how to configure KeePassXC in order to connect the database correctly.

## How it works

KeePassXC-Browser communicates with KeePassXC through _keepassxc-proxy_. The proxy handles listening to STDIN/STDOUT
and transfers these messages through Unix domain sockets / named pipes to KeePassXC. This means KeePassXC can be used and started normally without inteference from
Native Messaging API. KeePassXC-Browser starts only the proxy application and there's no risk of shutting down KeePassXC or losing any unsaved changes. You don't need to install keepassxc-proxy separately. It is included in the KeePassXC application package. Alternatively you can use
[keepassxc-proxy-rust](https://github.com/varjolintu/keepassxc-proxy-rust) as a proxy if you prefer a non-Qt solution.

## Requested permissions

KeePassXC-Browser extension requests the following permissions:

| Name  | Reason |
| ----- | ----- |
| `activeTab`               | To get URL of the current tab |
| `contextMenus`            | To show context menu items |
| `clipboardWrite`          | Allows password to be copied from password generator to clipboard |
| `nativeMessaging`         | Allows communication with KeePassXC application |
| `notifications`           | To show browser notifications |
| `storage`                 | For storing extension settings to localStorage |
| `tabs`                    | To request tab URL's and other info |
| `webNavigation`           | To show browser notifications on install or update |
| `webRequest`              | For handling HTTP Basic Auth |
| `webRequestBlocking`      | For handling HTTP Basic Auth |
| `http://*/*`              | To allow using KeePassXC-Browser on all websites |
| `https://*/*`             | To allow using KeePassXC-Browser on all websites |
| `https://api.github.com/` | For checking the latest KeePassXC version from GitHub |

## Protocol

The details about the messaging protocol used with the browser extension and KeePassXC can be found [here](keepassxc-protocol.md).

## Translations

Translations are managed on [Transifex](https://www.transifex.com/keepassxc/keepassxc-browser/) which offers a web interface. Please join an existing language team or request a new one if there is none.

## Development and testing

See [wiki](https://github.com/keepassxreboot/keepassxc-browser/wiki/Loading-the-extension-manually).
