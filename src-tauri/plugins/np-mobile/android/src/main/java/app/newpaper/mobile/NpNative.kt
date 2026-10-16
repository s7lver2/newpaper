package app.newpaper.mobile

/** Funciones exportadas por `np-app` (src-tauri/src/mobile/adblock_jni.rs) con JNI. */
object NpNative {
    @JvmStatic external fun shouldBlock(url: String, sourceUrl: String, type: String): Boolean

    /** Cambio de la red por defecto, con su identificador (`wifi:<handle>`): Rust decide si reinicia Tor (src-tauri/src/mobile/net_jni.rs). */
    @JvmStatic external fun networkChanged(id: String)
}
