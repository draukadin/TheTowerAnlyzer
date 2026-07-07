package com.pphi.tower.web;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pphi.tower.config.AwsProperties;
import com.pphi.tower.config.SetupStateService;
import com.pphi.tower.service.ClaudeSkillsService;
import com.pphi.tower.service.DdbVersionSyncService;
import com.pphi.tower.util.AppDirectories;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api/setup")
public class SetupController {

    private final SetupStateService setupState;
    private final AwsProperties aws;
    private final ClaudeSkillsService claudeSkillsService;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private DdbVersionSyncService ddbVersionSync;

    public SetupController(
            final SetupStateService setupState,
            final AwsProperties aws,
            final ClaudeSkillsService claudeSkillsService,
            final ObjectMapper objectMapper) {
        this.setupState = setupState;
        this.aws = aws;
        this.claudeSkillsService = claudeSkillsService;
        this.objectMapper = objectMapper;
    }

    Path dataDir() {
        return AppDirectories.dataDir();
    }

    // The user's Downloads folder (%USERPROFILE%\Downloads), where exported skill
    // zips are written so they are easy to find and delete after upload.
    Path downloadsDir() {
        return Path.of(System.getProperty("user.home"), "Downloads");
    }

    @GetMapping("/status")
    public Map<String, String> status() {
        return Map.of("step", setupState.currentStep().name().toLowerCase());
    }

    @PostMapping("/config")
    public ResponseEntity<Map<String, String>> saveConfig(
            @SuppressWarnings("ClassEscapesDefinedScope") @RequestBody ConfigRequest req) throws IOException {
        if (req.playerId() == null || req.playerId().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Player ID is required."));
        }
        if (req.apiGatewayRegion() == null || !List.of("us", "eu", "ap").contains(req.apiGatewayRegion())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Region must be one of: us, eu, ap."));
        }

        aws.setPlayerId(req.playerId());
        aws.getApiGateway().setRegion(req.apiGatewayRegion());

        Path dir = dataDir();
        Files.createDirectories(dir);
        String props = String.join(System.lineSeparator(),
                "",
                "aws.player-id=" + req.playerId(),
                "aws.api-gateway.region=" + req.apiGatewayRegion(),
                ""
        );
        Files.writeString(dir.resolve("user.properties"), props, StandardOpenOption.CREATE, StandardOpenOption.APPEND);

        if (ddbVersionSync != null) {
            ddbVersionSync.syncLatestVersion();
        }

        return ResponseEntity.ok(Map.of("step", "complete"));
    }

    @PostMapping("/mcp")
    public ResponseEntity<Map<String, String>> setupMcp() {
        Path mcpDir = getMcpDir();

        Path nodeExe  = mcpDir.resolve(AppDirectories.exeName("node"));
        Path serverJs = mcpDir.resolve("server.js");

        if (!Files.exists(nodeExe) || !Files.exists(serverJs)) {
            // Not running from the installed bundle (e.g. dev mode).
            // Skills can still be installed independently of the MCP server files.
            int status = claudeSkillsService.installBundledSkills();
            if (status == 0) {
                return ResponseEntity.ok(Map.of("status", "not_found"));
            } else {
                return ResponseEntity.ok(Map.of("status", "ok"));
            }
        }

        // Try Claude Code CLI first, then fall back to Claude Desktop App config file
        try {
            String claudeCli = resolveClaudePath();
            if (claudeCli != null) {
                ResponseEntity<Map<String, String>> result = registerViaCli(claudeCli, nodeExe, serverJs);
                if ("ok".equals(result.getBody() != null ? result.getBody().get("status") : null)) {
                    claudeSkillsService.installBundledSkills();
                }
                return result;
            }
        } catch (IOException e) {
            // CLI not available — fall through to Desktop config
        }

        Path desktopConfig = resolveDesktopConfigPath();
        if (desktopConfig != null) {
            ResponseEntity<Map<String, String>> result = registerViaDesktopConfig(desktopConfig, nodeExe, serverJs);
            if ("ok".equals(result.getBody() != null ? result.getBody().get("status") : null)) {
                claudeSkillsService.installBundledSkills();
            }
            return result;
        }

        return ResponseEntity.ok(Map.of("status", "claude_not_found"));
    }

    /**
     * Exports the bundled skills as one zip per skill to the user's
     * {@code Downloads\TheTowerAnalyzer-skills\} folder, for manual upload to the
     * Claude Desktop / claude.ai "Customize → Skills" UI (which does not read
     * {@code ~/.claude/skills/}). Downloads is used so the zips are easy to find;
     * they are throwaway once uploaded. The upload itself is a manual web step and
     * cannot be automated locally.
     */
    @PostMapping("/skill-packages")
    public ResponseEntity<Map<String, Object>> exportSkillPackages() {
        Path targetDir = downloadsDir().resolve("TheTowerAnalyzer-skills");
        List<Path> written = claudeSkillsService.exportSkillPackages(targetDir);
        if (written.isEmpty()) {
            return ResponseEntity.ok(Map.of(
                    "status", "error",
                    "message", "No skill packages could be exported."));
        }
        List<String> names = written.stream()
                .map(p -> p.getFileName().toString())
                .sorted()
                .toList();
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "directory", targetDir.toString(),
                "packages", names));
    }

    // jpackage bundles the JRE at <install>/runtime, so java.home -> <install>/mcp
    private Path getMcpDir() {
        return Path.of(System.getProperty("java.home")).getParent().resolve("mcp");
    }

    // Resolve the claude CLI path. Checks PATH via where.exe/which (exit-code gated) then
    // known install locations, since the jpackage launcher may not inherit full user PATH.
    private String resolveClaudePath() throws IOException {
        try {
            String lookupCmd = AppDirectories.isWindows() ? "where.exe" : "which";
            Process where = new ProcessBuilder(lookupCmd, "claude")
                    .redirectErrorStream(true).start();
            String result = new String(where.getInputStream().readAllBytes()).trim();
            int exit = where.waitFor();
            if (exit == 0 && !result.isBlank()) {
                return result.lines().findFirst().orElse(null);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        List<Path> candidates = new ArrayList<>();
        if (AppDirectories.isWindows()) {
            String appData   = System.getenv("APPDATA");
            String localData = System.getenv("LOCALAPPDATA");
            if (appData != null) {
                candidates.add(Path.of(appData, "npm", "claude.cmd"));
                candidates.add(Path.of(appData, "npm", "claude"));
            }
            if (localData != null) {
                candidates.add(Path.of(localData, "Programs", "claude", "claude.exe"));
            }
        } else {
            String home = System.getProperty("user.home");
            candidates.add(Path.of("/opt/homebrew/bin/claude"));
            candidates.add(Path.of("/usr/local/bin/claude"));
            candidates.add(Path.of("/usr/bin/claude"));
            candidates.add(Path.of(home, ".npm-global", "bin", "claude"));
            candidates.add(Path.of(home, ".local", "bin", "claude"));
        }
        for (Path candidate : candidates) {
            if (Files.exists(candidate)) return candidate.toString();
        }
        return null;
    }

    // Locate the Claude Desktop App config file. On Windows, checks the standard Electron
    // path first, then MSIX/Windows Store virtualized AppData (AnthropicPBC.Claude_* package
    // family). On macOS/Linux, checks the platform's standard app-support location.
    private Path resolveDesktopConfigPath() {
        if (!AppDirectories.isWindows()) {
            Path standard = AppDirectories.isMac()
                    ? Path.of(System.getProperty("user.home"), "Library", "Application Support", "Claude")
                    : Path.of(System.getProperty("user.home"), ".config", "Claude");
            return Files.exists(standard) ? standard.resolve("claude_desktop_config.json") : null;
        }

        String appData   = System.getenv("APPDATA");
        String localData = System.getenv("LOCALAPPDATA");

        if (appData != null) {
            Path standard = Path.of(appData, "Claude");
            if (Files.exists(standard)) {
                return standard.resolve("claude_desktop_config.json");
            }
        }

        if (localData != null) {
            Path packages = Path.of(localData, "Packages");
            if (Files.exists(packages)) {
                try {
                    try (Stream<Path> list = Files.list(packages)) {
                        return list
                                .filter(p -> p.getFileName().toString().toLowerCase().contains("claude"))
                                .map(p -> p.resolve("LocalCache").resolve("Roaming").resolve("Claude"))
                                .filter(Files::exists)
                                .findFirst()
                                .map(p -> p.resolve("claude_desktop_config.json"))
                                .orElse(null);
                    }
                } catch (IOException ignored) {}
            }
        }
        return null;
    }

    private ResponseEntity<Map<String, String>> registerViaCli(String claudePath, Path nodeExe, Path serverJs) {
        try {
            Process p = new ProcessBuilder(
                    claudePath, "mcp", "add", "tower-analyzer",
                    "--", nodeExe.toString(), serverJs.toString()
            ).redirectErrorStream(true).start();

            String output = new String(p.getInputStream().readAllBytes());
            int exit = p.waitFor();

            if (exit == 0) {
                return ResponseEntity.ok(Map.of("status", "ok"));
            }
            return ResponseEntity.ok(Map.of("status", "error", "message", output.isBlank()
                    ? "claude mcp add exited with code " + exit
                    : output.strip()));
        } catch (IOException e) {
            return ResponseEntity.ok(Map.of("status", "claude_not_found", "message", "tried: " + claudePath));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return ResponseEntity.internalServerError()
                    .body(Map.of("status", "error", "message", "Interrupted."));
        }
    }

    @SuppressWarnings("unchecked")
    private ResponseEntity<Map<String, String>> registerViaDesktopConfig(Path configFile, Path nodeExe, Path serverJs) {
        try {
            Map<String, Object> config;
            if (Files.exists(configFile)) {
                config = new HashMap<>(objectMapper.readValue(configFile.toFile(),
                        new TypeReference<Map<String, Object>>() {}));
            } else {
                config = new HashMap<>();
            }

            Map<String, Object> mcpServers = new HashMap<>(
                    (Map<String, Object>) config.getOrDefault("mcpServers", new HashMap<>()));
            mcpServers.put("tower-analyzer", Map.of(
                    "command", nodeExe.toString(),
                    "args", List.of(serverJs.toString())
            ));
            config.put("mcpServers", mcpServers);

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(configFile.toFile(), config);
            return ResponseEntity.ok(Map.of("status", "ok"));
        } catch (IOException e) {
            return ResponseEntity.ok(Map.of("status", "error", "message", "Could not write Claude Desktop config: " + e.getMessage()));
        }
    }

    record ConfigRequest(String playerId, String apiGatewayRegion) {}
}