#!/usr/bin/env bash

# The MIT License (MIT)
# Copyright (c) 2016 Danny van Kooten
# Modifications (c) 2017 Sami Vänttinen

# Permission is hereby granted, free of charge, to any person obtaining a copy of this software 
# and associated documentation files (the "Software"), to deal in the Software without restriction, 
# including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
# and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, 
# subject to the following conditions:
# The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT 
# LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN 
# NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, 
# WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE 
# SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

set -e

DIR="$( cd "$( dirname "$0" )" && pwd )"
APP_NAME="com.varjolintu.keepassxc-browser"
HOST_FILE="$DIR"
KEEPASSXC_PATH=""

# Find target dirs for various browsers & OS'es
# https://developer.chrome.com/extensions/nativeMessaging#native-messaging-host-location
# https://wiki.mozilla.org/WebExtensions/Native_Messaging
if [ $(uname -s) == 'Darwin' ]; then
  if [ "$(whoami)" == "root" ]; then
    TARGET_DIR_CHROME="/Library/Google/Chrome/NativeMessagingHosts"
    TARGET_DIR_CHROMIUM="/Library/Application Support/Chromium/NativeMessagingHosts"
    TARGET_DIR_FIREFOX="/Library/Application Support/Mozilla/NativeMessagingHosts"
    TARGET_DIR_VIVALDI="/Library/Application Support/Vivaldi/NativeMessagingHosts"
  else
    TARGET_DIR_CHROME="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    TARGET_DIR_CHROMIUM="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    TARGET_DIR_FIREFOX="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
    TARGET_DIR_VIVALDI="$HOME/Library/Application Support/Vivaldi/NativeMessagingHosts"
  fi
else
  if [ "$(whoami)" == "root" ]; then
    TARGET_DIR_CHROME="/etc/opt/chrome/native-messaging-hosts"
    TARGET_DIR_CHROMIUM="/etc/chromium/native-messaging-hosts"
    TARGET_DIR_FIREFOX="/usr/lib/mozilla/native-messaging-hosts"
    TARGET_DIR_VIVALDI="/etc/chromium/native-messaging-hosts"
  else
    TARGET_DIR_CHROME="$HOME/.config/google-chrome/NativeMessagingHosts"
    TARGET_DIR_CHROMIUM="$HOME/.config/chromium/NativeMessagingHosts"
    TARGET_DIR_FIREFOX="$HOME/.mozilla/native-messaging-hosts"
    TARGET_DIR_VIVALDI="$HOME/.config/vivaldi/NativeMessagingHosts"
  fi
fi

if [ -e "$DIR/keepassxc-browser" ]; then
  echo "Detected development binary"
  HOST_FILE="$DIR/keepassxc-browser"
fi

echo ""
echo "Select your browser:"
echo "===================="
echo "1) Chrome"
echo "2) Chromium"
echo "3) Firefox"
echo "4) Vivaldi"
echo -n "1-4: "
read BROWSER
echo ""

# Set target dir from user input
if [[ "$BROWSER" == "1" ]]; then
  BROWSER_NAME="Chrome"
  TARGET_DIR="$TARGET_DIR_CHROME"
fi

if [[ "$BROWSER" == "2" ]]; then
  BROWSER_NAME="Chromium"
  TARGET_DIR="$TARGET_DIR_CHROMIUM"
fi

if [[ "$BROWSER" == "3" ]]; then
  BROWSER_NAME="Firefox"
  TARGET_DIR="$TARGET_DIR_FIREFOX"
fi

if [[ "$BROWSER" == "4" ]]; then
  BROWSER_NAME="Vivaldi"
  TARGET_DIR="$TARGET_DIR_VIVALDI"
fi

# Try to find the KeePassXC binary.
if [ $(uname -s) == 'Darwin' ]; then
  KEEPASSXC_PATH="/Applications/KeePassXC.app"
else
  KEEPASSXC_PATH="$(command -v keepassxc)"
  if [ -z "$KEEPASSXC_PATH" ] ; then
    echo ""
    echo -n "KeePassXC binary not found. Give the location of KeePassXC binary: "
    read KEEPASSXC_PATH
    echo ""
  fi
fi
echo "KeePassXC binary location set to $KEEPASSXC_PATH"
echo "Installing $BROWSER_NAME host config with path $KEEPASSXC_PATH"
echo "Press (ENTER) or give a new path to binary if it's not correct: "
read NEW_PATH

if [ "$NEW_PATH" ]; then
  KEEPASSXC_PATH="$NEW_PATH"
  echo "New path set to: $KEEPASSXC_PATH"
fi

# Add /Contents/MacOS/KeePassXC to darwin for exact binary path
if [ $(uname -s) == 'Darwin' ]; then
  KEEPASSXC_PATH="$KEEPASSXC_PATH/Contents/MacOS/KeePassXC"
fi

ESCAPED_PATH=${KEEPASSXC_PATH////\\/}

# Create config dir if not existing
mkdir -p "$TARGET_DIR"

# Copy manifest host config file
if [ "$BROWSER" == "1" ] || [ "$BROWSER" == "2" ] || [ "$BROWSER" == "4" ]; then
  cp "$DIR/com.varjolintu.keepassxc-browser-chrome.json" "$TARGET_DIR/$APP_NAME.json"
else
  cp "$DIR/com.varjolintu.keepassxc-browser-firefox.json" "$TARGET_DIR//$APP_NAME.json"
fi

# Replace path to host
if [ $(uname -s) == 'Darwin' ]; then
  sed -i "" -e "s/%%replace%%/$ESCAPED_PATH/g" "$TARGET_DIR/$APP_NAME.json"
else
  sed -i -e "s/%%replace%%/$ESCAPED_PATH/g" "$TARGET_DIR/$APP_NAME.json"
fi

# Set permissions for the manifest so that all users can read it.
chmod o+r "$TARGET_DIR/$APP_NAME.json"

echo "Native messaging host for $BROWSER_NAME has been installed to $TARGET_DIR."