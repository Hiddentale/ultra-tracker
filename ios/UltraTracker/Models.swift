import Foundation

struct Race: Identifiable, Decodable {
    let id: String
    let name: String
    let total_distance_km: Double
}

struct RacesResponse: Decodable {
    let races: [Race]
}

struct TokenResponse: Decodable {
    let token: String
}
