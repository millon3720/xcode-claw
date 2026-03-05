#!/usr/bin/env node
/**
 * xcode-claw MCP server
 * Bridges OpenClaw / Claude Desktop to the Python Xcode skill via subprocess.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, "..");
const PYTHON_CLI = path.join(SKILL_ROOT, "scripts", "xcode_claw.py");

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  // Build
  {
    name: "xcode_build",
    description: "Build an Xcode project or workspace scheme.",
    inputSchema: {
      type: "object",
      properties: {
        project:     { type: "string", description: ".xcodeproj or .xcworkspace path (auto-detected if omitted)" },
        scheme:      { type: "string", description: "Scheme name" },
        config:      { type: "string", description: "Build configuration: Debug or Release (default: Debug)" },
        sdk:         { type: "string", description: "SDK: iphonesimulator, iphoneos, macosx" },
        destination: { type: "string", description: "xcodebuild -destination string" },
        no_sign:     { type: "boolean", description: "Skip code signing (default: false)" },
      },
    },
  },
  {
    name: "xcode_test",
    description: "Run the test suite for an Xcode project.",
    inputSchema: {
      type: "object",
      properties: {
        project:     { type: "string" },
        scheme:      { type: "string" },
        destination: { type: "string", description: "e.g. 'platform=iOS Simulator,name=iPhone 15'" },
        result_path: { type: "string", description: "Path to write .xcresult bundle" },
      },
    },
  },
  {
    name: "xcode_clean",
    description: "Clean build artifacts and derived data for an Xcode project.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        scheme:  { type: "string" },
      },
    },
  },
  {
    name: "xcode_archive",
    description: "Archive an Xcode project for distribution (App Store / Ad Hoc).",
    inputSchema: {
      type: "object",
      properties: {
        project:      { type: "string" },
        scheme:       { type: "string" },
        output:       { type: "string", description: "Output .xcarchive path" },
        export_plist: { type: "string", description: "ExportOptions.plist path for IPA export" },
      },
    },
  },
  // Inspection
  {
    name: "xcode_info",
    description: "List schemes, targets, and configurations for an Xcode project.",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string" } },
    },
  },
  {
    name: "xcode_settings",
    description: "Show build settings for an Xcode project scheme.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        scheme:  { type: "string" },
        config:  { type: "string", description: "Build configuration (default: Debug)" },
      },
    },
  },
  {
    name: "xcode_swift_version",
    description: "Show the active Swift, Xcode, and Command Line Tools versions.",
    inputSchema: { type: "object", properties: {} },
  },
  // Simulators
  {
    name: "xcode_sim_list",
    description: "List available simulators with their current state.",
    inputSchema: {
      type: "object",
      properties: {
        filter:    { type: "string", description: "Filter by name or OS version" },
        available: { type: "boolean", description: "Show only available simulators (default: true)" },
      },
    },
  },
  {
    name: "xcode_sim_boot",
    description: "Boot a simulator by UDID.",
    inputSchema: {
      type: "object",
      required: ["udid"],
      properties: { udid: { type: "string" } },
    },
  },
  {
    name: "xcode_sim_shutdown",
    description: "Shutdown a running simulator.",
    inputSchema: {
      type: "object",
      required: ["udid"],
      properties: { udid: { type: "string" } },
    },
  },
  {
    name: "xcode_sim_install",
    description: "Install an .app bundle on a simulator.",
    inputSchema: {
      type: "object",
      required: ["udid", "app"],
      properties: {
        udid: { type: "string" },
        app:  { type: "string", description: "Path to .app bundle" },
      },
    },
  },
  {
    name: "xcode_sim_launch",
    description: "Launch an installed app on a simulator.",
    inputSchema: {
      type: "object",
      required: ["udid", "bundle_id"],
      properties: {
        udid:      { type: "string" },
        bundle_id: { type: "string", description: "Bundle identifier (e.g. com.example.MyApp)" },
      },
    },
  },
  {
    name: "xcode_sim_screenshot",
    description: "Take a screenshot from a simulator.",
    inputSchema: {
      type: "object",
      required: ["udid"],
      properties: {
        udid:   { type: "string" },
        output: { type: "string", description: "Output file path (default: Desktop)" },
      },
    },
  },
  // Signing
  {
    name: "xcode_certs_list",
    description: "List installed code signing certificates in the keychain.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Certificate type (default: codesigning)" },
      },
    },
  },
  {
    name: "xcode_profiles_list",
    description: "List installed provisioning profiles.",
    inputSchema: {
      type: "object",
      properties: {
        expired: { type: "boolean", description: "Show only expired profiles" },
      },
    },
  },
  {
    name: "xcode_profiles_clean",
    description: "Remove all expired provisioning profiles.",
    inputSchema: { type: "object", properties: {} },
  },
  // Diagnostics
  {
    name: "xcode_doctor",
    description: "Run a full health check on Xcode, CLT, simulators, and code signing.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "xcode_logs",
    description: "Stream logs from a simulator or device.",
    inputSchema: {
      type: "object",
      required: ["udid"],
      properties: {
        udid:   { type: "string" },
        filter: { type: "string", description: "Grep filter string" },
      },
    },
  },
];

// ── CLI runner ────────────────────────────────────────────────────────────────

async function runCLI(args: string[]): Promise<string> {
  const uvArgs = ["run", "python", PYTHON_CLI, ...args];
  try {
    const { stdout, stderr } = await execFileAsync("uv", uvArgs, {
      cwd: SKILL_ROOT,
      env: { ...process.env },
      timeout: 600_000,
    });
    return stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
  } catch (err: any) {
    return `Error: ${err.message}\n${err.stderr ?? ""}`;
  }
}

// ── Tool dispatcher ───────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const s = (k: string) => String(args[k] ?? "");
  const flag = (k: string, f: string) => args[k] ? [f, s(k)] : [];

  switch (name) {
    case "xcode_build": {
      const a = ["build", ...flag("project", "--project"), ...flag("scheme", "--scheme"),
        "--config", s("config") || "Debug", ...flag("sdk", "--sdk"),
        ...flag("destination", "--dest")];
      if (args.no_sign) a.push("--no-sign");
      return runCLI(a);
    }
    case "xcode_test":
      return runCLI(["test", ...flag("project", "--project"), ...flag("scheme", "--scheme"),
        ...flag("destination", "--dest"), ...flag("result_path", "--result-path")]);

    case "xcode_clean":
      return runCLI(["clean", ...flag("project", "--project"), ...flag("scheme", "--scheme")]);

    case "xcode_archive":
      return runCLI(["archive", ...flag("project", "--project"), ...flag("scheme", "--scheme"),
        ...flag("output", "--output"), ...flag("export_plist", "--export-plist")]);

    case "xcode_info":
      return runCLI(["info", ...flag("project", "--project")]);

    case "xcode_settings":
      return runCLI(["settings", ...flag("project", "--project"), ...flag("scheme", "--scheme"),
        "--config", s("config") || "Debug"]);

    case "xcode_swift_version":
      return runCLI(["swift-version"]);

    case "xcode_sim_list": {
      const a = ["sim", "list"];
      if (args.filter) a.push("--filter", s("filter"));
      if (args.available === false) a.push("--no-available");
      return runCLI(a);
    }
    case "xcode_sim_boot":       return runCLI(["sim", "boot", s("udid")]);
    case "xcode_sim_shutdown":   return runCLI(["sim", "shutdown", s("udid")]);
    case "xcode_sim_install":    return runCLI(["sim", "install", s("udid"), s("app")]);
    case "xcode_sim_launch":     return runCLI(["sim", "launch", s("udid"), s("bundle_id")]);
    case "xcode_sim_screenshot": return runCLI(["sim", "screenshot", s("udid"), ...flag("output", "--output")]);

    case "xcode_certs_list":   return runCLI(["certs", "list", ...flag("kind", "--kind")]);
    case "xcode_profiles_list": {
      const a = ["profiles", "list"];
      if (args.expired) a.push("--expired");
      return runCLI(a);
    }
    case "xcode_profiles_clean": return runCLI(["profiles", "clean"]);
    case "xcode_doctor":         return runCLI(["doctor"]);
    case "xcode_logs":           return runCLI(["logs", s("udid"), ...flag("filter", "--filter")]);

    default:
      return `Unknown tool: ${name}`;
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "xcode-claw", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const result = await callTool(
    req.params.name,
    (req.params.arguments ?? {}) as Record<string, unknown>
  );
  return { content: [{ type: "text", text: result }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
