package com.zynq.stereosound

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.sin

/**
 * مولّد نغمة اختبار للقناتين.
 *
 * الغرض: أن يتأكد المستخدم أن الإخراج استيريو فعلًا — نغمة في اليسار فقط،
 * ثم في اليمين فقط. تُكتب النغمة بصيغة PCM 16-bit بقناتين صريحتين
 * (CHANNEL_OUT_STEREO) عبر AudioTrack، بلا أي اعتماد على مكتبات خارجية.
 *
 * (النسخة السابقة كانت تحاول تشغيل نغمة على قناة واحدة عبر AudioTrack ثم
 *  تنسخها يدويًا بضرب Short في Float — وهو ما لا يُترجم في كوتلن أصلًا.)
 */
class ChannelTester {

    enum class Side { LEFT, RIGHT, BOTH }

    @Volatile
    private var running = false
    private var thread: Thread? = null
    private var track: AudioTrack? = null

    fun play(side: Side, durationMs: Int = 900, onFinished: (() -> Unit)? = null): Boolean {
        stop()

        val sampleRate = 44100
        val minBuffer = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_STEREO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuffer <= 0) return false

        val audioTrack = try {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .build()
                )
                .setBufferSizeInBytes(minBuffer * 2)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
        } catch (t: Throwable) {
            return false
        }

        track = audioTrack
        running = true

        thread = Thread {
            val totalFrames = (sampleRate.toLong() * durationMs / 1000L).toInt()
            val chunkFrames = 1024
            val buffer = ShortArray(chunkFrames * 2) // قناتان متشابكتان
            val freq = 660.0
            val amplitude = 8000.0 // ≈ 24% من المدى الكامل — عالٍ وآمن
            var frame = 0

            try {
                audioTrack.play()
                while (running && frame < totalFrames) {
                    val frames = minOf(chunkFrames, totalFrames - frame)
                    for (i in 0 until frames) {
                        val t = (frame + i).toDouble() / sampleRate
                        val sample = (sin(2.0 * PI * freq * t) * amplitude).toInt()
                        val left = if (side == Side.LEFT || side == Side.BOTH) sample else 0
                        val right = if (side == Side.RIGHT || side == Side.BOTH) sample else 0
                        buffer[i * 2] = left.toShort()
                        buffer[i * 2 + 1] = right.toShort()
                    }
                    val written = audioTrack.write(buffer, 0, frames * 2)
                    if (written < 0) break // خطأ في الكتابة — نتوقف
                    frame += frames
                }
            } catch (t: Throwable) {
                // إيقاف آمن: أي خطأ في الكتابة يعني أننا نغلق
            } finally {
                running = false
                try { audioTrack.stop() } catch (t: Throwable) { }
                try { audioTrack.release() } catch (t: Throwable) { }
                if (track === audioTrack) track = null
                onFinished?.invoke()
            }
        }.also { it.isDaemon = true; it.start() }

        return true
    }

    fun isPlaying(): Boolean = running

    fun stop() {
        running = false
        thread?.let { t ->
            try { t.join(600) } catch (e: InterruptedException) { Thread.currentThread().interrupt() }
        }
        thread = null
        track?.let {
            try { it.pause() } catch (t: Throwable) { }
            try { it.flush() } catch (t: Throwable) { }
        }
    }
}
