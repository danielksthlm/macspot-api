// swift-tools-version: 6.1
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "contact_sync",
    platforms: [
        .macOS(.v12)
    ],
    dependencies: [
        .package(url: "https://github.com/codewinsdotcom/PostgresClientKit", from: "1.3.0")
    ],
    targets: [
        .executableTarget(
            name: "contact_sync",
            dependencies: [
                .product(name: "PostgresClientKit", package: "PostgresClientKit")
            ]
        )
    ]
)
