package app.newpaper.mobile

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Claves de API y la identidad de sincronización, cifradas con una clave del Android Keystore. */
class SecureStore(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "newpaper_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    fun get(key: String): String? = prefs.getString(key, null)
    fun set(key: String, value: String) = prefs.edit().putString(key, value).apply()
    fun delete(key: String) = prefs.edit().remove(key).apply()
}
