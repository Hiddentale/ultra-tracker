import SwiftUI

struct RaceListView: View {
    @State private var races: [Race] = []
    @State private var isLoading = true
    @State private var loadError: String? = nil
    @State private var isFetchingToken = false
    @State private var tokenError: String? = nil
    @State private var selectedRace: Race? = nil
    @State private var selectedToken: String? = nil
    @State private var navigate = false

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Ultra Tracker")
                .navigationDestination(isPresented: $navigate) {
                    if let race = selectedRace, let token = selectedToken {
                        TrackingView(race: race, token: token)
                    }
                }
                .alert("Error", isPresented: Binding(
                    get: { tokenError != nil },
                    set: { if !$0 { tokenError = nil } }
                )) {
                    Button("OK", role: .cancel) {}
                } message: {
                    Text(tokenError ?? "")
                }
        }
        .task { await loadRaces() }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading {
            ProgressView("Loading races...")
        } else if let error = loadError {
            VStack(spacing: 16) {
                Text(error).foregroundStyle(.red).multilineTextAlignment(.center)
                Button("Retry") { Task { await loadRaces() } }
            }
            .padding()
        } else if races.isEmpty {
            Text("No races found").foregroundStyle(.secondary)
        } else {
            List(races) { race in
                Button { Task { await selectRace(race) } } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(race.name).font(.headline).foregroundStyle(.primary)
                            Text(String(format: "%.1f km", race.total_distance_km))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if isFetchingToken && selectedRace?.id == race.id {
                            ProgressView()
                        }
                    }
                    .padding(.vertical, 4)
                }
                .disabled(isFetchingToken)
            }
        }
    }

    private func loadRaces() async {
        isLoading = true
        loadError = nil
        do {
            races = try await APIClient.fetchRaces()
        } catch {
            loadError = error.localizedDescription
        }
        isLoading = false
    }

    private func selectRace(_ race: Race) async {
        isFetchingToken = true
        selectedRace = race
        do {
            selectedToken = try await APIClient.fetchToken(raceId: race.id)
            navigate = true
        } catch {
            tokenError = error.localizedDescription
            selectedRace = nil
        }
        isFetchingToken = false
    }
}
