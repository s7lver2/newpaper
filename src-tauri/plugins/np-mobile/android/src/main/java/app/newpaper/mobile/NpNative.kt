package app.newpaper.mobile

/** Funciones exportadas por `np-app` (src-tauri/src/mobile/adblock_jni.rs) con JNI. */
object NpNative {
    @JvmStatic external fun shouldBlock(url: String, sourceUrl: String, type: String): Boolean

    /** Cambio de red: reinicia Tor si está en uso (src-tauri/src/mobile/net_jni.rs). */
    @JvmStatic external fun networkChanged()
}
