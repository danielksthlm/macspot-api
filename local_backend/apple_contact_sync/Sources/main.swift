import Foundation
import Contacts
import PostgresClientKit

// 🔄 Ladda .env
let envURL = URL(fileURLWithPath: "../.env")
guard let envData = try? String(contentsOf: envURL) else {
  fatalError("Kunde inte läsa .env")
}

var env: [String: String] = [:]
for line in envData.split(separator: "\n") {
  let parts = line.split(separator: "=", maxSplits: 1)
  if parts.count == 2 {
    env[String(parts[0])] = String(parts[1])
  }
}

print("📄 Laddade miljövariabler:")
for (key, value) in env {
    print("  \(key)=\(value)")
}

guard
  let host = env["PGHOST"],
  let portString = env["PGPORT"],
  let db = env["PGDATABASE"],
  let user = env["PGUSER"],
  let password = env["PGPASSWORD"],
  let port = Int(portString)
else {
  fatalError("Saknar någon PG* variabel")
}

// 🔗 Anslut till PostgreSQL
var configuration = PostgresClientKit.ConnectionConfiguration()
configuration.host = host
configuration.port = port
configuration.database = db
configuration.user = user
configuration.credential = .trust
configuration.ssl = false

do {
  let connection = try PostgresClientKit.Connection(configuration: configuration)
  defer { connection.close() }

  let keysToFetch: [CNKeyDescriptor] = [
    CNContactEmailAddressesKey as CNKeyDescriptor,
    CNContactGivenNameKey as CNKeyDescriptor,
    CNContactFamilyNameKey as CNKeyDescriptor,
    CNContactOrganizationNameKey as CNKeyDescriptor,
    CNContactPhoneNumbersKey as CNKeyDescriptor
  ]
  let store = CNContactStore()
  let request = CNContactFetchRequest(keysToFetch: keysToFetch)
  try store.enumerateContacts(with: request) { contact, _ in
    do {
      guard let email = contact.emailAddresses.first?.value as String? else { return }
      let firstName = contact.givenName
      let lastName = contact.familyName
      _ = contact.organizationName
      _ = contact.phoneNumbers.first?.value.stringValue ?? ""

      print("📱 macOS-kontakt: \(firstName) \(lastName) — \(email)")

      let stmt = try connection.prepareStatement(text: "SELECT metadata FROM contact WHERE email = $1")
      defer { stmt.close() }

      let result = try stmt.execute(parameterValues: [email])
      var found = false
      while let row = result.next() {
          let metadataValue = try row.get().columns[0]
          let metadataString = try metadataValue.string()
          print("🗄️ DB-data:", metadataString)
          
          if let data = metadataString.data(using: .utf8) {
              found = true
              let json = try JSONSerialization.jsonObject(with: data, options: [])
              print("🧩 JSON:", json)
          }
      }
      if !found {
          print("❓ Ingen match i databasen för: \(email)")
          let insertPendingStmt = try connection.prepareStatement(
              text: """
              INSERT INTO pending_changes (table_name, action, row_data, created_at)
              VALUES ($1, $2, $3::jsonb, NOW())
              """
          )
          let org = contact.organizationName
          let phone = contact.phoneNumbers.first?.value.stringValue ?? ""
          let json = """
          {
            "email": "\(email)",
            "first_name": "\(firstName)",
            "last_name": "\(lastName)",
            "organization": "\(org)",
            "phone": "\(phone)",
            "metadata": {
              "origin": "macos"
            }
          }
          """
          try insertPendingStmt.execute(parameterValues: ["contact", "insert", json])
          insertPendingStmt.close()
          print("🕓 Skapade pending_changes för \(email)")
      }

      print("—")
    } catch {
      print("❌ Fel i kontaktloop: \(error)")
    }
  }

} catch {
  print("💥 Fel vid databaskoppling: \(error)")
}
