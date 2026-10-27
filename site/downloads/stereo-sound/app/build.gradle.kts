plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The release key is supplied outside the repository. Without all four values,
// release output is deliberately unsigned; a debug key is NEVER used for release.
val releaseStore = providers.environmentVariable("STEREO_KEYSTORE_FILE").orNull
val releaseStorePassword = providers.environmentVariable("STEREO_KEYSTORE_PASSWORD").orNull
val releaseAlias = providers.environmentVariable("STEREO_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("STEREO_KEY_PASSWORD").orNull
val signingValues = listOf(releaseStore, releaseStorePassword, releaseAlias, releaseKeyPassword)
require(signingValues.all { it.isNullOrBlank() } || signingValues.all { !it.isNullOrBlank() }) {
    "Supply all four STEREO_KEYSTORE_* / STEREO_KEY_* variables to sign a release."
}
val canSignRelease = signingValues.all { !it.isNullOrBlank() }

android {
    namespace = "com.zynq.stereosound"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.zynq.stereosound"
        minSdk = 23
        targetSdk = 36
        versionCode = providers.gradleProperty("stereoVersionCode").orElse("3").get().toInt()
        versionName = providers.gradleProperty("stereoVersionName").orElse("2.0.0").get()
    }

    if (canSignRelease) {
        signingConfigs {
            create("release") {
                storeFile = file(releaseStore!!)
                storePassword = releaseStorePassword
                keyAlias = releaseAlias
                keyPassword = releaseKeyPassword
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (canSignRelease) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    testImplementation("junit:junit:4.13.2")
}
