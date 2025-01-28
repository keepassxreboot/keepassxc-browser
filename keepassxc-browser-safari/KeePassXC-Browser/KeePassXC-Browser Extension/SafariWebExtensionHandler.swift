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

let SocketFileName = "org.keepassxc.KeePassXC.BrowserServer"
var socketFD : Int32 = -1
var socketConnected = false
var maxMessageLength: Int32 = 1024 * 1024;
let backgroundQueue = DispatchQueue(label: "\(Bundle.main.bundleIdentifier!).readSocketQueue", qos: .background)

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private var logger = Logger(
        subsystem: Bundle.main.bundleIdentifier!,
        category: String(describing: SafariWebExtensionHandler.self)
    )
    
    var socketPath: String {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "org.keepassxc.KeePassXC")!.appending(component: SocketFileName).path(percentEncoded: false)
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
        
        return true
    }
    
    func beginRequest(with context: NSExtensionContext) {
        guard let serializedRequest = parseRequest(with: context) else {
            logger.error("Failed to parse request")
            context.cancelRequest(withError: NSError())
            return
        }
        
        if (!socketConnected) {
            if (!connectSocket()) {
                closeSocket()
                logger.error("Socket not connected")
                return
            }
            
            socketConnected = true
            startSocketListener()
        }

        // Send message
        let bytesWritten = serializedRequest.withUnsafeBytes {
            write(socketFD, $0.baseAddress!, $0.count)
        }

        
        if bytesWritten <= 0 {
            logger.error("Cannot write to socket \(errno)")
        } else {
            logger.debug("Written \(bytesWritten) bytes")
        }
        
        logger.debug("Written \(bytesWritten) bytes")
        
        context.completeRequest(returningItems: [])
    }
    
    func parseRequest(with context: NSExtensionContext) -> Data? {
        guard let item = context.inputItems.first as? NSExtensionItem else {
            logger.error("Invalid amount of arguments for NSExtensionItem")
            return nil
        }

        guard let serializedRequest = try? JSONSerialization.data(withJSONObject: item.userInfo?[SFExtensionMessageKey] as Any) else {
            logger.error("JSON serialization error")
            return nil
        }
        
        return serializedRequest
    }
    
    func startSocketListener() {
        backgroundQueue.async {
            while socketConnected {
                var buffer = [UInt8](repeating: 0, count: Int(maxMessageLength))
                let bytesRead = read(socketFD, &buffer, buffer.count)

                if bytesRead > 0 {
                    let data = Data(buffer[0..<bytesRead])
                    self.logger.debug("Received message: \(data)")
                    
                    guard let jsonDict = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
                        self.logger.error("Failed to decode message")
                        return
                    }
                    
                    SFSafariApplication.dispatchMessage(withName: "proxy_message", toExtensionWithIdentifier: "com.keepassxc.KeePassXC-Browser-Extension", userInfo: jsonDict)
                } else {
                    self.logger.debug("No message received or connection closed")
                }
            }
        }
    }
}
