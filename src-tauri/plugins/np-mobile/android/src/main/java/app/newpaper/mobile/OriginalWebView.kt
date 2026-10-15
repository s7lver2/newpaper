package app.newpaper.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.ByteArrayInputStream

/** WebView "original" superpuesta: sin puente JS hacia Tauri, con bloqueo de anuncios por Rust. */
class OriginalWebView(private val activity: Activity, private val onHtml: (String, String) -> Unit, private val onClosed: () -> Unit = {}) {
    private var root: LinearLayout? = null
    private var web: WebView? = null
    private val back = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            val w = web
            if (w != null && w.canGoBack()) w.goBack() else close()
        }
    }

    init {
        (activity as? ComponentActivity)?.onBackPressedDispatcher?.addCallback(back)
    }

    private fun px(dp: Int) = (dp * activity.resources.displayMetrics.density).toInt()

    /** Botón plano de la barra superior: texto sin mayúsculas forzadas y sin el relleno gris de Material. */
    private fun flat(b: Button, color: String) {
        b.isAllCaps = false
        b.setBackgroundColor(Color.TRANSPARENT)
        b.setTextColor(Color.parseColor(color))
        b.textSize = 15f
        b.minHeight = px(48)
        b.minimumWidth = px(64)
        b.setPadding(px(16), 0, px(16), 0)
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun open(url: String, closeLabel: String, analyzeLabel: String) {
        close()
        val web = WebView(activity)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        // Página no fiable: sin acceso a ficheros ni a contenido local, sin contenido mixto.
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        web.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        // `WebView.getUrl()` solo vale en el hilo principal y `shouldInterceptRequest` corre en otro: la página actual se guarda aquí.
        val page = java.util.concurrent.atomic.AtomicReference(url)
        web.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, u: String, favicon: android.graphics.Bitmap?) {
                page.set(u)
            }
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val type = if (request.isForMainFrame) "document" else "other"
                val source = if (request.isForMainFrame) request.url.toString() else page.get()
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
            flat(this, "#2F5BD3")
            setOnClickListener {
                web.evaluateJavascript("document.documentElement.outerHTML") { json ->
                    val html = org.json.JSONArray("[$json]").getString(0)
                    onHtml(web.url ?: url, html)
                }
            }
        })
        bar.addView(Button(activity).apply { text = closeLabel; flat(this, "#17171A"); setOnClickListener { close() } })
        val col = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.WHITE) }
        // La actividad va de borde a borde: la barra no debe quedar bajo la barra de estado.
        ViewCompat.setOnApplyWindowInsetsListener(col) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            insets
        }
        col.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        col.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        (activity.window.decorView as FrameLayout).addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root = col
        this.web = web
        back.isEnabled = true
        web.loadUrl(url)
    }

    fun close() {
        back.isEnabled = false
        // Rust cierra el SOCKS de sesión cuando la webview se cierra (botón Cerrar, Atrás): se le avisa solo si estaba abierta.
        val wasOpen = root != null
        root?.let { (it.parent as? ViewGroup)?.removeView(it) }
        root = null
        web?.destroy()
        web = null
        if (wasOpen) onClosed()
    }
}
