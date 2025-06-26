import Foundation
import Contacts
import PostgresClientKit

// 🔄 Ladda .env
let defaultEnvPath = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/.env"
let envPath = ProcessInfo.processInfo.environment["ENV_PATH"] ?? defaultEnvPath
let envURL = URL(fileURLWithPath: envPath)
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

  var keysToFetch: [CNKeyDescriptor] = [
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
  // Lägg till bild-data för Base64
  keysToFetch.append(CNContactImageDataKey as CNKeyDescriptor)
  let store = CNContactStore()
  let request = CNContactFetchRequest(keysToFetch: keysToFetch)
  var skippedDueToError = 0

  // 🧹 Cleanup: Mark incoming pending_changes as processed if already handled as outgoing
  let cleanupStmt = try connection.prepareStatement(text: """
  UPDATE pending_changes
  SET processed = true
  WHERE direction = 'in'
    AND record_id IN (
        SELECT record_id FROM pending_changes WHERE direction = 'out' AND processed = true
    )
  """)
  defer { cleanupStmt.close() }
  try cleanupStmt.execute()

  // 🧹 Dedupe: Remove duplicate pending_changes for contact (keep latest per apple_id)
  let dedupeStmt = try connection.prepareStatement(text: """
    DELETE FROM pending_changes pc
    WHERE id NOT IN (
      SELECT MAX(id::text)::uuid
      FROM pending_changes
      WHERE table_name = 'contact' AND direction = 'out' AND NOT processed
      GROUP BY (payload->'metadata'->>'apple_id')
    )
    AND table_name = 'contact' AND direction = 'out' AND NOT processed
  """)
  try dedupeStmt.execute()
  dedupeStmt.close()
  try store.enumerateContacts(with: request, usingBlock: { (contact: CNContact, stop: UnsafeMutablePointer<ObjCBool>) in
    guard !contact.emailAddresses.isEmpty else {
        print("⚠️ Kontakt utan e-postadress – hoppar över: \(contact.givenName) \(contact.familyName)")
        return
    }
    for emailValue in contact.emailAddresses {
        let email = (emailValue.value as String).lowercased()
        do {
          let firstName = contact.givenName
          let lastName = contact.familyName
          _ = contact.organizationName
          _ = contact.phoneNumbers.first?.value.stringValue ?? ""

          print("📱 macOS-kontakt: \(firstName) \(lastName) — \(email)")

          let stmt = try connection.prepareStatement(text: """
              SELECT id, metadata FROM contact
              WHERE metadata->>'apple_id' = $1
                 OR EXISTS (
                   SELECT 1 FROM ccrelation
                   WHERE ccrelation.contact_id = contact.id
                     AND ccrelation.metadata->>'email' = $2
                 )
              """)
          let result = try stmt.execute(parameterValues: [contact.identifier, email])
          var rows: [PostgresClientKit.Row] = []
          while case let .success(row) = result.next() {
              rows.append(row)
          }
          stmt.close()
          var found = false
          for row in rows {
              let columns = row.columns
              let recordId = try UUID(uuidString: columns[0].string()) ?? UUID()
              let metadataValue = columns[1]
              let metadataString = try metadataValue.string()
              print("🗄️ DB-data:", metadataString)
              
              if let data = metadataString.data(using: .utf8) {
                  found = true
                  let json = try JSONSerialization.jsonObject(with: data, options: [])
                  
                  if let existing = json as? [String: Any],
                     let existingMeta = existing["metadata"] as? [String: Any],
                     let existingOrigin = existingMeta["origin"] as? String {

                      let existingAppleId = existingMeta["apple_id"] as? String ?? ""

                      if existingAppleId == contact.identifier && existingOrigin != "klrab.se" {
                          print("♻️ Override från Apple – uppdaterar kontakt: \(email)")

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
                              "email": ($0.value as String).lowercased()
                          ]}

                          let urls = contact.urlAddresses.map { [
                              "label": $0.label ?? "",
                              "url": $0.value as String
                          ]}

                          let social = contact.socialProfiles.map { [
                              "label": $0.label ?? "",
                              "service": $0.value.service,
                              "url": $0.value.urlString
                          ]}

                          // Kontrollera om kontakt redan är identisk i tabellen innan pending_change.
                          let checkContactStmt = try connection.prepareStatement(
                              text: """
                              SELECT metadata FROM contact WHERE metadata->>'apple_id' = $1
                              """
                          )
                          let contactResult = try checkContactStmt.execute(parameterValues: [contact.identifier])
                          var skipInsert = false
                          let cleanMetadata: [String: Any] = [
                              "origin": "klrab.se",
                              "apple_id": contact.identifier,
                              "apple_uid": contact.identifier
                          ]
                          var safeMetadata = cleanMetadata
                          safeMetadata.removeValue(forKey: "metadata")
                          // Bild till Base64 om finns
                          if contact.imageDataAvailable, let imageData = contact.imageData {
                              safeMetadata["image_base64"] = imageData.base64EncodedString()
                          }
                          let jsonPayload: [String: Any] = [
                              "apple_id": contact.identifier,
                              "apple_uid": contact.identifier,
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
                              "social_profiles": social,
                              "metadata": safeMetadata
                          ]
                          // --- Begin: sorted JSON comparison ---
                          let sortedPayloadData = try JSONSerialization.data(withJSONObject: jsonPayload, options: [.sortedKeys])
                          let sortedPayloadStr = String(data: sortedPayloadData, encoding: .utf8)

                          if case let .success(row) = contactResult.next() {
                              let metadataString = try row.columns[0].string()
                              var sortedDbPayloadStr: String? = nil
                              if let dbData = metadataString.data(using: .utf8),
                                 let dbJson = try? JSONSerialization.jsonObject(with: dbData),
                                 let dbSorted = try? JSONSerialization.data(withJSONObject: dbJson, options: [.sortedKeys]) {
                                  sortedDbPayloadStr = String(data: dbSorted, encoding: .utf8)
                              }
                          if sortedDbPayloadStr == sortedPayloadStr {
                              print("🧼 Kontakt redan identisk (sorterad JSON) – hoppar över: \(email)")
                              skipInsert = true
                              return
                          }
                          }
                          checkContactStmt.close()

                          let data = try JSONSerialization.data(withJSONObject: jsonPayload, options: [])

                          let updatePayload = String(data: data, encoding: .utf8) ?? "{}"

                          // Kontroll: Finns redan identisk pending_change för samma email+apple_id?
                          let checkPendingStmt = try connection.prepareStatement(
                              text: """
                              SELECT id, payload FROM pending_changes
                              WHERE table_name = 'contact'
                                AND direction = 'out'
                                AND processed = false
                                AND (payload->>'email') = $1
                                AND (payload->'metadata'->>'apple_id') = $2
                              """
                          )
                          let checkPendingResult = try checkPendingStmt.execute(parameterValues: [email, contact.identifier])
                          while case let .success(row) = checkPendingResult.next() {
                              let payloadStr = try row.columns[1].string()
                              if let data = payloadStr.data(using: .utf8),
                                 let oldPayload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                                 NSDictionary(dictionary: oldPayload).isEqual(to: jsonPayload) {
                                  print("🧼 Kontakt redan identisk i pending_changes – hoppar över: \(email)")
                                  skipInsert = true
                                  break
                              }
                          }
                          checkPendingResult.close()
                          checkPendingStmt.close()
                          // Kontrollera att ingen duplikat-pending_change skapas för samma email + apple_id
                          if !skipInsert {
                              let dupeCheckStmt = try connection.prepareStatement(
                                  text: """
                                  SELECT count(*) FROM pending_changes
                                  WHERE table_name = 'contact'
                                    AND direction = 'out'
                                    AND processed = false
                                    AND (payload->>'email') = $1
                                    AND (payload->'metadata'->>'apple_id') = $2
                                  """
                              )
                              let dupeResult = try dupeCheckStmt.execute(parameterValues: [email, contact.identifier])
                              var isDupe = false
                              if case let .success(dupeRow) = dupeResult.next() {
                                  let count = try dupeRow.columns[0].int()
                                  if count > 0 {
                                      print("🧼 Duplikat pending_change finns redan för \(email) + \(contact.identifier) – hoppar över.")
                                      isDupe = true
                                  }
                              }
                              dupeResult.close()
                              dupeCheckStmt.close()
                              if !isDupe {
                                  // Kontroll: Finns andra kontakter med samma e-post men annan apple_id → hoppa över
                                  let emailDupeCheckStmt = try connection.prepareStatement(text: """
                                  SELECT COUNT(*) FROM ccrelation
                                  WHERE metadata->>'email' = $1 AND contact_id IS NOT NULL
                                  """)
                                  let emailDupeResult = try emailDupeCheckStmt.execute(parameterValues: [email])
                                  if case let .success(row) = emailDupeResult.next() {
                                      let count = try row.columns[0].int()
                                      if count > 0 {
                                          print("🛑 Dubblettkontakt hittad med samma e-post – hoppar över pending_change: \(email)")
                                          emailDupeResult.close()
                                          emailDupeCheckStmt.close()
                                          continue
                                      }
                                  }
                                  emailDupeResult.close()
                                  emailDupeCheckStmt.close()
                                  let updateStmt = try connection.prepareStatement(
                                      text: """
                                      INSERT INTO pending_changes (table_name, operation, payload, record_id, created_at, change_type, direction)
                                      VALUES ($1, $2, $3::jsonb, $4::uuid, NOW(), $5, $6)
                                      """
                                  )
                                  defer { updateStmt.close() }
                                  try updateStmt.execute(parameterValues: ["contact", "UPDATE", updatePayload, recordId.uuidString, "metadata_changed", "out"])
                                  print("🕓 Skapade pending_changes för \(email)")
                              }
                          }
                      } else if existingOrigin == "klrab.se" {
                          print("🚫 Skyddad kontakt (klrab.se) – ingen uppdatering: \(email)")
                      }
                  }
              }
          }
          // ✅ Stänger resultatet efter iteration – undviker cursorClosed
          result.close()
          if !found {
              print("❓ Ingen match i databasen för: \(email)")
              let recordId = UUID()
              let appleId = contact.identifier

              let checkStmt = try connection.prepareStatement(text: """
SELECT id, metadata FROM contact
WHERE metadata->>'apple_id' = $1 OR metadata->>'apple_uid' = $1
""")
              let checkResult = try checkStmt.execute(parameterValues: [appleId])
              var checkRows: [PostgresClientKit.Row] = []
              while case let .success(row) = checkResult.next() {
                  checkRows.append(row)
              }
              checkStmt.close()
              // Extra villkor: hoppa över om någon har origin = klrab.se
              let skipDueToProtectedOrigin = try checkRows.contains { row in
                  let metadataString = try row.columns[1].string()
                  if let data = metadataString.data(using: .utf8),
                     let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                     let meta = json["metadata"] as? [String: Any],
                     let origin = meta["origin"] as? String,
                     origin == "klrab.se" {
                      return true
                  }
                  return false
              }
              if skipDueToProtectedOrigin {
                  print("🚫 Skyddad kontakt (klrab.se) – skippar INSERT: \(email)")
                  continue
              }
              let foundExisting = !checkRows.isEmpty
              if foundExisting {
                  print("⚠️ Kontakt med samma apple_id/apple_uid redan finns – hoppar över INSERT")
                  continue
              }

              // Kontroll: hoppa över om kontakt med denna e-post redan finns
              let emailCheckStmt = try connection.prepareStatement(text: """
                SELECT COUNT(*) FROM ccrelation WHERE metadata->>'email' = $1
              """)
              let emailCheckResult = try emailCheckStmt.execute(parameterValues: [email])
              if case let .success(row) = emailCheckResult.next() {
                let count = try row.columns[0].int()
                if count > 0 {
                  print("🧼 Kontakt med e-post redan finns i DB – hoppar över: \(email)")
                  emailCheckStmt.close()
                  continue
                }
              }
              emailCheckStmt.close()

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
                  "email": ($0.value as String).lowercased()
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

              let cleanMetadata: [String: Any] = [
                  "origin": "macos",
                  "apple_id": appleId,
                  "apple_uid": appleId
              ]
              var safeMetadata = cleanMetadata
              safeMetadata.removeValue(forKey: "metadata")
              // Bild till Base64 om finns
              if contact.imageDataAvailable, let imageData = contact.imageData {
                  safeMetadata["image_base64"] = imageData.base64EncodedString()
              }
              let jsonPayload: [String: Any] = [
                  "apple_id": appleId,
                  "apple_uid": appleId,
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
                  "metadata": safeMetadata
              ]

              let data = try JSONSerialization.data(withJSONObject: jsonPayload, options: [])
              let json = String(data: data, encoding: .utf8) ?? "{}"

              // Kontroll: Finns redan identisk pending_change för samma email+apple_id?
              let checkPendingStmt = try connection.prepareStatement(
                  text: """
                  SELECT id, payload FROM pending_changes
                  WHERE table_name = 'contact'
                    AND direction = 'out'
                    AND processed = false
                    AND (payload->>'email') = $1
                    AND (payload->'metadata'->>'apple_id') = $2
                  """
              )
              let checkPendingResult = try checkPendingStmt.execute(parameterValues: [email, appleId])
              var skipInsert = false
              // --- Begin: sorted JSON comparison ---
              let sortedPayloadData = try JSONSerialization.data(withJSONObject: jsonPayload, options: [.sortedKeys])
              let sortedPayloadStr = String(data: sortedPayloadData, encoding: .utf8)
              while case let .success(row) = checkPendingResult.next() {
                  let payloadStr = try row.columns[1].string()
                  var sortedDbPayloadStr: String? = nil
                  if let dbData = payloadStr.data(using: .utf8),
                     let dbJson = try? JSONSerialization.jsonObject(with: dbData),
                     let dbSorted = try? JSONSerialization.data(withJSONObject: dbJson, options: [.sortedKeys]) {
                      sortedDbPayloadStr = String(data: dbSorted, encoding: .utf8)
                  }
                  if sortedDbPayloadStr == sortedPayloadStr {
                      print("🧼 Kontakt redan identisk (sorterad JSON) – hoppar över: \(email)")
                      skipInsert = true
                      break
                  }
              }
              checkPendingResult.close()
              checkPendingStmt.close()
              // Kontrollera att vi inte redan har identisk kontakt i tabellen
              if !skipInsert {
                  let checkContactStmt = try connection.prepareStatement(
                      text: """
                      SELECT metadata FROM contact WHERE metadata->>'apple_id' = $1
                      """
                  )
                  let contactResult = try checkContactStmt.execute(parameterValues: [appleId])
                  if case let .success(row) = contactResult.next() {
                      let metadataString = try row.columns[0].string()
                      var sortedDbPayloadStr: String? = nil
                      if let dbData = metadataString.data(using: .utf8),
                         let dbJson = try? JSONSerialization.jsonObject(with: dbData),
                         let dbSorted = try? JSONSerialization.data(withJSONObject: dbJson, options: [.sortedKeys]) {
                          sortedDbPayloadStr = String(data: dbSorted, encoding: .utf8)
                      }
                  if sortedDbPayloadStr == sortedPayloadStr {
                      print("🧼 Kontakt redan identisk (sorterad JSON) – hoppar över: \(email)")
                      skipInsert = true
                      return
                  }
                  }
                  checkContactStmt.close()
              }
              if !skipInsert {
                  // Kontrollera att ingen duplikat-pending_change skapas för samma email + apple_id
                  let dupeCheckStmt = try connection.prepareStatement(
                      text: """
                      SELECT count(*) FROM pending_changes
                      WHERE table_name = 'contact'
                        AND direction = 'out'
                        AND processed = false
                        AND (payload->>'email') = $1
                        AND (payload->'metadata'->>'apple_id') = $2
                      """
                  )
                  let dupeResult = try dupeCheckStmt.execute(parameterValues: [email, appleId])
                  var isDupe = false
                  if case let .success(dupeRow) = dupeResult.next() {
                      let count = try dupeRow.columns[0].int()
                      if count > 0 {
                          print("🧼 Duplikat pending_change finns redan för \(email) + \(appleId) – hoppar över.")
                          isDupe = true
                      }
                  }
                  dupeResult.close()
                  dupeCheckStmt.close()
                  if !isDupe {
                      let insertPendingStmt = try connection.prepareStatement(
                          text: """
                          INSERT INTO pending_changes (table_name, operation, payload, record_id, created_at, change_type, direction)
                          VALUES ($1, $2, $3::jsonb, $4::uuid, NOW(), $5, $6)
                          """
                      )
                      defer { insertPendingStmt.close() }
                      try insertPendingStmt.execute(parameterValues: ["contact", "INSERT", json, recordId.uuidString, "new_contact", "out"])
                      print("🕓 Skapade pending_changes för \(email)")
                  }
              }
          }

          print("—")
        } catch {
          print("❌ Fel i kontaktloop: \(error)")
          skippedDueToError += 1
        }
    }
  })
  print("⚠️ Totalt överhoppade p.g.a. fel: \(skippedDueToError)")

} catch {
  print("💥 Fel vid databaskoppling: \(error)")
}
