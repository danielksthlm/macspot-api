import Foundation
import Contacts
import PostgresClientKit

// 🔄 Ladda .env
let envURL = URL(fileURLWithPath: "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/.env")
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
    CNContactIdentifierKey as CNKeyDescriptor,
    CNContactGivenNameKey as CNKeyDescriptor,
    CNContactMiddleNameKey as CNKeyDescriptor,
    CNContactFamilyNameKey as CNKeyDescriptor,
    CNContactOrganizationNameKey as CNKeyDescriptor,
    CNContactJobTitleKey as CNKeyDescriptor,
    CNContactDepartmentNameKey as CNKeyDescriptor,
    CNContactPhoneNumbersKey as CNKeyDescriptor,
    CNContactEmailAddressesKey as CNKeyDescriptor,
    CNContactPostalAddressesKey as CNKeyDescriptor,
    CNContactBirthdayKey as CNKeyDescriptor,
    CNContactNoteKey as CNKeyDescriptor,
    CNContactUrlAddressesKey as CNKeyDescriptor,
    CNContactSocialProfilesKey as CNKeyDescriptor,
    CNContactDatesKey as CNKeyDescriptor,
    CNContactNicknameKey as CNKeyDescriptor
  ]
  let store = CNContactStore()
  let request = CNContactFetchRequest(keysToFetch: keysToFetch)
  try store.enumerateContacts(with: request) { contact, _ in
    guard !contact.emailAddresses.isEmpty else {
        print("⚠️ Kontakt utan e-postadress – hoppar över: \(contact.givenName) \(contact.familyName)")
        return
    }
    for emailValue in contact.emailAddresses {
        let email = emailValue.value as String
        do {
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
                  
                  if let existing = json as? [String: Any],
                     let existingMeta = existing["metadata"] as? [String: Any],
                     let existingOrigin = existingMeta["origin"] as? String {
                      
                      if existingOrigin == "macos" {
                          // Endast uppgradera från "macos" till "klrab.se", inte tvärtom

                          print("♻️ Uppdaterar origin till klrab.se för: \(email)")
                          let recordId = UUID().uuidString

                          let addresses = contact.postalAddresses.map { [
                              "label": $0.label ?? "",
                              "street": $0.value.street,
                              "city": $0.value.city,
                              "state": $0.value.state,
                              "postalCode": $0.value.postalCode,
                              "country": $0.value.country
                          ]}

                          let phones = contact.phoneNumbers.map { [
                              "label": $0.label ?? "",
                              "number": $0.value.stringValue
                          ]}

                          let emails = contact.emailAddresses.map { [
                              "label": $0.label ?? "",
                              "email": $0.value as String
                          ]}

                          let urls = contact.urlAddresses.map { [
                              "label": $0.label ?? "",
                              "url": $0.value as String
                          ]}

                          // let relations = contact.contactRelations.map { [
                          //     "label": $0.label ?? "",
                          //     "name": $0.value.name
                          // ]}

                          let social = contact.socialProfiles.map { [
                              "label": $0.label ?? "",
                              "service": $0.value.service,
                              "url": $0.value.urlString
                          ]}

                          let jsonPayload: [String: Any] = [
                              "apple_id": contact.identifier,
                              "first_name": contact.givenName,
                              "middle_name": contact.middleName,
                              "last_name": contact.familyName,
                              "organization": contact.organizationName,
                              "job_title": contact.jobTitle,
                              "department": contact.departmentName,
                              "note": contact.isKeyAvailable(CNContactNoteKey) ? contact.note : "",
                              "nickname": contact.nickname,
                              "birthday": contact.birthday?.date.map { ISO8601DateFormatter().string(from: $0) } ?? "",
                              "emails": emails,
                              "phones": phones,
                              "addresses": addresses,
                              "urls": urls,
                              // "relations": relations,
                              "social_profiles": social,
                              "metadata": [
                                  "origin": "klrab.se"
                              ]
                          ]

                          let data = try JSONSerialization.data(withJSONObject: jsonPayload, options: [])
                          let updatePayload = String(data: data, encoding: .utf8) ?? "{}"

                          let updateStmt = try connection.prepareStatement(
                              text: """
                              INSERT INTO pending_changes (table_name, operation, payload, record_id, created_at, change_type, direction)
                              VALUES ($1, $2, $3::jsonb, $4::uuid, NOW(), $5, $6)
                              """
                          )
                          try updateStmt.execute(parameterValues: ["contact", "UPDATE", updatePayload, recordId, "metadata_changed", "out"])
                          updateStmt.close()
                      } else if existingOrigin == "klrab.se" {
                          print("🚫 Befintlig kontakt har origin=klrab.se – ignorerar Apple-källa för: \(email)")
                      }
                  }
              }
          }
          if !found {
              print("❓ Ingen match i databasen för: \(email)")
              let recordId = UUID().uuidString

              let addresses = contact.postalAddresses.map { [
                  "label": $0.label ?? "",
                  "street": $0.value.street,
                  "city": $0.value.city,
                  "state": $0.value.state,
                  "postalCode": $0.value.postalCode,
                  "country": $0.value.country
              ]}

              let phones = contact.phoneNumbers.map { [
                  "label": $0.label ?? "",
                  "number": $0.value.stringValue
              ]}

              let emails = contact.emailAddresses.map { [
                  "label": $0.label ?? "",
                  "email": $0.value as String
              ]}

              let urls = contact.urlAddresses.map { [
                  "label": $0.label ?? "",
                  "url": $0.value as String
              ]}

              // let relations = contact.contactRelations.map { [
              //     "label": $0.label ?? "",
              //     "name": $0.value.name
              // ]}

              let social = contact.socialProfiles.map { [
                  "label": $0.label ?? "",
                  "service": $0.value.service,
                  "url": $0.value.urlString
              ]}

              let jsonPayload: [String: Any] = [
                  "apple_id": contact.identifier,
                  "first_name": contact.givenName,
                  "middle_name": contact.middleName,
                  "last_name": contact.familyName,
                  "organization": contact.organizationName,
                  "job_title": contact.jobTitle,
                  "department": contact.departmentName,
                  "note": contact.isKeyAvailable(CNContactNoteKey) ? contact.note : "",
                  "nickname": contact.nickname,
                  "birthday": contact.birthday?.date.map { ISO8601DateFormatter().string(from: $0) } ?? "",
                  "emails": emails,
                  "phones": phones,
                  "addresses": addresses,
                  "urls": urls,
                  // "relations": relations,
                  "social_profiles": social,
                  "metadata": [
                      "origin": "macos"
                  ]
              ]

              let data = try JSONSerialization.data(withJSONObject: jsonPayload, options: [])
              let json = String(data: data, encoding: .utf8) ?? "{}"

              let insertPendingStmt = try connection.prepareStatement(
                  text: """
                  INSERT INTO pending_changes (table_name, operation, payload, record_id, created_at, change_type, direction)
                  VALUES ($1, $2, $3::jsonb, $4::uuid, NOW(), $5, $6)
                  """
              )
              try insertPendingStmt.execute(parameterValues: ["contact", "INSERT", json, recordId, "new_contact", "out"])
              insertPendingStmt.close()
              print("🕓 Skapade pending_changes för \(email)")
          }

          print("—")
        } catch {
          print("❌ Fel i kontaktloop: \(error)")
        }
    }
  }

} catch {
  print("💥 Fel vid databaskoppling: \(error)")
}
