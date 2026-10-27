package com.zynq.stereosound

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.Virtualizer

/**
 * مؤثرات الصوت المطبَّقة على جلسة تشغيل الوسائط (audio session).
 *
 * لماذا هذه الطبقة؟
 *   `MediaPlayer` لا يعطينا عيّنات PCM لنعالجها يدويًا، لذلك التوسيع والموازن
 *   والمعادل تُطبَّق عبر مؤثرات النظام على جلسة الصوت نفسها — وهذا يعني أن
 *   التأثير يسمعه المستخدم في كل ما يشغّله التطبيق.
 *
 * كل مؤثر مستقل: بعض الأجهزة لا توفّر Virtualizer أو BassBoost أو Equalizer.
 * لذلك كل واحد يُنشأ داخل محاولة مستقلة، وإن غاب نقول ذلك في الواجهة بدل أن
 * ينهار التطبيق (وهو الخطأ الذي كان في النسخة السابقة: `android.media.Equalizer`
 * كلاس غير موجود أصلًا، فلا يُبنى المشروع).
 */
@Suppress("DEPRECATION")
class StereoEffects(sessionId: Int) {

    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null
    private var virtualizer: Virtualizer? = null

    /** عدد نطاقات المعادل (0 = غير متوفر) */
    val bandCount: Int
        get() = try { equalizer?.numberOfBands?.toInt() ?: 0 } catch (t: Throwable) { 0 }

    /** مدى المستوى بالميلي-ديسيبل (مثال: -1500..1500) */
    val levelRange: IntRange
        get() {
            val range = try { equalizer?.bandLevelRange } catch (t: Throwable) { null }
                ?: return 0..0
            if (range.size < 2) return 0..0
            return range[0].toInt()..range[1].toInt()
        }

    val eqAvailable: Boolean get() = bandCount > 0
    val bassAvailable: Boolean get() = bassBoost != null
    val virtualAvailable: Boolean get() = virtualizer != null

    init {
        equalizer = try {
            Equalizer(0, sessionId).also { if (it.numberOfBands > 0) it.enabled = true }
        } catch (t: Throwable) {
            null
        }

        bassBoost = try {
            BassBoost(0, sessionId).also { if (it.strengthSupported) it.enabled = true }
        } catch (t: Throwable) {
            null
        }

        virtualizer = try {
            Virtualizer(0, sessionId).also { if (it.strengthSupported) it.enabled = true }
        } catch (t: Throwable) {
            null
        }
    }

    /** تردد مركز النطاق بالهرتز (مفيد لعنونة الشريحة في الواجهة) */
    fun bandCenterHz(band: Int): Int {
        val eq = equalizer ?: return 0
        return try {
            val freqRange = eq.getBandFreqRange(band.toShort())
            if (freqRange.size < 2) 0
            else (((freqRange[0].toLong() + freqRange[1].toLong()) / 2L) / 1000L).toInt()
        } catch (t: Throwable) {
            0
        }
    }

    fun bandLevel(band: Int): Int =
        try { equalizer?.getBandLevel(band.toShort())?.toInt() ?: 0 } catch (t: Throwable) { 0 }

    fun setBandLevel(band: Int, milliBel: Int) {
        val eq = equalizer ?: return
        try {
            val r = levelRange
            val clamped = milliBel.coerceIn(r.first, r.last)
            // setBandLevel يستقبل ميلي-ديسيبل (Short)
            eq.setBandLevel(band.toShort(), clamped.toShort())
            if (!eq.enabled) eq.enabled = true
        } catch (t: Throwable) {
            // جهاز يرفض الضبط — نتجاهل بهدوء حتى لا يسقط التطبيق
        }
    }

    fun resetEqualizer() {
        val eq = equalizer ?: return
        try {
            for (b in 0 until bandCount) eq.setBandLevel(b.toShort(), 0)
        } catch (t: Throwable) {
            // تجاهل
        }
    }

    /** تقوية البيس: 0..100% */
    fun setBassPercent(percent: Int) {
        val bb = bassBoost ?: return
        try {
            if (!bb.strengthSupported) return
            bb.setStrength((percent.coerceIn(0, 100) * 10).toShort()) // 0..1000
            if (percent > 0 && !bb.enabled) bb.enabled = true
        } catch (t: Throwable) {
            // تجاهل
        }
    }

    /**
     * توسيع الستيريو: 100% = بلا توسيع، 200% = أقوى توسيع يسمح به الجهاز.
     * أقل من 100% لا يمكن تضييقه بمؤثر Virtualizer (فهو يوسّع فقط).
     */
    fun setWidthPercent(percent: Int) {
        val v = virtualizer ?: return
        try {
            if (!v.strengthSupported) return
            val strength = ((percent.coerceIn(100, 200) - 100) * 10) // 0..1000
            v.setStrength(strength.toShort())
            if (strength > 0 && !v.enabled) v.enabled = true
        } catch (t: Throwable) {
            // تجاهل
        }
    }

    fun release() {
        try { equalizer?.enabled = false } catch (t: Throwable) { }
        try { equalizer?.release() } catch (t: Throwable) { }
        try { bassBoost?.enabled = false } catch (t: Throwable) { }
        try { bassBoost?.release() } catch (t: Throwable) { }
        try { virtualizer?.enabled = false } catch (t: Throwable) { }
        try { virtualizer?.release() } catch (t: Throwable) { }
        equalizer = null
        bassBoost = null
        virtualizer = null
    }
}
