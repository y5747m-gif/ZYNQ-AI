package com.zynq.stereosound

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.zynq.stereosound.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val engine = StereoAudioEngine()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // طلب إذن تعديل إعدادات الصوت (للتوجيه إلى مخرج استيريو)
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.MODIFY_AUDIO_SETTINGS
            ) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.MODIFY_AUDIO_SETTINGS),
                1
            )
        }

        binding.toggleStereo.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) {
                engine.start(this)
            } else {
                engine.stop()
            }
            binding.status.text = if (isChecked) getString(R.string.status_on) else getString(R.string.status_off)
        }

        binding.balance.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(_: SeekBar, progress: Int, _: Boolean) {
                // rango: -1.0 (يسار completamente) .. +1.0 (يمين completamente)
                engine.balance = (progress - 50) / 50f
            }

            override fun onStartTrackingTouch(_: SeekBar) {}
            override fun onStopTrackingTouch(_: SeekBar) {}
        })
    }

    override fun onDestroy() {
        engine.stop()
        super.onDestroy()
    }
}
