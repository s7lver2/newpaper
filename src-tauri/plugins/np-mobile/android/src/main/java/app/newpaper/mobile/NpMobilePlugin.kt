package app.newpaper.mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.webkit.WebView
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg class KeyArgs { lateinit var key: String; var value: String? = null }
@InvokeArg class Labels { lateinit var close: String; lateinit var analyze: String }
@InvokeArg class OpenArgs { lateinit var url: String; lateinit var labels: Labels }
@InvokeArg class ProxyArgs { lateinit var kind: String; var port: Int = 0 }
@InvokeArg class MulticastArgs { var on: Boolean = false }

@TauriPlugin
class NpMobilePlugin(private val activity: Activity) : Plugin(activity) {
    private val store by lazy { SecureStore(activity) }
    private val original by lazy {
        OriginalWebView(activity) { url, html -> trigger("original-html", JSObject().put("url", url).put("html", html)) }
    }
    private var pending: String? = null
    private var lock: WifiManager.MulticastLock? = null
    /** Falso si Rust pidió un proxy (o el bloqueo) y la webview no pudo aplicarlo: entonces no se abre la webview original. */
    @Volatile private var proxyOk = true

    override fun load(webView: WebView) {
        pending = textOf(activity.intent)
    }

    override fun onNewIntent(intent: Intent) {
        textOf(intent)?.let { pending = it; trigger("share", JSObject().put("text", it)) }
    }

    /** Entrada no fiable (cualquier app puede lanzar el intent): solo texto corto o un enlace http(s). */
    private fun textOf(intent: Intent?): String? = when (intent?.action) {
        Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)?.take(MAX_SHARED_CHARS)
        Intent.ACTION_VIEW -> intent.data?.takeIf { it.scheme == "http" || it.scheme == "https" }?.toString()?.take(MAX_SHARED_CHARS)
        else -> null
    }

    @Command fun pendingShare(invoke: Invoke) {
        val v = pending
        pending = null
        invoke.resolve(JSObject().put("value", v))
    }

    @Command fun secureGet(invoke: Invoke) {
        val a = invoke.parseArgs(KeyArgs::class.java)
        invoke.resolve(JSObject().put("value", store.get(a.key)))
    }

    @Command fun secureSet(invoke: Invoke) {
        val a = invoke.parseArgs(KeyArgs::class.java)
        store.set(a.key, a.value ?: "")
        invoke.resolve()
    }

    @Command fun secureDelete(invoke: Invoke) {
        store.delete(invoke.parseArgs(KeyArgs::class.java).key)
        invoke.resolve()
    }

    @Command fun originalOpen(invoke: Invoke) {
        val a = invoke.parseArgs(OpenArgs::class.java)
        if (!proxyOk) {
            invoke.reject("proxy not applied")
            return
        }
        activity.runOnUiThread {
            original.open(a.url, a.labels.close, a.labels.analyze)
            invoke.resolve()
        }
    }

    @Command fun originalClose(invoke: Invoke) {
        activity.runOnUiThread {
            original.close()
            invoke.resolve()
        }
    }

    /** Solo Rust la llama. `block` apunta a un puerto cerrado: nada sale en directo. */
    @Command fun setProxy(invoke: Invoke) {
        val a = invoke.parseArgs(ProxyArgs::class.java)
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            proxyOk = a.kind == "direct"
            invoke.reject("proxy override not supported")
            return
        }
        proxyOk = a.kind == "direct"
        val ctl = ProxyController.getInstance()
        val done = Runnable { proxyOk = true; invoke.resolve() }
        when (a.kind) {
            "direct" -> ctl.clearProxyOverride({ it.run() }, done)
            "socks" -> ctl.setProxyOverride(ProxyConfig.Builder().addProxyRule("socks5://127.0.0.1:${a.port}").build(), { it.run() }, done)
            else -> ctl.setProxyOverride(ProxyConfig.Builder().addProxyRule("socks5://127.0.0.1:9").build(), { it.run() }, done)
        }
    }

    @Command fun multicast(invoke: Invoke) {
        val on = invoke.parseArgs(MulticastArgs::class.java).on
        val wifi = activity.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        if (on && lock == null) {
            lock = wifi.createMulticastLock("newpaper-mdns").apply { setReferenceCounted(false); acquire() }
        }
        if (!on) {
            lock?.release()
            lock = null
        }
        invoke.resolve()
    }

    private companion object {
        const val MAX_SHARED_CHARS = 8192
    }
}
