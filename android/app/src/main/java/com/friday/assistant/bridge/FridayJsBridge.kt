package com.friday.assistant.bridge

import android.webkit.JavascriptInterface
import com.friday.assistant.ai.LocalNetAndSearchModule
import com.friday.assistant.storage.LocalMemoryDbHelper
import com.friday.assistant.system.DeviceControlModule
import com.friday.assistant.voice.VoiceEngineModule

class FridayJsBridge(
    private val voiceEngine: VoiceEngineModule,
    private val deviceControl: DeviceControlModule,
    private val memoryDb: LocalMemoryDbHelper,
    private val netAndSearch: LocalNetAndSearchModule
) {
    @JavascriptInterface
    fun isAndroid(): Boolean = true

    @JavascriptInterface
    fun getDeviceTelemetry(): String = deviceControl.getDeviceTelemetryJson()

    @JavascriptInterface
    fun speak(text: String, language: String, gender: String, rate: Float, pitch: Float): Boolean =
        voiceEngine.speak(text, language, gender, rate, pitch)

    @JavascriptInterface
    fun stopSpeaking(): Boolean = voiceEngine.stopSpeaking()

    @JavascriptInterface
    fun startListening(language: String, offlinePreferred: Boolean): Boolean =
        voiceEngine.startListening(language, offlinePreferred)

    @JavascriptInterface
    fun stopListening(): Boolean = voiceEngine.stopListening()

    @JavascriptInterface
    fun openApp(appQuery: String): String = deviceControl.openApp(appQuery)

    @JavascriptInterface
    fun openSettings(settingKey: String): String = deviceControl.openSettings(settingKey)

    @JavascriptInterface
    fun setFlashlight(enabled: Boolean): String = deviceControl.setFlashlight(enabled)

    @JavascriptInterface
    fun setAlarm(hour: Int, minute: Int, label: String): String =
        deviceControl.setAlarm(hour, minute, label)

    @JavascriptInterface
    fun prepareCallDialer(target: String, confirmed: Boolean): String =
        deviceControl.prepareCallDialer(target, confirmed)

    @JavascriptInterface
    fun openCamera(): String = deviceControl.openCamera()

    @JavascriptInterface
    fun openGallery(): String = deviceControl.openGallery()

    @JavascriptInterface
    fun openMapsSearch(query: String): String = deviceControl.openMapsSearch(query)

    @JavascriptInterface
    fun mediaControl(action: String): String = deviceControl.mediaControl(action)

    @JavascriptInterface
    fun copyToClipboard(text: String): String = deviceControl.copyToClipboard(text)

    @JavascriptInterface
    fun shareText(text: String): String = deviceControl.shareText(text)

    @JavascriptInterface
    fun saveMemoryRecord(kind: String, payloadJson: String): Boolean =
        memoryDb.saveRecord(kind, payloadJson)

    @JavascriptInterface
    fun readMemoryRecords(kind: String): String =
        memoryDb.readRecord(kind)

    @JavascriptInterface
    fun searchWebPublic(query: String): String =
        netAndSearch.searchPublicKnowledge(query)

    @JavascriptInterface
    fun getNetworkOnline(): Boolean =
        netAndSearch.isNetworkOnline()
}
