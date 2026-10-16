package app.newpaper

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

class MainActivity : TauriActivity() {
  /**
   * El splash nativo se retira cuando la webview pinta el primer fotograma de la intro (`window.NP_INTRO_READY`, ver
   * src/Splash.tsx). Así el traspaso no tiene salto: el primer fotograma de la intro es la marca fantasma del splash.
   */
  @Volatile private var introReady = false
  private val handler = Handler(Looper.getMainLooper())
  private val startedAt = System.currentTimeMillis()

  override fun onCreate(savedInstanceState: Bundle?) {
    val splash = installSplashScreen()
    splash.setKeepOnScreenCondition { !introReady }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    handler.post(pollIntro)
  }

  private val pollIntro: Runnable = object : Runnable {
    override fun run() {
      if (introReady) return
      // Si la intro no llega a pintarse, el splash no se queda para siempre: a los 6 s se retira.
      if (System.currentTimeMillis() - startedAt > INTRO_TIMEOUT_MS) {
        introReady = true
        return
      }
      val web = findWebView(window.decorView)
      if (web == null) {
        handler.postDelayed(this, POLL_MS)
        return
      }
      web.evaluateJavascript("(window.NP_INTRO_READY === true)") { value ->
        if (value == "true") introReady = true else handler.postDelayed(pollIntro, POLL_MS)
      }
    }
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        findWebView(view.getChildAt(i))?.let { return it }
      }
    }
    return null
  }

  companion object {
    private const val POLL_MS = 16L
    private const val INTRO_TIMEOUT_MS = 6000L
  }
}
