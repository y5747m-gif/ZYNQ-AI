package com.zynq.stereosound

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.Equalizer

/**
 * محرك صوت استيريو: يشغّل إخراج ستيريو عبر [AudioTrack] بنظام قناتين
 * (CHANNEL_OUT_STEREO) مع موازن يمين/يسار [balance] يحوّل أي إشارة إلى استيريو.
 */
class StereoAudioEngine {

    private var track: AudioTrack? = null
    private var thread: Thread? = null
    private var running = false

    /** موازن स्टीरيو: -1.0 = اليسار فقط، 0.0 = متوازن، +1.0 = اليمين فقط. */
    var balance: Float = 0f
        private set

    fun setBalance(value: Float) {
        balance = value.coerceIn(-1f, 1f)
    }

    fun start(context: Context) {
        stop()
        running = true

        val sampleRate = 44100
        val minBufferSize = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_STEREO,
            AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(4096)

        track = AudioTrack(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build(),
            AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .build(),
            minBufferSize,
            AudioTrack.MODE_STREAM,
            0
        )
        track?.play()

        thread = Thread { renderLoop(sampleRate) }
        thread?.start()

        // معادل صوتي على جلسة المخرج إن توفّر من النظام
        track?.audioSessionId?.let { sessionId ->
            try {
                Equalizer(0, sessionId).use { eq ->
                    eq.isEnabled = true
                }
            } catch (_: Exception) {
                // المعادل غير متوفر على هذا الجهاز — نستمر بدون تأثير إضافي
            }
        }
    }

    private fun renderLoop(sampleRate: Int) {
        val buffer = ShortArray(2048)
        var phase = 0.0

        while (running) {
            val pan = balance.coerceIn(-1f, 1f)
            // قانون توزيع بسيط (pan law): اليسار والימين يتقاسمان الطاقة
            val gainL = (1.0f - maxOf(pan, 0f))
            val gainR = (1.0f - maxOf(-pan, 0f))

            for (i in buffer.indices step 2) {
                phase += 0.02
                if (phase > 2 * Math.PI) phase -= 2 * Math.PI
                val sample = (Math.sin(phase) * 8000).toShort()
                buffer[i] = (sample * gainL).toShort()     // قناة اليسار
                buffer[i + 1] = (sample * gainR).toShort() // قناة اليمين
            }

            track?.write(buffer, 0, buffer.size)
        }

        track?.stop()
        track?.release()
        track = null
    }

    fun stop() {
        running = false
        thread?.join(1000)
        thread = null
    }
}
