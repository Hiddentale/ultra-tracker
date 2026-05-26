import SwiftUI

struct TrackingView: View {
    let race: Race
    let token: String

    @StateObject private var vm = TrackerViewModel()
    @State private var showStopAlert = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Text(race.name)
                .font(.largeTitle.bold())
                .multilineTextAlignment(.center)
                .padding(.top, 8)
                .padding(.horizontal)

            Spacer()

            if vm.authorizationStatus != .authorizedAlways {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.yellow)
                    Text("Enable 'Always' location in Settings for background tracking.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
            }

            if vm.isTracking {
                statusPanel
            }

            Spacer()

            trackButton
        }
        .navigationBarBackButtonHidden(vm.isTracking)
        .toolbar {
            if !vm.isTracking {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Back") { dismiss() }
                }
            }
        }
        .alert("Stop Tracking?", isPresented: $showStopAlert) {
            Button("Stop", role: .destructive) { vm.stopTracking() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Location updates will stop being sent.")
        }
        .onAppear { vm.requestAuthorization() }
    }

    private var statusPanel: some View {
        VStack(spacing: 14) {
            statusRow(label: "Last Ping", value: vm.lastPingAt.map(formatTime) ?? "—")
            statusRow(label: "Points Sent", value: "\(vm.pointsSent)")
            HStack {
                Text("Accuracy").foregroundStyle(.secondary)
                Spacer()
                if let acc = vm.accuracy {
                    Text(String(format: "%.0f m", acc))
                        .foregroundStyle(accuracyColor(acc))
                        .fontWeight(.semibold)
                } else {
                    Text("—").foregroundStyle(.secondary)
                }
            }
            if let err = vm.errorMessage {
                Text(err).font(.caption).foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 32)
        .padding(.vertical, 16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    private var trackButton: some View {
        Button {
            if vm.isTracking { showStopAlert = true }
            else { vm.startTracking(raceId: race.id, token: token) }
        } label: {
            Text(vm.isTracking ? "Stop" : "Start")
                .font(.system(size: 32, weight: .bold))
                .frame(width: 150, height: 150)
                .background(vm.isTracking ? Color.red : Color.green)
                .foregroundStyle(.white)
                .clipShape(Circle())
        }
        .padding(.bottom, 48)
    }

    private func statusRow(label: String, value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).fontWeight(.medium)
        }
    }

    private func accuracyColor(_ accuracy: Double) -> Color {
        if accuracy < 15 { return .green }
        if accuracy < 40 { return .yellow }
        return .red
    }

    private func formatTime(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f.string(from: date)
    }
}
