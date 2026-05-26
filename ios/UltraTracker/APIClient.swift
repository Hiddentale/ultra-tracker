import Foundation
import CoreLocation

enum APIError: LocalizedError {
    case unauthorized
    case notFound
    case server(Int)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Invalid admin password"
        case .notFound: return "Race not found"
        case .server(let code): return "Server error (\(code))"
        case .badResponse: return "Unexpected response"
        }
    }
}

struct APIClient {
    static func fetchRaces() async throws -> [Race] {
        let url = URL(string: "\(WORKER_URL)/api/races")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.badResponse
        }
        return try JSONDecoder().decode(RacesResponse.self, from: data).races
    }

    static func fetchToken(raceId: String) async throws -> String {
        let url = URL(string: "\(WORKER_URL)/api/race/\(raceId)")!
        var req = URLRequest(url: url)
        req.setValue("Bearer \(ADMIN_PASSWORD)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        switch http.statusCode {
        case 200: break
        case 401: throw APIError.unauthorized
        case 404: throw APIError.notFound
        default: throw APIError.server(http.statusCode)
        }
        return try JSONDecoder().decode(TokenResponse.self, from: data).token
    }

    static func postLocation(raceId: String, token: String, location: CLLocation) async throws {
        let url = URL(string: "\(WORKER_URL)/api/race/\(raceId)/location")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let formatter = ISO8601DateFormatter()
        let body: [String: Any] = [
            "locations": [[
                "geometry": ["coordinates": [
                    location.coordinate.longitude,
                    location.coordinate.latitude,
                ]],
                "properties": [
                    "timestamp": formatter.string(from: location.timestamp),
                    "altitude": location.altitude,
                    "speed": max(location.speed, 0),
                    "horizontal_accuracy": max(location.horizontalAccuracy, 0),
                ],
            ]]
        ]

        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.badResponse
        }
    }
}
