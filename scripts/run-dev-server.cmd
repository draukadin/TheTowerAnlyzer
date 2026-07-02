@echo off
set JAVA_HOME=C:\Users\pphi\.jdks\ms-21.0.10
"C:\Program Files\JetBrains\IntelliJ IDEA 2025.3.2\plugins\maven\lib\maven3\bin\mvn.cmd" spring-boot:run "-Dspring-boot.run.jvmArguments=-Djava.awt.headless=true -Dserver.port=8090"
