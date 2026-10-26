package com.zynq.stereosound

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max

/**
 * الشاشة الرئيسية لتطبيق «ستيريو».
 *
 * ما تفعله فعلًا:
 *   1) تختار ملفًا صوتيًا من ذاكرة الهاتف وتشغّله عبر MediaPlayer.
 *   2) تطبّق على جلسة الصوت: توسيع ستيريو (Virtualizer) + تقوية بيس (BassBoost)
 *      + معادل متعدد النطاقات (Equalizer) + موازن يمين/يسار ومستوى صوت
 *      عبر setVolume على قناتي اليسار واليمين.
 *   3) تولّد نغمة اختبار لكل قناة لتتأكد أن الإخراج استيريو حقيقي.
 *
 * القاعدة المتّبعة: أي ميزة غير مدعومة على الجهاز تُعلَن في الواجهة صراحةً،
 * ولا نُظهر أزرارًا توهم بوظيفة غير موجودة.
 */
class MainActivity : AppCompatActivity() {

    // ---------------- المكوّنات ----------------
    private lateinit var statusText: TextView
    private lateinit var fileName: TextView
    private lateinit var pickButton: Button
    private lateinit var playButton: Button
    private lateinit var timeText: TextView
    private lateinit var positionSeek: SeekBar

    private lateinit var widthSeek: SeekBar
    private lateinit var widthLabel: TextView
    private lateinit var balanceSeek: SeekBar
    private lateinit var balanceLabel: TextView

    private lateinit var volumeSeek: SeekBar
    private lateinit var volumeLabel: TextView
    private lateinit var bassSeek: SeekBar
    private lateinit var bassLabel: TextView

    private lateinit var eqContainer: LinearLayout
    private lateinit var eqNote: TextView
    private lateinit var eqReset: Button

    // ---------------- الحالة ----------------
    private var player: MediaPlayer? = null
    private var effects: StereoEffects? = null
    private val tester = ChannelTester()
    private val ui = Handler(Looper.getMainLooper())

    private var durationMs: Int = 0
    private var userSeeking = false
    private var widthPercent = 100
    private var balance = 0          // -100..100
    private var volumePercent = 85
    private var bassPercent = 0

    private lateinit var prefs: android.content.SharedPreferences

    private val pickAudio = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) openFile(uri)
    }

    // ---------------- دورة الحياة ----------------
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        bindViews()
        loadPrefs()
        syncSliders()
        bindListeners()
        updateLabels()
        setStatus(getString(R.string.status_no_file))

        playButton.isEnabled = false
        positionSeek.isEnabled = false
        eqNote.text = getString(R.string.eq_unsupported)
        eqReset.visibility = View.GONE
    }

    override fun onStop() {
        super.onStop()
        // لا صوت يعمل في الخلفية: التطبيق بلا خدمة أمامية، فيتوقف كل شيء.
        try { if (player?.isPlaying == true) { player?.pause(); refreshPlayButton() } } catch (t: Throwable) { }
        tester.stop()
        ui.removeCallbacks(progressTick)
    }

    override fun onDestroy() {
        ui.removeCallbacks(progressTick)
        tester.stop()
        releasePlayer()
        super.onDestroy()
    }

    // ---------------- ربط الواجهة ----------------
    private fun bindViews() {
        statusText = findViewById(R.id.statusText)
        fileName = findViewById(R.id.fileName)
        pickButton = findViewById(R.id.pickButton)
        playButton = findViewById(R.id.playButton)
        timeText = findViewById(R.id.timeText)
        positionSeek = findViewById(R.id.positionSeek)

        widthSeek = findViewById(R.id.widthSeek)
        widthLabel = findViewById(R.id.widthLabel)
        balanceSeek = findViewById(R.id.balanceSeek)
        balanceLabel = findViewById(R.id.balanceLabel)

        volumeSeek = findViewById(R.id.volumeSeek)
        volumeLabel = findViewById(R.id.volumeLabel)
        bassSeek = findViewById(R.id.bassSeek)
        bassLabel = findViewById(R.id.bassLabel)

        eqContainer = findViewById(R.id.eqContainer)
        eqNote = findViewById(R.id.eqNote)
        eqReset = findViewById(R.id.eqReset)
    }

    private fun bindListeners() {
        pickButton.setOnClickListener {
            // "audio/*" يفتح منتقي الملفات الصوتية في النظام
            pickAudio.launch(arrayOf("audio/*"))
        }

        playButton.setOnClickListener { togglePlayback() }

        positionSeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                if (!fromUser) return
                val p = player ?: return
                if (durationMs > 0) {
                    val target = (progress.toLong() * durationMs / 1000L).toInt()
                    p.seekTo(target)
                    timeText.text = formatTime(target) + " / " + formatTime(durationMs)
                }
            }

            override fun onStartTrackingTouch(seekBar: SeekBar?) { userSeeking = true }
            override fun onStopTrackingTouch(seekBar: SeekBar?) { userSeeking = false }
        })

        widthSeek.setOnSeekBarChangeListener(simpleListener { value ->
            widthPercent = value
            effects?.setWidthPercent(value)
            savePrefs()
            updateLabels()
        })

        balanceSeek.setOnSeekBarChangeListener(simpleListener { value ->
            balance = value - 100 // 0..200 ⇒ -100..100
            applyVolume()
            savePrefs()
            updateLabels()
        })

        volumeSeek.setOnSeekBarChangeListener(simpleListener { value ->
            volumePercent = value
            applyVolume()
            savePrefs()
            updateLabels()
        })

        bassSeek.setOnSeekBarChangeListener(simpleListener { value ->
            bassPercent = value
            effects?.setBassPercent(value)
            savePrefs()
            updateLabels()
        })

        findViewById<Button>(R.id.testLeft).setOnClickListener { runChannelTest(ChannelTester.Side.LEFT) }
        findViewById<Button>(R.id.testRight).setOnClickListener { runChannelTest(ChannelTester.Side.RIGHT) }
        findViewById<Button>(R.id.testBoth).setOnClickListener { runChannelTest(ChannelTester.Side.BOTH) }

        eqReset.setOnClickListener {
            val fx = effects ?: return@setOnClickListener
            fx.resetEqualizer()
            val editor = prefs.edit()
            for (b in 0 until fx.bandCount) editor.remove("eq_band_$b")
            editor.apply()
            buildEqualizerUi()
            toast("تم تصفير المعادل")
        }
    }

    /** مستمع مختصر لشرائح التمرير — القيمة تُقرأ من progress */
    private fun simpleListener(onChange: (Int) -> Unit) = object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
            onChange(progress)
        }

        override fun onStartTrackingTouch(seekBar: SeekBar?) { }
        override fun onStopTrackingTouch(seekBar: SeekBar?) { }
    }

    // ---------------- الملف والتشغيل ----------------
    private fun openFile(uri: Uri) {
        releasePlayer()
        setStatus(getString(R.string.status_loading))
        fileName.text = displayName(uri) ?: uri.lastPathSegment ?: getString(R.string.no_file)

        // نحاول الاحتفاظ بالإذن حتى بعد إعادة التشغيل (قد لا يدعمه موفّر الملفات)
        try {
            contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (t: Throwable) {
            // غير مدعوم — لا مشكلة، الإذن يكفي للجلسة الحالية
        }

        val mp = MediaPlayer()
        try {
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            mp.setDataSource(this, uri)
            mp.setOnPreparedListener { prepared ->
                player = prepared
                durationMs = safeDuration(prepared)
                positionSeek.isEnabled = true
                playButton.isEnabled = true
                positionSeek.progress = 0
                timeText.text = "0:00 / " + formatTime(durationMs)

                // المؤثرات تُنشأ بعد التحضير لأن جلسة الصوت تكون جاهزة حينها
                effects = StereoEffects(prepared.audioSessionId)
                applyAllParams()
                buildEqualizerUi()

                setStatus(getString(R.string.status_playing))
                try { prepared.start() } catch (t: Throwable) { setStatus(getString(R.string.status_ready)) }
                refreshPlayButton()
                ui.removeCallbacks(progressTick)
                ui.post(progressTick)
            }
            mp.setOnCompletionListener {
                setStatus(getString(R.string.status_done))
                refreshPlayButton()
                ui.removeCallbacks(progressTick)
            }
            mp.setOnErrorListener { _, what, extra ->
                setStatus(getString(R.string.status_error))
                toast("خطأ في الملف (${what}/${extra}) — جرّب MP3 أو WAV")
                refreshPlayButton()
                true
            }
            mp.prepareAsync()
        } catch (t: Throwable) {
            setStatus(getString(R.string.status_error))
            toast("تعذّر فتح الملف: ${t.message ?: "صيغة غير مدعومة"}")
            try { mp.release() } catch (e: Throwable) { }
        }
    }

    private fun togglePlayback() {
        val p = player ?: return
        try {
            if (p.isPlaying) {
                p.pause()
                setStatus(getString(R.string.status_paused))
                ui.removeCallbacks(progressTick)
            } else {
                p.start()
                setStatus(getString(R.string.status_playing))
                ui.post(progressTick)
            }
        } catch (t: Throwable) {
            toast("تعذّر التشغيل: ${t.message ?: "خطأ غير معروف"}")
        }
        refreshPlayButton()
    }

    private fun refreshPlayButton() {
        val playing = try { player?.isPlaying == true } catch (t: Throwable) { false }
        playButton.text = getString(if (playing) R.string.pause else R.string.play)
    }

    private val progressTick = object : Runnable {
        override fun run() {
            val p = player ?: return
            try {
                if (!userSeeking && durationMs > 0) {
                    val pos = p.currentPosition.coerceIn(0, durationMs)
                    positionSeek.progress = (pos.toLong() * 1000L / durationMs).toInt()
                    timeText.text = formatTime(pos) + " / " + formatTime(durationMs)
                }
                if (p.isPlaying) ui.postDelayed(this, 400) else refreshPlayButton()
            } catch (t: Throwable) {
                // اللاعب أُغلق
            }
        }
    }

    private fun releasePlayer() {
        ui.removeCallbacks(progressTick)
        effects?.release()
        effects = null
        try { player?.release() } catch (t: Throwable) { }
        player = null
        durationMs = 0
        playButton.isEnabled = false
        positionSeek.isEnabled = false
    }

    // ---------------- تطبيق الإعدادات ----------------
    private fun applyAllParams() {
        applyVolume()
        effects?.setBassPercent(bassPercent)
        effects?.setWidthPercent(widthPercent)
    }

    /**
     * الموازن والمستوى معًا: setVolume على MediaPlayer يضبط قناتي اليسار
     * واليمين مستقلتين، فنحسب كل قناة من مستوى الصوت × موضع الموازن.
     */
    private fun applyVolume() {
        val p = player ?: return
        val v = volumePercent.coerceIn(0, 100) / 100f
        val b = balance.coerceIn(-100, 100) / 100f
        val left = v * (1f - max(0f, b))
        val right = v * (1f - max(0f, -b))
        try {
            p.setVolume(left.coerceIn(0f, 1f), right.coerceIn(0f, 1f))
        } catch (t: Throwable) {
            // تجاهل
        }
    }

    // ---------------- نغمة الاختبار ----------------
    private fun runChannelTest(side: ChannelTester.Side) {
        // نوقف التشغيل مؤقتًا حتى تُسمع النغمة بوضوح
        try { if (player?.isPlaying == true) player?.pause() } catch (t: Throwable) { }
        refreshPlayButton()

        val started = tester.play(side) {
            ui.post {
                setStatus(getString(R.string.status_ready))
                toast("انتهى الاختبار — القناة ${when (side) {
                    ChannelTester.Side.LEFT -> "اليسرى"
                    ChannelTester.Side.RIGHT -> "اليمنى"
                    ChannelTester.Side.BOTH -> "الاثنتان"
                }}")
            }
        }
        if (!started) {
            toast("تعذّر تشغيل نغمة الاختبار على هذا الجهاز")
            return
        }
        setStatus(
            getString(
                R.string.status_playing
            ) + " — اختبار " + when (side) {
                ChannelTester.Side.LEFT -> "اليسار"
                ChannelTester.Side.RIGHT -> "اليمين"
                ChannelTester.Side.BOTH -> "القناتين"
            }
        )
    }

    // ---------------- واجهة المعادل ----------------
    private fun buildEqualizerUi() {
        eqContainer.removeAllViews()
        val fx = effects

        if (fx == null || !fx.eqAvailable) {
            eqNote.text = getString(R.string.eq_unsupported)
            eqReset.visibility = View.GONE
            bassSeek.isEnabled = false
            bassLabel.text = getString(R.string.bass_unsupported)
            widthSeek.isEnabled = false
            widthLabel.text = getString(R.string.width_unsupported)
            return
        }

        eqReset.visibility = View.VISIBLE
        eqNote.text = getString(R.string.eq_ready, fx.bandCount)

        val range = fx.levelRange
        val span = max(1, range.last - range.first)

        for (band in 0 until fx.bandCount) {
            val hz = fx.bandCenterHz(band)
            val saved = prefs.getInt("eq_band_$band", Int.MIN_VALUE)
            val level = if (saved == Int.MIN_VALUE) fx.bandLevel(band) else saved

            val label = TextView(this).apply {
                text = if (hz > 0) getString(R.string.eq_band, hz) else "نطاق ${band + 1}"
                textSize = 12f
                setPadding(0, dp(8), 0, 0)
            }

            val seek = SeekBar(this).apply {
                this.max = span
                progress = (level - range.first).coerceIn(0, span)
                contentDescription = label.text
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                        if (!fromUser) return
                        val mB = range.first + progress
                        fx.setBandLevel(band, mB)
                        prefs.edit().putInt("eq_band_$band", mB).apply()
                    }

                    override fun onStartTrackingTouch(seekBar: SeekBar?) { }
                    override fun onStopTrackingTouch(seekBar: SeekBar?) { }
                })
            }

            eqContainer.addView(label)
            eqContainer.addView(seek)

            // إعادة ضبط المستوى المحفوظ على المؤثر إن كان الجهاز قد صفّره
            if (saved != Int.MIN_VALUE) fx.setBandLevel(band, saved)
        }

        // ميزات قد تكون غير متوفرة على هذا الجهاز بالتحديد
        if (!fx.bassAvailable) {
            bassSeek.isEnabled = false
            bassLabel.text = getString(R.string.bass_unsupported)
        }
        if (!fx.virtualAvailable) {
            widthSeek.isEnabled = false
            widthLabel.text = getString(R.string.width_unsupported)
        }
    }

    // ---------------- التسميات والحفظ ----------------
    private fun updateLabels() {
        widthLabel.text = getString(R.string.width_label, widthPercent)

        balanceLabel.text = when {
            abs(balance) < 5 -> getString(R.string.balance_label, getString(R.string.balance_center))
            balance < 0 -> getString(R.string.balance_label, getString(R.string.balance_left, -balance))
            else -> getString(R.string.balance_label, getString(R.string.balance_right, balance))
        }

        volumeLabel.text = getString(R.string.volume_label, volumePercent)
        bassLabel.text = getString(R.string.bass_label, bassPercent)
    }

    private fun syncSliders() {
        widthSeek.progress = widthPercent
        balanceSeek.progress = balance + 100
        volumeSeek.progress = volumePercent
        bassSeek.progress = bassPercent
    }

    private fun loadPrefs() {
        widthPercent = prefs.getInt(KEY_WIDTH, 100).coerceIn(100, 200)
        balance = prefs.getInt(KEY_BALANCE, 0).coerceIn(-100, 100)
        volumePercent = prefs.getInt(KEY_VOLUME, 85).coerceIn(0, 100)
        bassPercent = prefs.getInt(KEY_BASS, 0).coerceIn(0, 100)
    }

    private fun savePrefs() {
        prefs.edit()
            .putInt(KEY_WIDTH, widthPercent)
            .putInt(KEY_BALANCE, balance)
            .putInt(KEY_VOLUME, volumePercent)
            .putInt(KEY_BASS, bassPercent)
            .apply()
    }

    // ---------------- مساعدات ----------------
    private fun setStatus(text: String) { statusText.text = text }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    private fun safeDuration(p: MediaPlayer): Int =
        try { p.duration.coerceAtLeast(0) } catch (t: Throwable) { 0 }

    private fun formatTime(ms: Int): String {
        val totalSeconds = (ms.coerceAtLeast(0) / 1000)
        val minutes = totalSeconds / 60
        val seconds = totalSeconds % 60
        return String.format(Locale.US, "%d:%02d", minutes, seconds)
    }

    private fun displayName(uri: Uri): String? {
        return try {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (!cursor.moveToFirst()) return null
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx < 0) null else cursor.getString(idx)
            }
        } catch (t: Throwable) {
            null
        }
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val PREFS = "stereo_settings"
        const val KEY_WIDTH = "width"
        const val KEY_BALANCE = "balance"
        const val KEY_VOLUME = "volume"
        const val KEY_BASS = "bass"
    }
}
