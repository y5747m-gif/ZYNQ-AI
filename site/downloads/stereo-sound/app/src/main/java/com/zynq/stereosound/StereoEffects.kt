package com.zynq.stereosound

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.Virtualizer

/**
 * Effects belong only to the MediaPlayer session, not to other apps. Android
 * devices may omit any one effect, so each is created and reported separately.
 */
@Suppress("DEPRECATION")
class StereoEffects(sessionId: Int) {
    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null
    private var virtualizer: Virtualizer? = null

    val bandCount: Int
        get() = try { equalizer?.numberOfBands?.toInt() ?: 0 } catch (_: Exception) { 0 }
    val levelRange: IntRange
        get() {
            val range = try { equalizer?.bandLevelRange } catch (_: Exception) { null }
                ?: return 0..0
            if (range.size < 2) return 0..0
            return range[0].toInt()..range[1].toInt()
        }
    val eqAvailable: Boolean get() = bandCount > 0
    val bassAvailable: Boolean get() = bassBoost != null
    val virtualAvailable: Boolean get() = virtualizer != null

    init {
        equalizer = try {
            val effect = Equalizer(0, sessionId)
            if (effect.numberOfBands > 0) {
                effect.enabled = true
                effect
            } else {
                effect.release()
                null
            }
        } catch (_: Exception) { null }
        bassBoost = try {
            val effect = BassBoost(0, sessionId)
            if (effect.strengthSupported) effect else {
                effect.release()
                null
            }
        } catch (_: Exception) { null }
        virtualizer = try {
            val effect = Virtualizer(0, sessionId)
            if (effect.strengthSupported) effect else {
                effect.release()
                null
            }
        } catch (_: Exception) { null }
    }

    fun bandCenterHz(band: Int): Int = try {
        (equalizer?.getCenterFreq(band.toShort()) ?: 0) / 1000
    } catch (_: Exception) { 0 }

    fun bandLevel(band: Int): Int = try {
        equalizer?.getBandLevel(band.toShort())?.toInt() ?: 0
    } catch (_: Exception) { 0 }

    fun setBandLevel(band: Int, milliBel: Int) {
        val eq = equalizer ?: return
        try {
            val range = levelRange
            eq.setBandLevel(band.toShort(), milliBel.coerceIn(range.first, range.last).toShort())
        } catch (_: Exception) { /* Some vendors revoke an effect while playing. */ }
    }

    fun resetEqualizer() {
        val range = levelRange
        for (band in 0 until bandCount) setBandLevel(band, 0.coerceIn(range.first, range.last))
    }

    fun setBassPercent(percent: Int) {
        val effect = bassBoost ?: return
        try {
            val strength = (percent.coerceIn(0, 100) * 10).toShort()
            effect.setStrength(strength)
            effect.enabled = strength > 0
        } catch (_: Exception) { }
    }

    /** 100% is off. 200% means maximum virtualizer strength, not a measured width. */
    fun setWidthPercent(percent: Int) {
        val effect = virtualizer ?: return
        try {
            val strength = SoundMath.widthStrength(percent)
            effect.setStrength(strength)
            effect.enabled = strength > 0
        } catch (_: Exception) { }
    }

    fun release() {
        try { equalizer?.release() } catch (_: Exception) { }
        try { bassBoost?.release() } catch (_: Exception) { }
        try { virtualizer?.release() } catch (_: Exception) { }
        equalizer = null
        bassBoost = null
        virtualizer = null
    }
}
