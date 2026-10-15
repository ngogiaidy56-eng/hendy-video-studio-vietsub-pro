package com.example.composeapp

/** Platform adapter seam for Media3 / AVPlayer / VLCj. */
interface PlatformPlayerController {
    fun play(url: String)
    fun pause()
    fun seekTo(positionMs: Long)
}
