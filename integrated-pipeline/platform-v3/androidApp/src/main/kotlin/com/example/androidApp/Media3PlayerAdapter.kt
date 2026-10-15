package com.example.androidApp

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import com.example.composeapp.PlatformPlayerController

class Media3PlayerAdapter(context: Context) : PlatformPlayerController {
    private val player = ExoPlayer.Builder(context).build()

    override fun play(url: String) {
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        player.play()
    }

    override fun pause() { player.pause() }
    override fun seekTo(positionMs: Long) { player.seekTo(positionMs) }
    fun release() { player.release() }
}
