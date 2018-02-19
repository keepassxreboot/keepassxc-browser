# keepassxc-browser
Browser extension for [KeePassXC](https://keepassxc.org/) with Native Messaging.

This is a heavily forked version of [pfn](https://github.com/pfn)'s [chromeIPass](https://github.com/pfn/passifox).
Some changes merged also from [smorks'](https://github.com/smorks/keepasshttp-connector) KeePassHttp-Connector fork.

Get the extension for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/keepassxc-browser/) or [Chrome/Chromium](hhttps://chrome.google.com/webstore/detail/keepassxc-browser/oboonakemofpalcgghocfoadofidjkkk).

Please see this [document](https://keepassxc.org/docs/keepassxc-browser-migration/) for instructions how to configure this KeePassXC fork in order to connect the database correctly.

## How it works
There are two methods which you can use keepassxc-browser to connect to KeePassXC:

1. keepassxc-browser communicated with KeePassXC through keepassxc-proxy. The proxy handles listening stdin/stdout
and transfers these messages through Unix domain sockets / named pipes to KeePassXC. This means KeePassXC can be used and started normally without inteference from
Native Messaging API. keepassxc-browser starts only the proxy application and there's no risk of shutting down KeePassXC or losing any unsaved changes. You don't need to install keepassxc-proxy separately. It is included in the latest KeePassXC fork. Alternatively you can use
[keepassxc-proxy-rust](https://github.com/varjolintu/keepassxc-proxy-rust) as a proxy if you prefer a non-Qt solution. There's also Python and C++ versions available at
[keepassxc-proxy](https://github.com/varjolintu/keepassxc-proxy).

2. keepassxc-browser communicates directly with KeePassXC via stdin/stdout. Using native messaging directly is a more secure as it ensures the traffic between KeePassXC and keepassxc-browser is direct. This method launches KeePassXC every time you start the browser and closes when you exit.
This can cause unsaved changes not to be saved. If you use this method it's important to enable `Automatically save after every change` from KeePassXC's preferences. Because this option is not preferred as default it's good to test this feature with your OS and ensure KeePassXC asks to confirm any unsaved changes before exit.

## Improvements
The following improvements and features have been made after the fork. At this point some features are only available with the KeePassXC fork:
- Real-time detection of database status (locked/unlocked)
- Credentials on a page are cleared or received automatically again if database is locked or changed to another
- It is possible to lock the active database from the popup (using the red lock icon)
- Input forms are detected even if the login div has been hidden or is created after the page was loaded
- It is possible to use the active database from multiple browsers at the same time with keepassxc-proxy option
- Deprecated JavaScript functions are removed and everything is asynchronous
- Updated Bootstrap to version 3.3.7 and jQuery to version 3.3.1
- New buttons, icons and settings page graphics
- Redesigned password generator dialog
- Password generator supports diceware passphrases and extended ASCII characters
- Autocomplete works also when only password fields are visible
- Supports TOTP with custom KHP placeholders (`KPH: {TOPT}`)

## Protocol

The details about the messaging protocol used with the browser extension and KeePassXC can be found [here](keepassxc-protocol.md).
