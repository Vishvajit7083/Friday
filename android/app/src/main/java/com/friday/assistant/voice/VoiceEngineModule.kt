package com.friday.assistant.voice

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.Locale

class VoiceEngineModule(
    private val context: Context,
    private val emitJsEvent: (String) -> Unit,
    private val onRequestMicPermission: () -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var speechRecognizer: SpeechRecognizer? = null

    init {
        initTts()
    }

    private fun initTts() {
        tts = TextToSpeech(context.applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {
                        dispatchSpeechState(true)
                    }

                    override fun onDone(utteranceId: String?) {
                        dispatchSpeechState(false)
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        dispatchSpeechState(false)
                    }
                })
            }
        }
    }

    private fun dispatchSpeechState(speaking: Boolean) {
        mainHandler.post {
            emitJsEvent("window.__fridayAndroidEvents?.onSpeechState?.($speaking);")
        }
    }

    private fun selectLocale(languageTag: String): Locale {
        return when (languageTag.lowercase(Locale.ROOT)) {
            "hi-in" -> Locale("hi", "IN")
            "mr-in" -> Locale("mr", "IN")
            "en-in" -> Locale("en", "IN")
            "en-gb" -> Locale.UK
            else -> Locale.forLanguageTag(languageTag).takeIf { it.language.isNotEmpty() } ?: Locale.US
        }
    }

    private fun pickBestVoice(locale: Locale, gender: String): Voice? {
        val available = tts?.voices ?: return null
        val wantFemale = !gender.equals("male", ignoreCase = true)
        val femaleHints = listOf("female", "sfg", "sfp", "iom", "iog", "hi-in-x-hia", "mr-in-x-mrf", "en-us-x-sfg", "en-us-x-tpf")
        val maleHints = listOf("male", "sfb", "tpd", "iom-m", "hi-in-x-hid", "mr-in-x-mrm", "en-us-x-tpd")

        var best: Voice? = null
        var bestScore = Int.MIN_VALUE

        for (v in available) {
            var score = 0
            val vLang = v.locale.language.lowercase(Locale.ROOT)
            val vCountry = v.locale.country.lowercase(Locale.ROOT)
            if (vLang == locale.language.lowercase(Locale.ROOT)) score += 50 else continue
            if (vCountry == locale.country.lowercase(Locale.ROOT)) score += 25
            if (!v.isNetworkConnectionRequired) score += 15
            if (v.quality >= Voice.QUALITY_HIGH) score += 10

            val name = v.name.lowercase(Locale.ROOT)
            val matchesFemale = femaleHints.any { name.contains(it) }
            val matchesMale = maleHints.any { name.contains(it) }
            if (wantFemale && matchesFemale) score += 20
            if (!wantFemale && matchesMale) score += 20

            if (score > bestScore) {
                bestScore = score
                best = v
            }
        }
        return best
    }

    fun speak(text: String, languageTag: String, gender: String, rate: Float, pitch: Float): Boolean {
        val clean = text.trim()
        if (clean.isEmpty()) return false
        val engine = tts ?: return false
        if (!ttsReady) return false

        mainHandler.post {
            val locale = selectLocale(languageTag)
            engine.language = locale
            val bestVoice = pickBestVoice(locale, gender)
            if (bestVoice != null) {
                engine.voice = bestVoice
            }
            engine.setSpeechRate(rate.coerceIn(0.6f, 1.6f))
            engine.setPitch(pitch.coerceIn(0.6f, 1.5f))
            val id = "friday-utt-${System.currentTimeMillis()}"
            engine.speak(clean, TextToSpeech.QUEUE_FLUSH, null, id)
        }
        return true
    }

    fun stopSpeaking(): Boolean {
        mainHandler.post {
            tts?.stop()
            dispatchSpeechState(false)
        }
        return true
    }

    fun startListening(languageTag: String, offlinePreferred: Boolean): Boolean {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (!granted) {
            onRequestMicPermission()
            mainHandler.post {
                val msg = JSONObject.quote("Microphone permission required — please allow audio access.")
                emitJsEvent("window.__fridayAndroidEvents?.onListeningState?.(false, $msg);")
            }
            return false
        }

        mainHandler.post {
            stopSpeaking()
            try {
                speechRecognizer?.destroy()
            } catch (_: Exception) {
            }

            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                val msg = JSONObject.quote("Android Speech Recognition service unavailable on this device.")
                emitJsEvent("window.__fridayAndroidEvents?.onListeningState?.(false, $msg);")
                return@post
            }

            val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
            speechRecognizer = recognizer

            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    val msg = JSONObject.quote("Listening ($languageTag) — speak now...")
                    emitJsEvent("window.__fridayAndroidEvents?.onListeningState?.(true, $msg);")
                }

                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}

                override fun onError(error: Int) {
                    val statusText = when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH -> "No speech matched — tap Mic to try again."
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Listening timed out — tap Mic when ready."
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                            "Speech service offline — enable offline voice pack in Android Settings or type command."
                        else -> "Voice recognition idle (code $error)."
                    }
                    val quoted = JSONObject.quote(statusText)
                    emitJsEvent("window.__fridayAndroidEvents?.onListeningState?.(false, $quoted);")
                }

                override fun onResults(results: Bundle?) {
                    val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val best = list?.firstOrNull()?.trim().orEmpty()
                    if (best.isNotEmpty()) {
                        val quoted = JSONObject.quote(best)
                        emitJsEvent("window.__fridayAndroidEvents?.onRecognizedText?.($quoted);")
                    } else {
                        val quoted = JSONObject.quote("No speech detected.")
                        emitJsEvent("window.__fridayAndroidEvents?.onListeningState?.(false, $quoted);")
                    }
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val list = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val interim = list?.firstOrNull()?.trim().orEmpty()
                    if (interim.isNotEmpty()) {
                        val quoted = JSONObject.quote(interim)
                        emitJsEvent("window.__fridayAndroidEvents?.onInterimText?.($quoted);")
                    }
                }

                override fun onEvent(eventType: Int, params: Bundle?) {}
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                if (offlinePreferred) {
                    putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                }
            }
            recognizer.startListening(intent)
        }
        return true
    }

    fun stopListening(): Boolean {
        mainHandler.post {
            try {
                speechRecognizer?.stopListening()
            } catch (_: Exception) {
            }
            emitJsEvent("window.__fridayAndroidEvents?.onListeningState?.(false, '');")
        }
        return true
    }

    fun shutdown() {
        mainHandler.post {
            try {
                speechRecognizer?.destroy()
                speechRecognizer = null
                tts?.stop()
                tts?.shutdown()
                tts = null
            } catch (_: Exception) {
            }
        }
    }
}
