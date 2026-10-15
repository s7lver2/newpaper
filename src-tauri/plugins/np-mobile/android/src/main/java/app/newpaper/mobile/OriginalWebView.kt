package app.newpaper.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import java.io.ByteArrayInputStream

/** WebView "original" superpuesta: sin puente JS hacia Tauri, con bloqueo de anuncios por Rust. */
class OriginalWebView(private val activity: Activity, private val onHtml: (String, String) -> Unit) {
    private var root: LinearLayout? = null

    @SuppressLint("SetJavaScriptEnabled")
    fun open(url: String, closeLabel: String, analyzeLabel: String) {
        close()
        val web = WebView(activity)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val type = if (request.isForMainFrame) "document" else "other"
                val source = view.url ?: request.url.toString()
                return if (NpNative.shouldBlock(request.url.toString(), source, type)) {
                    WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
                } else null
            }
        }
        val bar = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setBackgroundColor(Color.parseColor("#F6F4EF"))
        }
        bar.addView(Button(activity).apply {
            text = analyzeLabel
            minHeight = 132
            setOnClickListener {
                web.evaluateJavascript("document.documentElement.outerHTML") { json ->
                    val html = org.json.JSONArray("[$json]").getString(0)
                    onHtml(web.url ?: url, html)
                }
            }
        })
        bar.addView(Button(activity).apply { text = closeLabel; minHeight = 132; setOnClickListener { close() } })
        val col = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.WHITE) }
        col.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        col.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        (activity.window.decorView as FrameLayout).addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root = col
        web.loadUrl(url)
    }

    fun close() {
        root?.let { (it.parent as? ViewGroup)?.removeView(it) }
        root = null
    }
}
