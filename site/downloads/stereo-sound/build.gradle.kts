// ملف البناء الجذري — لا يحتوي أي إعدادات أندرويد، بل إعلان الإضافات فقط.
// (الإعدادات القديمة كانت تُعلن classpath داخل buildscript ثم تستخدم plugins{}
// في الوحدة، وهذا تعارض يمنع البناء على Gradle الحديث.)
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
