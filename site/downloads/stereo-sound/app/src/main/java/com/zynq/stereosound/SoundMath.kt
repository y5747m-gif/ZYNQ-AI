package com.zynq.stereosound

import kotlin.math.max

/** Pure calculations shared by the native controls and their unit tests. */
object SoundMath {
    data class Gains(val left: Float, val right: Float)

    /** Volume 0..100 and balance -100 (left) .. +100 (right). */
    fun channelGains(volume: Int, balance: Int): Gains {
        val v = volume.coerceIn(0, 100) / 100f
        val b = balance.coerceIn(-100, 100) / 100f
        return Gains(v * (1f - max(0f, b)), v * (1f - max(0f, -b)))
    }

    /** The device's virtualizer can only widen, not narrow, the signal. */
    fun widthPercent(progress: Int): Int = 100 + progress.coerceIn(0, 100)
    fun widthProgress(percent: Int): Int = percent.coerceIn(100, 200) - 100
    fun widthStrength(percent: Int): Short = (widthProgress(percent) * 10).toShort()
}
