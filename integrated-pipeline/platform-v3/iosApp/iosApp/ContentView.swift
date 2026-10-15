import SwiftUI
import ComposeApp

struct ContentView: View {
    var body: some View {
        ComposeHost()
            .ignoresSafeArea()
    }
}

private struct ComposeHost: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        MainViewControllerKt.MainViewController(apiBaseUrl: "http://127.0.0.1:8080")
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
