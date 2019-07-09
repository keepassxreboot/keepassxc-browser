# KeePassXC-Browser
Browser extension for [KeePassXC](https://keepassxc.org/) with Native Messaging.

Based on [pfn](https://github.com/pfn)'s [chromeIPass](https://github.com/pfn/passifox).
Some changes merged also from [smorks](https://github.com/smorks)' [KeePassHttp-Connector](https://github.com/smorks/keepasshttp-connector).

## Download and use

This browser extension was first supported in KeepassXC 2.3.0 (release end of 2017), in general it is advised to only use the latest available release.

Get the extension for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/keepassxc-browser/) or [Chrome/Chromium](https://chrome.google.com/webstore/detail/keepassxc-browser/oboonakemofpalcgghocfoadofidjkkk).

Please see this [document](https://keepassxc.org/docs/keepassxc-browser-migration/) for instructions how to configure KeePassXC in order to connect the database correctly.

## How it works
There are two methods which you can use KeePassXC-Browser to connect to KeePassXC:

1. KeePassXC-Browser communicates with KeePassXC through keepassxc-proxy. The proxy handles listening to STDIN/STDOUT
and transfers these messages through Unix domain sockets / named pipes to KeePassXC. This means KeePassXC can be used and started normally without inteference from
Native Messaging API. KeePassXC-Browser starts only the proxy application and there's no risk of shutting down KeePassXC or losing any unsaved changes. You don't need to install keepassxc-proxy separately. It is included in the latest KeePassXC fork. Alternatively you can use
[keepassxc-proxy-rust](https://github.com/varjolintu/keepassxc-proxy-rust) as a proxy if you prefer a non-Qt solution. There's also Python and C++ versions available at
[keepassxc-proxy](https://github.com/varjolintu/keepassxc-proxy).

2. KeePassXC-Browser communicates directly with KeePassXC via stdin/stdout. Using native messaging directly is a more secure as it ensures the traffic between KeePassXC and KeePassXC-Browser is direct. This method launches KeePassXC every time you start the browser and closes when you exit.
This can cause unsaved changes not to be saved. If you use this method it's important to enable `Automatically save after every change` from KeePassXC's preferences. Because this option is not preferred as default it's good to test this feature with your OS and ensure KeePassXC asks to confirm any unsaved changes before exit.

## Protocol

The details about the messaging protocol used with the browser extension and KeePassXC can be found [here](keepassxc-protocol.md).

## Translations

Translations are managed on [Transifex](https://www.transifex.com/keepassxc/keepassxc-browser/) which offers a web interface. Please join an existing language team or request a new one if there is none.
