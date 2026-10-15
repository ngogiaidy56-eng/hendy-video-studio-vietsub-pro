package com.example.desktopApp

/**
 * Desktop player seam.
 * Add a compatible VLCj dependency in desktopApp when wiring the actual player view.
 * Recommended integration shape:
 *   EmbeddedMediaPlayerComponent -> mediaPlayer().media().play(url)
 */
class VlcjPlayerAdapter {
    fun play(url: String) = println("VLCj play: $url")
    fun pause() = println("VLCj pause")
    fun seekTo(positionMs: Long) = println("VLCj seek: $positionMs")
}
