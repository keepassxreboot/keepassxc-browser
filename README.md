# keepassxc-browser
Chrome extension for [KeePassXC](https://keepassxc.org/) with Native Messaging.

This is a heavily forked version of [pfn](https://github.com/pfn)'s [chromeIPass](https://github.com/pfn/passifox).
Some changes merged also from [smorks'](https://github.com/smorks/keepasshttp-connector) KeePassHttp-Connector fork.
For testing purposes, please use following unofficial KeePassXC [release's](https://github.com/varjolintu/keepassxc/releases).

Get the extension for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/keepassxc-browser/) or [Chrome/Chromium](https://chrome.google.com/webstore/detail/keepassxc-browser/iopaggbpplllidnfmcghoonnokmjoicf).

The extension is supported with Firefox 55 and newer. If you want to load it as a temporary plugin with Firefox 54 you can just change the minimum version from the manifest file before loading it.

Please thee this [wiki page](hhttps://github.com/varjolintu/keepassxc-browser/wiki/Connecting-the-database-with-keepassxc-browser) for instructions how to configure this KeePassXC fork in order to connect the database correctly.

## How it works
There are two methods which you can use keepassxc-browser to connect to KeePassXC:

1. keepassxc-browser communicates directly with KeePassXC via stdin/stdout. This method launches KeePassXC every time you start the browser and closes when you exit.
This can cause unsaved changes not to be saved. If you use this method it's important to enable `Automatically save after every change` from KeePassXC's preferences.

2. keepassxc-browser communicated with KeePassXC through [keepassxc-proxy](https://github.com/varjolintu/keepassxc-proxy) or [keepassxc-proxy-rust](https://github.com/varjolintu/keepassxc-proxy-rust). The proxy handles listening stdin/stdout
and transfers these messages through Unix domain sockets / named pipes to KeePassXC. This means KeePassXC can be used and started normally without inteference from
Native Messaging API. keepassxc-browser starts only the proxy application and there's no risk of shutting down KeePassXC or losing any unsaved changes. keepassxc-proxy
is still under development. If you want, you are free to write your own proxy that handles the traffic.

## Improvements
The following improvements and features have been made after the fork. At this point some features are only available with the KeePassXC fork:
- Real-time detection of database status (locked/unlocked)
- Credentials on a page are cleared or received automatically again if database is locked or changed to another
- It is possible to lock the active database from the popup (using the red lock icon)
- Input forms are detected even if the login div has been hidden or is created after the page was loaded
- It is possible to use the active database from multiple browsers at the same time with [keepassxc-proxy](https://github.com/varjolintu/keepassxc-proxy) application.
- Deprecated JavaScript functions are removed and everything is asynchronous
- Updated Bootstrap to version 3.3.7 and jQuery to version 3.2.1
- New buttons, icons and settings page graphics
- Redesigned password generator dialog
- Password generator supports diceware passphrases and extended ASCII characters

## Protocol

The details about the messaging protocol used with the browser extension and KeePassXC can be found [here](keepassxc-protocol.md).

## Licenses

```
keepassxc-browser Copyright (C) 2017 Sami Vänttinen
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

## Donations

Feel free to support this project:
- Donate via [PayPal](https://paypal.me/varjolintu)
- Donate via Bitcoin: 1LHbD69CcmpLW5hjUXs2MGJhw3GxwqLdw3

Also consider donating to [KeePassXC](https://flattr.com/submit/auto?fid=x7yqz0&url=https%3A%2F%2Fkeepassxc.org) and passifox teams [(1)](https://github.com/smorks/passifox),[(2)](https://github.com/projectgus/passifox),[(3)](https://github.com/pfn/passifox). They are doing great job.
