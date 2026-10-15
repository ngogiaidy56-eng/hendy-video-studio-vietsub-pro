plugins { application; kotlin("jvm") }
dependencies { implementation(kotlin("stdlib")) }
application { mainClass.set("net.hendystudio.desktop.MainKt") }
