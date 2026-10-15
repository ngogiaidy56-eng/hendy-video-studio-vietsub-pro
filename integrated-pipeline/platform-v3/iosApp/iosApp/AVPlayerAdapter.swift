import AVFoundation

final class AVPlayerAdapter {
    let player = AVPlayer()

    func play(url: URL) {
        player.replaceCurrentItem(with: AVPlayerItem(url: url))
        player.play()
    }

    func pause() { player.pause() }
    func seek(to positionSeconds: Double) {
        player.seek(to: CMTime(seconds: positionSeconds, preferredTimescale: 600))
    }
}
