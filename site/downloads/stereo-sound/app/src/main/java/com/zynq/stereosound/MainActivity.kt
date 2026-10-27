package com.zynq.stereosound

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Typeface
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
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
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max

/** Native, offline player. Effects apply only to files played by this app. */
class MainActivity : AppCompatActivity() {
    private lateinit var statusText: TextView
    private lateinit var fileName: TextView
    private lateinit var playButton: Button
    private lateinit var backTen: Button
    private lateinit var forwardTen: Button
    private lateinit var timeText: TextView
    private lateinit var positionSeek: SeekBar
    private lateinit var widthSeek: SeekBar
    private lateinit var widthLabel: TextView
    private lateinit var widthPresets: List<Button>
    private lateinit var balanceSeek: SeekBar
    private lateinit var balanceLabel: TextView
    private lateinit var volumeSeek: SeekBar
    private lateinit var volumeLabel: TextView
    private lateinit var bassSeek: SeekBar
    private lateinit var bassLabel: TextView
    private lateinit var eqContainer: LinearLayout
    private lateinit var eqNote: TextView
    private lateinit var eqReset: Button
    private lateinit var prefs: SharedPreferences

    private var player: MediaPlayer? = null
    private var prepared = false
    private var effects: StereoEffects? = null
    private val tester = ChannelTester()
    private val ui = Handler(Looper.getMainLooper())
    private var testGeneration = 0
    private var testing = false
    private var visible = false
    private var durationMs = 0
    private var userSeeking = false
    private var widthPercent = 100
    private var balance = 0
    private var volumePercent = 85
    private var bassPercent = 0

    private val audioManager by lazy { getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    private val audioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()
    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        if (change == AudioManager.AUDIOFOCUS_LOSS ||
            change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT ||
            change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            ui.post {
                stopChannelTest()
                pausePlayback()
            }
        }
    }
    private val focusRequest: AudioFocusRequest? by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(audioAttributes)
                .setOnAudioFocusChangeListener(focusListener, ui)
                .setWillPauseWhenDucked(true)
                .build()
        } else null
    }
    private val pickAudio = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) openFile(uri)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        // Target 35+ is edge-to-edge: keep all controls clear of bars and cutouts.
        val root = findViewById<View>(R.id.screenRoot)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            WindowInsetsCompat.CONSUMED
        }
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true
        ViewCompat.requestApplyInsets(root)

        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        bindViews()
        loadPrefs()
        syncSliders()
        bindListeners()
        updateEffectControls()
        updateLabels()
    }

    override fun onStart() {
        super.onStart()
        visible = true
    }

    override fun onStop() {
        visible = false
        stopChannelTest()
        pausePlayback()
        abandonFocus()
        ui.removeCallbacks(progressTick)
        super.onStop()
    }

    override fun onDestroy() {
        stopChannelTest()
        releasePlayer()
        abandonFocus()
        super.onDestroy()
    }

    private fun bindViews() {
        statusText = findViewById(R.id.statusText)
        fileName = findViewById(R.id.fileName)
        playButton = findViewById(R.id.playButton)
        backTen = findViewById(R.id.backTen)
        forwardTen = findViewById(R.id.forwardTen)
        timeText = findViewById(R.id.timeText)
        positionSeek = findViewById(R.id.positionSeek)
        widthSeek = findViewById(R.id.widthSeek)
        widthLabel = findViewById(R.id.widthLabel)
        widthPresets = listOf(findViewById(R.id.widthNatural), findViewById(R.id.widthWide), findViewById(R.id.widthMax))
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
        findViewById<Button>(R.id.pickButton).setOnClickListener { pickAudio.launch(arrayOf("audio/*")) }
        playButton.setOnClickListener { togglePlayback() }
        backTen.setOnClickListener { skipBy(-10_000) }
        forwardTen.setOnClickListener { skipBy(10_000) }
        positionSeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                if (!fromUser || !prepared || durationMs <= 0) return
                val target = (progress.toLong() * durationMs / 1000L).toInt()
                try { player?.seekTo(target) } catch (_: Exception) { }
                updateTime(target)
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) { userSeeking = true }
            override fun onStopTrackingTouch(seekBar: SeekBar?) { userSeeking = false }
        })
        widthSeek.setOnSeekBarChangeListener(simpleListener { changeWidth(SoundMath.widthPercent(it), false) })
        widthPresets[0].setOnClickListener { changeWidth(100) }
        widthPresets[1].setOnClickListener { changeWidth(150) }
        widthPresets[2].setOnClickListener { changeWidth(200) }
        balanceSeek.setOnSeekBarChangeListener(simpleListener {
            balance = it - 100
            applyVolume()
            savePrefs()
            updateLabels()
        })
        volumeSeek.setOnSeekBarChangeListener(simpleListener {
            volumePercent = it
            applyVolume()
            savePrefs()
            updateLabels()
        })
        bassSeek.setOnSeekBarChangeListener(simpleListener {
            bassPercent = it
            effects?.setBassPercent(it)
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
            for (band in 0 until fx.bandCount) editor.remove("eq_band_$band")
            editor.apply()
            buildEqualizerUi()
            toast(getString(R.string.eq_reset_done))
        }
    }

    private fun simpleListener(onUserChange: (Int) -> Unit) = object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
            if (fromUser) onUserChange(progress)
        }
        override fun onStartTrackingTouch(seekBar: SeekBar?) { }
        override fun onStopTrackingTouch(seekBar: SeekBar?) { }
    }

    private fun changeWidth(value: Int, updateSlider: Boolean = true) {
        widthPercent = value.coerceIn(100, 200)
        if (updateSlider) widthSeek.progress = SoundMath.widthProgress(widthPercent)
        effects?.setWidthPercent(widthPercent)
        savePrefs()
        updateLabels()
    }

    private fun openFile(uri: Uri) {
        stopChannelTest()
        releasePlayer()
        abandonFocus()
        setStatus(R.string.status_loading)
        fileName.text = displayName(uri) ?: uri.lastPathSegment ?: getString(R.string.no_file)
        timeText.text = "0:00 / 0:00"
        positionSeek.progress = 0
        updateEffectControls()
        updateLabels()

        val mp = MediaPlayer()
        player = mp // Track the preparing player too, so a second selection can release it.
        try {
            mp.setAudioAttributes(audioAttributes)
            mp.setDataSource(this, uri)
            mp.setOnPreparedListener { ready ->
                if (player !== ready) return@setOnPreparedListener
                prepared = true
                durationMs = safeDuration(ready)
                playButton.isEnabled = true
                backTen.isEnabled = true
                forwardTen.isEnabled = true
                positionSeek.isEnabled = durationMs > 0
                updateTime(0)
                effects = StereoEffects(ready.audioSessionId)
                applyVolume()
                effects?.setBassPercent(bassPercent)
                effects?.setWidthPercent(widthPercent)
                updateEffectControls()
                updateLabels()
                setStatus(R.string.status_ready)
                // Never start after the activity has gone into the background.
                if (visible && acquireFocus()) startPlayback(ready)
            }
            mp.setOnCompletionListener { completed ->
                if (player === completed) {
                    setStatus(R.string.status_done)
                    refreshPlayButton()
                    ui.removeCallbacks(progressTick)
                    abandonFocus()
                }
            }
            mp.setOnErrorListener { failed, _, _ ->
                if (player === failed) {
                    releasePlayer()
                    abandonFocus()
                    updateEffectControls()
                    updateLabels()
                    setStatus(R.string.status_error)
                    toast(getString(R.string.file_error))
                }
                true
            }
            mp.prepareAsync()
        } catch (_: Exception) {
            if (player === mp) releasePlayer() else try { mp.release() } catch (_: Exception) { }
            updateEffectControls()
            updateLabels()
            setStatus(R.string.status_error)
            toast(getString(R.string.file_error))
        }
    }

    private fun togglePlayback() {
        val p = player ?: return
        if (!prepared) return
        stopChannelTest()
        if (isPlaying(p)) {
            pausePlayback()
            abandonFocus()
        } else if (acquireFocus()) {
            startPlayback(p)
        } else {
            toast(getString(R.string.audio_focus_error))
        }
    }

    private fun startPlayback(p: MediaPlayer) {
        try {
            p.start()
            setStatus(R.string.status_playing)
            ui.removeCallbacks(progressTick)
            ui.post(progressTick)
        } catch (_: Exception) {
            setStatus(R.string.status_error)
            abandonFocus()
            toast(getString(R.string.file_error))
        }
        refreshPlayButton()
    }

    private fun pausePlayback() {
        val p = player
        if (p != null && prepared && isPlaying(p)) {
            try { p.pause() } catch (_: Exception) { }
            setStatus(R.string.status_paused)
        }
        ui.removeCallbacks(progressTick)
        if (::playButton.isInitialized) refreshPlayButton()
    }

    private fun skipBy(delta: Int) {
        val p = player ?: return
        if (!prepared || durationMs <= 0) return
        try {
            val target = (p.currentPosition.toLong() + delta).coerceIn(0L, durationMs.toLong()).toInt()
            p.seekTo(target)
            positionSeek.progress = (target.toLong() * 1000 / durationMs).toInt()
            updateTime(target)
        } catch (_: Exception) { }
    }

    private fun refreshPlayButton() {
        val playing = player?.let { prepared && isPlaying(it) } == true
        playButton.setText(if (playing) R.string.pause else R.string.play)
    }

    private val progressTick = object : Runnable {
        override fun run() {
            val p = player ?: return
            if (!prepared) return
            try {
                if (!userSeeking && durationMs > 0) {
                    val position = p.currentPosition.coerceIn(0, durationMs)
                    positionSeek.progress = (position.toLong() * 1000 / durationMs).toInt()
                    updateTime(position)
                }
                if (p.isPlaying) ui.postDelayed(this, 400) else refreshPlayButton()
            } catch (_: Exception) { }
        }
    }

    private fun releasePlayer() {
        ui.removeCallbacks(progressTick)
        effects?.release()
        effects = null
        try { player?.release() } catch (_: Exception) { }
        player = null
        prepared = false
        durationMs = 0
        playButton.isEnabled = false
        backTen.isEnabled = false
        forwardTen.isEnabled = false
        positionSeek.isEnabled = false
        refreshPlayButton()
    }

    private fun applyVolume() {
        if (!prepared) return
        val gains = SoundMath.channelGains(volumePercent, balance)
        try { player?.setVolume(gains.left, gains.right) } catch (_: Exception) { }
    }

    private fun runChannelTest(side: ChannelTester.Side) {
        stopChannelTest()
        pausePlayback()
        abandonFocus()
        if (!acquireFocus()) {
            toast(getString(R.string.audio_focus_error))
            return
        }
        val generation = ++testGeneration
        val started = tester.play(side) {
            ui.post {
                if (generation == testGeneration && visible) {
                    testing = false
                    abandonFocus()
                    setStatus(if (prepared) R.string.status_paused else R.string.status_no_file)
                    toast(getString(R.string.test_finished))
                }
            }
        }
        if (started) {
            testing = true
            setStatus(R.string.status_test)
        } else {
            abandonFocus()
            toast(getString(R.string.test_failed))
        }
    }

    private fun stopChannelTest() {
        testGeneration++
        tester.stop()
        if (testing) {
            testing = false
            setStatus(if (prepared) R.string.status_paused else R.string.status_no_file)
        }
    }

    @Suppress("DEPRECATION")
    private fun acquireFocus(): Boolean = try {
        val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioManager.requestAudioFocus(focusRequest!!)
        } else {
            audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        }
        result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    } catch (_: Exception) { false }

    @Suppress("DEPRECATION")
    private fun abandonFocus() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) audioManager.abandonAudioFocusRequest(focusRequest!!)
            else audioManager.abandonAudioFocus(focusListener)
        } catch (_: Exception) { }
    }

    private fun updateEffectControls() {
        val fx = effects
        val widthAvailable = fx?.virtualAvailable == true
        widthSeek.isEnabled = widthAvailable
        widthPresets.forEach { it.isEnabled = widthAvailable }
        bassSeek.isEnabled = fx?.bassAvailable == true
        buildEqualizerUi() // An unavailable EQ must not disable an available bass or virtualizer.
    }

    private fun buildEqualizerUi() {
        eqContainer.removeAllViews()
        val fx = effects
        if (fx == null || !fx.eqAvailable) {
            eqNote.setText(if (prepared) R.string.eq_unsupported else R.string.eq_waiting)
            eqReset.visibility = View.GONE
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
                text = if (hz > 0) getString(R.string.eq_band, hz) else getString(R.string.eq_band_fallback, band + 1)
                textSize = 13f
                setTextColor(ContextCompat.getColor(context, R.color.brand_ink))
                setTypeface(typeface, Typeface.BOLD)
                setPadding(0, dp(10), 0, 0)
            }
            val seek = SeekBar(this).apply {
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48))
                layoutDirection = View.LAYOUT_DIRECTION_LTR
                progressDrawable = ContextCompat.getDrawable(context, R.drawable.comic_seek_track)
                thumb = ContextCompat.getDrawable(context, R.drawable.comic_seek_thumb)
                splitTrack = false
                max = span
                progress = (level - range.first).coerceIn(0, span)
                contentDescription = label.text
                setOnSeekBarChangeListener(simpleListener { value ->
                    val milliBel = range.first + value
                    fx.setBandLevel(band, milliBel)
                    prefs.edit().putInt("eq_band_$band", milliBel).apply()
                })
            }
            eqContainer.addView(label)
            eqContainer.addView(seek)
            if (saved != Int.MIN_VALUE) fx.setBandLevel(band, saved)
        }
    }

    private fun updateLabels() {
        widthLabel.text = when {
            effects?.virtualAvailable == true -> getString(R.string.width_label, widthPercent)
            prepared -> getString(R.string.width_unsupported)
            else -> getString(R.string.width_waiting)
        }
        balanceLabel.text = getString(R.string.balance_label, when {
            abs(balance) < 5 -> getString(R.string.balance_center)
            balance < 0 -> getString(R.string.balance_left, -balance)
            else -> getString(R.string.balance_right, balance)
        })
        volumeLabel.text = getString(R.string.volume_label, volumePercent)
        bassLabel.text = when {
            effects?.bassAvailable == true -> getString(R.string.bass_label, bassPercent)
            prepared -> getString(R.string.bass_unsupported)
            else -> getString(R.string.bass_waiting)
        }
    }

    private fun syncSliders() {
        widthSeek.progress = SoundMath.widthProgress(widthPercent)
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
        prefs.edit().putInt(KEY_WIDTH, widthPercent).putInt(KEY_BALANCE, balance)
            .putInt(KEY_VOLUME, volumePercent).putInt(KEY_BASS, bassPercent).apply()
    }
    private fun setStatus(id: Int) { statusText.setText(id) }
    private fun toast(text: String) { Toast.makeText(this, text, Toast.LENGTH_SHORT).show() }
    private fun isPlaying(p: MediaPlayer): Boolean = try { p.isPlaying } catch (_: Exception) { false }
    private fun safeDuration(p: MediaPlayer): Int = try { p.duration.coerceAtLeast(0) } catch (_: Exception) { 0 }
    private fun updateTime(position: Int) { timeText.text = formatTime(position) + " / " + formatTime(durationMs) }
    private fun formatTime(ms: Int): String {
        val seconds = ms.coerceAtLeast(0) / 1000
        return String.format(Locale.US, "%d:%02d", seconds / 60, seconds % 60)
    }
    private fun displayName(uri: Uri): String? = try {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (!cursor.moveToFirst()) null else {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index < 0) null else cursor.getString(index)
            }
        }
    } catch (_: Exception) { null }
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val PREFS = "stereo_settings"
        const val KEY_WIDTH = "width"
        const val KEY_BALANCE = "balance"
        const val KEY_VOLUME = "volume"
        const val KEY_BASS = "bass"
    }
}
