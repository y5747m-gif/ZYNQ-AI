package com.zynq.stereosound

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.sin

/** Short stereo PCM tone, independent of optional device effects. */
class ChannelTester {
    enum class Side { LEFT, RIGHT, BOTH }

    private class Session(val track: AudioTrack) {
        @Volatile var cancelled = false
    }
    private val lock = Any()
    private var current: Session? = null

    fun play(side: Side, durationMs: Int = 900, onFinished: (() -> Unit)? = null): Boolean {
        stop()
        val sampleRate = 44100
        val minBuffer = AudioTrack.getMinBufferSize(
            sampleRate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuffer <= 0) return false
        val track = try {
            AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setAudioFormat(AudioFormat.Builder().setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
                .setBufferSizeInBytes(minBuffer * 2)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
        } catch (_: Exception) { return false }
        if (track.state != AudioTrack.STATE_INITIALIZED) {
            track.release()
            return false
        }
        val session = Session(track)
        synchronized(lock) { current = session }
        Thread {
            val totalFrames = (sampleRate.toLong() * durationMs.coerceAtLeast(1) / 1000L).toInt()
            val buffer = ShortArray(1024 * 2)
            var frame = 0
            try {
                track.play()
                while (!session.cancelled && frame < totalFrames) {
                    val frames = minOf(1024, totalFrames - frame)
                    for (i in 0 until frames) {
                        val n = frame + i
                        // Brief fade avoids a click at either end of the test tone.
                        val envelope = minOf(1.0, n / 220.0, (totalFrames - 1 - n) / 220.0).coerceAtLeast(0.0)
                        val sample = (sin(2.0 * PI * 660.0 * n / sampleRate) * 8000 * envelope).toInt().toShort()
                        buffer[i * 2] = if (side == Side.LEFT || side == Side.BOTH) sample else 0
                        buffer[i * 2 + 1] = if (side == Side.RIGHT || side == Side.BOTH) sample else 0
                    }
                    var offset = 0
                    while (!session.cancelled && offset < frames * 2) {
                        val written = track.write(buffer, offset, frames * 2 - offset)
                        if (written <= 0) { session.cancelled = true; break }
                        offset += written
                    }
                    frame += frames
                }
            } catch (_: Exception) {
                session.cancelled = true
            } finally {
                try { track.stop() } catch (_: Exception) { }
                try { track.release() } catch (_: Exception) { }
                val finished = synchronized(lock) {
                    if (current === session) {
                        current = null
                        !session.cancelled
                    } else false
                }
                if (finished) onFinished?.invoke()
            }
        }.apply { isDaemon = true; start() }
        return true
    }

    fun stop() {
        val session = synchronized(lock) {
            current?.also { it.cancelled = true; current = null }
        } ?: return
        // Unblock a pending write without joining a worker on the UI thread.
        try { session.track.pause() } catch (_: Exception) { }
        try { session.track.flush() } catch (_: Exception) { }
    }
}
