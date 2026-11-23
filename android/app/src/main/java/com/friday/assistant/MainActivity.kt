package com.friday.assistant

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import com.friday.assistant.ai.LocalNetAndSearchModule
import com.friday.assistant.bridge.FridayJsBridge
import com.friday.assistant.storage.LocalMemoryDbHelper
import com.friday.assistant.system.DeviceControlModule
import com.friday.assistant.voice.VoiceEngineModule

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var voiceEngine: VoiceEngineModule
    private lateinit var memoryDb: LocalMemoryDbHelper

    private val micPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                emitJs("window.__fridayAndroidEvents?.onListeningState?.(false, 'Microphone permission granted. Tap Mic to speak.');")
            } else {
                emitJs("window.__fridayAndroidEvents?.onListeningState?.(false, 'Microphone permission denied. Type command below or allow Mic in Android Settings.');")
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        memoryDb = LocalMemoryDbHelper(this)
        val deviceControl = DeviceControlModule(this)
        val netAndSearch = LocalNetAndSearchModule(this)
        voiceEngine = VoiceEngineModule(
            context = this,
            emitJsEvent = { script -> emitJs(script) },
            onRequestMicPermission = { micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) }
        )

        val bridge = FridayJsBridge(voiceEngine, deviceControl, memoryDb, netAndSearch)
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
        }

        webView.addJavascriptInterface(bridge, "fridayAndroid")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.grant(request.resources)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                if (url.startsWith("https://appassets.androidplatform.net/")) {
                    return false
                }
                if (url.startsWith("https://") || url.startsWith("http://")) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    } catch (_: Exception) {
                    }
                    return true
                }
                return false
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
    }

    private fun emitJs(script: String) {
        runOnUiThread {
            if (::webView.isInitialized) {
                webView.evaluateJavascript(script, null)
            }
        }
    }

    override fun onDestroy() {
        if (::voiceEngine.isInitialized) {
            voiceEngine.shutdown()
        }
        if (::memoryDb.isInitialized) {
            memoryDb.close()
        }
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }
}
