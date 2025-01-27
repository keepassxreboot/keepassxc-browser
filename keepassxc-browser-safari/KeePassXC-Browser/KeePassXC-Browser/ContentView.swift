//
//  ContentView.swift
//  KeePassXC-Browser
//
//  Created by Sebastian Livoni on 27/01/2025.
//

import SwiftUI

struct ContentView: View {
    @Binding var isEnabled: Bool
    
    var body: some View {
        VStack {
            Spacer()
            
            if let image = NSImage(named: "AppIcon") {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 128)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            
            Form {
                Section {
                    Toggle("KeePassXC-Browser for Safari", isOn: $isEnabled)
                } footer: {
                    Text("KeePassXC-Browser for Safari is currently \(isEnabled ? "on" : "off").")
                }
            }
            .formStyle(.grouped)
            
            Spacer()
        }
    }
}

#Preview {
    ContentView(isEnabled: .constant(true))
        .frame(width: 400, height: 300)
}
