package com.pphi.tower.parser;

public class DiagnosticLogger {

    private final boolean enabled;

    public DiagnosticLogger(boolean enabled) {
        this.enabled = enabled;
    }

    public void printDiagnostic(final String format, final Object... args) {
        if (enabled) {
            System.out.printf(format, args);
        }
    }
}

