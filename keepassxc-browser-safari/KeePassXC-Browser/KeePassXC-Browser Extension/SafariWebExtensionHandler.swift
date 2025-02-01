/*
 *  Copyright (C) 2023 KeePassXC Team <team@keepassxc.org>
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import SafariServices
import os.log

let SocketFileName = "KeePassXC.BrowserServer"
let webExtensonIdentifier = "com.keepassxc.KeePassXC-Browser-Extension"
let applicationGroupIdentifier = "G2S7P7J672.org.keepassxc.KeePassXC"
var socketFD : Int32 = -1
var socketConnected = false
var maxMessageLength: Int32 = 1024 * 1024;
var fileHandle: FileHandle?

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private var logger = Logger(
        subsystem: Bundle.main.bundleIdentifier!,
        category: String(describing: SafariWebExtensionHandler.self)
    )
    
    var socketPath: String {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: applicationGroupIdentifier)!.appending(component: SocketFileName).path(percentEncoded: false)
    }
 
    func closeSocket() {
        if (socketFD != -1) {
            logger.info("Closing socket")
            close(socketFD)
            socketFD = -1
        }
    }
    
    func connectSocket() -> Bool {
        // Reuse socket
        guard socketFD == -1 else { return true }
        
        guard FileManager.default.fileExists(atPath: socketPath) else {
            logger.error("Socket file does not exist")
            return false
        }
        
        socketFD = socket(AF_UNIX, SOCK_STREAM, 0)
        guard socketFD > 0 else {
            logger.error("Failed to create socket")
            return false
        }
        
        var optval: Int = 1; // Use 1 to enable the option, 0 to disable
        guard setsockopt(socketFD, SOL_SOCKET, SO_REUSEADDR, &optval, socklen_t(MemoryLayout<Int32>.size)) != -1 else {
            logger.error("setsockopt error: \(errno)")
            return false
        }

        guard setsockopt(socketFD, SOL_SOCKET, SO_SNDBUF, &maxMessageLength, socklen_t(MemoryLayout<Int32>.size(ofValue: maxMessageLength))) != -1 else {
            logger.error("setsockopt error")
            return false
        }
        
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        
        withUnsafeMutableBytes(of: &address.sun_path) { ptr in
            socketPath.utf8CString.withUnsafeBytes { bytes in
                ptr.copyBytes(from: bytes)
            }
        }
        
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(socketFD, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        
        if result != 0 {
            logger.error("Failed to connect to socket: \(errno)")
            close(socketFD)
            socketFD = -1
            return false
        }
        
        fileHandle = FileHandle(fileDescriptor: socketFD)
        fileHandle?.readabilityHandler = handleSocketMessage
        
        return true
    }
    
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }
        
        guard let message = message as? [String: Any],
              let data = try? JSONSerialization.data(withJSONObject: message as Any) else {
            return
        }
        
        if (!socketConnected) {
            if (!connectSocket()) {
                closeSocket()
                logger.error("Socket not connected")
                return
            }
            
            socketConnected = true
        }
        
        guard let fileHandle else {
            logger.error("No filehandle available for sending web extension message")
            return
        }
        
        do {
            try fileHandle.write(contentsOf: data)
            logger.debug("Sent message of \(data.count) bytes")
        } catch {
            logger.error("Failed to send message to socket \(error)")
        }
    }
    
    func handleSocketMessage(fileHandle: FileHandle) {
        let data = fileHandle.availableData
        
        guard !data.isEmpty else {
            logger.debug("Data from filehandle is empty")
            return
        }
        
        guard let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            logger.error("Could not parse JSON from data")
            return
        }
        
        SFSafariApplication
            .dispatchMessage(
                withName: "proxy_message",
                toExtensionWithIdentifier: webExtensonIdentifier,
                userInfo: message
            ) { error in
            if let error {
                self.logger.error("Failed to send message to web extension \(error)")
            } else {
                self.logger.error("Sent message of \(data.count) bytes to web extension")
            }
        }
    }
}
