package app.newpaper.mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.util.Log
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
@InvokeArg class BarsArgs { var dark: Boolean = false }

@TauriPlugin
class NpMobilePlugin(private val activity: Activity) : Plugin(activity) {
    private val store by lazy { SecureStore(activity) }
    private val original by lazy {
        OriginalWebView(activity, { url, html -> trigger("original-html", JSObject().put("url", url).put("html", html)) }, { trigger("original-closed", JSObject()) })
    }
    private var pending: String? = null
    private var lock: WifiManager.MulticastLock? = null
    /** Falso si Rust pidió un proxy (o el bloqueo) y la webview no pudo aplicarlo: entonces no se abre la webview original. */
    @Volatile private var proxyOk = true

    override fun load(webView: WebView) {
        pending = textOf(activity.intent)
        watchNetwork()
    }

    /**
     * Cambio de la red por defecto. Solo avisa a Rust cuando cambia la identidad de la red validada (manejador de red +
     * transporte), no con el ruido de capacidades (intensidad de señal, ancho de banda, enlaces) que en dispositivos
     * reales llega varias veces por segundo. Rust decide además si reinicia Tor y cuándo (red calmada).
     */
    private fun watchNetwork() {
        val cm = activity.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        var lastKey: String? = null
        val cb = object : ConnectivityManager.NetworkCallback() {
            private fun transportOf(caps: NetworkCapabilities): String = when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cell"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "eth"
                else -> "other"
            }

            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                // Sin salida validada a Internet no sirve de nada reiniciar Tor: se espera a que lo esté.
                if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return
                val key = "${transportOf(caps)}:${network.networkHandle}"
                if (key == lastKey) return
                Log.i("NpMobile", "default network: $key (was $lastKey)")
                lastKey = key
                NpNative.networkChanged(key)
            }

            override fun onLost(network: Network) {
                Log.i("NpMobile", "default network lost: $network (last $lastKey)")
                // No se avisa: sin red no hay nada que reiniciar. La red siguiente llega por onCapabilitiesChanged
                // con otro manejador y reinicia Tor (o la misma red al volver, que se ignora).
            }
        }
        try {
            cm.registerDefaultNetworkCallback(cb)
        } catch (e: SecurityException) {
            // Sin ACCESS_NETWORK_STATE no hay avisos: Tor se reinicia al reanudar la app.
        }
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

    /** Iconos de la barra de estado y de gestos: oscuros sobre papel, claros sobre tinta. Solo Rust la llama. */
    @Command fun systemBars(invoke: Invoke) {
        val dark = invoke.parseArgs(BarsArgs::class.java).dark
        activity.runOnUiThread {
            val c = androidx.core.view.WindowCompat.getInsetsController(activity.window, activity.window.decorView)
            c.isAppearanceLightStatusBars = !dark
            c.isAppearanceLightNavigationBars = !dark
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
        // "block" nunca deja la webview abierta: su proxy apunta a un puerto cerrado.
        val done = Runnable { proxyOk = a.kind != "block"; invoke.resolve() }
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
