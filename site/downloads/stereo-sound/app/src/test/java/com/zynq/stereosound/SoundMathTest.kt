package com.zynq.stereosound

import org.junit.Assert.assertEquals
import org.junit.Test

class SoundMathTest {
    @Test fun centeredBalanceKeepsBothChannelsEqual() {
        val gains = SoundMath.channelGains(85, 0)
        assertEquals(0.85f, gains.left, 0.0001f)
        assertEquals(0.85f, gains.right, 0.0001f)
    }

    @Test fun balanceEndsMuteOnlyTheOppositeChannel() {
        val left = SoundMath.channelGains(100, -100)
        val right = SoundMath.channelGains(100, 100)
        assertEquals(1f, left.left, 0.0001f)
        assertEquals(0f, left.right, 0.0001f)
        assertEquals(0f, right.left, 0.0001f)
        assertEquals(1f, right.right, 0.0001f)
    }

    @Test fun volumeAndBalanceAreClamped() {
        val gains = SoundMath.channelGains(150, -200)
        assertEquals(1f, gains.left, 0.0001f)
        assertEquals(0f, gains.right, 0.0001f)
        assertEquals(0f, SoundMath.channelGains(-1, 0).left, 0.0001f)
    }

    @Test fun virtualizerRangeNeverPromisesNarrowing() {
        assertEquals(100, SoundMath.widthPercent(-5))
        assertEquals(150, SoundMath.widthPercent(50))
        assertEquals(200, SoundMath.widthPercent(150))
        assertEquals(0, SoundMath.widthProgress(100))
        assertEquals(100, SoundMath.widthProgress(200))
        assertEquals(0, SoundMath.widthStrength(0).toInt())
        assertEquals(500, SoundMath.widthStrength(150).toInt())
        assertEquals(1000, SoundMath.widthStrength(300).toInt())
    }
}
