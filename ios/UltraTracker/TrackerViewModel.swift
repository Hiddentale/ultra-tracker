import Foundation
import Combine
import CoreLocation

private let POST_INTERVAL: TimeInterval = 30
private let RETRY_DELAY_NS: UInt64 = 5_000_000_000

@MainActor
final class TrackerViewModel: NSObject, ObservableObject {
    @Published var isTracking = false
    @Published var lastPingAt: Date? = nil
    @Published var pointsSent = 0
    @Published var accuracy: Double? = nil
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var errorMessage: String? = nil

    private let locationManager = CLLocationManager()
    private var timer: Timer?
    private var currentLocation: CLLocation?
    private var raceId = ""
    private var token = ""

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
        authorizationStatus = locationManager.authorizationStatus
    }

    func requestAuthorization() {
        locationManager.requestAlwaysAuthorization()
    }

    func startTracking(raceId: String, token: String) {
        self.raceId = raceId
        self.token = token
        pointsSent = 0
        lastPingAt = nil
        errorMessage = nil
        isTracking = true
        locationManager.startUpdatingLocation()
        startTimer()
    }

    func stopTracking() {
        timer?.invalidate()
        timer = nil
        locationManager.stopUpdatingLocation()
        isTracking = false
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: POST_INTERVAL, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { await self.sendCurrentLocation() }
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    private func sendCurrentLocation() async {
        guard let location = currentLocation else { return }
        do {
            try await APIClient.postLocation(raceId: raceId, token: token, location: location)
            pointsSent += 1
            lastPingAt = Date()
            errorMessage = nil
        } catch {
            // Retry once after 5 seconds
            try? await Task.sleep(nanoseconds: RETRY_DELAY_NS)
            do {
                try await APIClient.postLocation(raceId: raceId, token: token, location: location)
                pointsSent += 1
                lastPingAt = Date()
                errorMessage = nil
            } catch {
                errorMessage = "Last ping failed"
            }
        }
    }
}

extension TrackerViewModel: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in
            self.currentLocation = loc
            self.accuracy = loc.horizontalAccuracy
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            self.authorizationStatus = manager.authorizationStatus
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.errorMessage = "GPS error"
        }
    }
}
