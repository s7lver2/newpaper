package app.newpaper.mobile

/** Funciones exportadas por `np-app` (src-tauri/src/mobile/adblock_jni.rs) con JNI. */
object NpNative {
    @JvmStatic external fun shouldBlock(url: String, sourceUrl: String, type: String): Boolean
}
