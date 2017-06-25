:: Copyright 2014 The Chromium Authors. All rights reserved.
:: Copyright 2017 Sami Vänttinen <sami.vanttinen@protonmail.com>
:: Use of this source code is governed by a BSD-style license that can be
:: found in the LICENSE file.
:: Change HKCU to HKLM if you want to install globally.
:: %~dp0 is the directory containing this bat script and ends with a backslash.
@echo off
echo.
echo Select your browser:
echo ====================
echo 1) Chrome
echo 2) Chromium
echo 3) Firefox
echo 4) Vivaldi
set choice=
set /p choice=1-4: 
if '%choice%'=='1' goto chrome
if '%choice%'=='2' goto chromium
if '%choice%'=='3' goto firefox
if '%choice%'=='3' goto vivaldi
goto end
:chrome
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.varjolintu.keepassxc_browser" /ve /t REG_SZ /d "%~dp0com.varjolintu.keepassxc-browser-chrome.win.json" /f
goto end
:chromium
REG ADD "HKCU\Software\Chromium\NativeMessagingHosts\com.varjolintu.keepassxc_browser" /ve /t REG_SZ /d "%~dp0com.varjolintu.keepassxc-browser-chrome.win.json" /f
goto end
:firefox
REG ADD "HKCU\Software\Mozilla\NativeMessagingHosts\com.varjolintu.keepassxc_browser" /ve /t REG_SZ /d "%~dp0com.varjolintu.keepassxc-browser-firefox.win.json" /f
goto end
:vivaldi
REG ADD "HKCU\Software\Vivaldi\NativeMessagingHosts\com.varjolintu.keepassxc_browser" /ve /t REG_SZ /d "%~dp0com.varjolintu.keepassxc-browser-chrome.win.json" /f
goto end
:end