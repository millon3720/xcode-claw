#!/usr/bin/env python3
"""
xcode-claw — main CLI dispatcher.
"""

import typer
from typing import Optional

app = typer.Typer(
    name="xcode-claw",
    help="Xcode & Apple platform skill for OpenClaw",
    no_args_is_help=True,
)

sim_app   = typer.Typer(help="Simulator management (simctl)")
certs_app = typer.Typer(help="Code signing certificates")
prof_app  = typer.Typer(help="Provisioning profiles")

app.add_typer(sim_app,   name="sim")
app.add_typer(certs_app, name="certs")
app.add_typer(prof_app,  name="profiles")


# ── Build / Test / Archive ─────────────────────────────────────────────────────

@app.command("build")
def build(
    project:     Optional[str] = typer.Option(None, "--project", "-p", help=".xcodeproj or .xcworkspace path"),
    scheme:      Optional[str] = typer.Option(None, "--scheme",  "-s", help="Scheme name"),
    config:      str           = typer.Option("Debug",           help="Build configuration"),
    sdk:         Optional[str] = typer.Option(None,              help="SDK (iphonesimulator, iphoneos, macosx)"),
    destination: Optional[str] = typer.Option(None, "--dest",    help="xcodebuild -destination string"),
    no_sign:     bool          = typer.Option(False, "--no-sign", help="Skip code signing"),
):
    """Build a project scheme."""
    from scripts.build import cmd_build
    cmd_build(project, scheme, config, sdk, destination, no_sign)


@app.command("test")
def test(
    project:     Optional[str] = typer.Option(None, "--project", "-p"),
    scheme:      Optional[str] = typer.Option(None, "--scheme",  "-s"),
    destination: Optional[str] = typer.Option(None, "--dest",    help="e.g. 'platform=iOS Simulator,name=iPhone 15'"),
    result_path: Optional[str] = typer.Option(None, "--result-path", help="Path to write .xcresult bundle"),
):
    """Run the test suite."""
    from scripts.build import cmd_test
    cmd_test(project, scheme, destination, result_path)


@app.command("clean")
def clean(
    project: Optional[str] = typer.Option(None, "--project", "-p"),
    scheme:  Optional[str] = typer.Option(None, "--scheme",  "-s"),
):
    """Clean build artifacts and derived data."""
    from scripts.build import cmd_clean
    cmd_clean(project, scheme)


@app.command("archive")
def archive(
    project:     Optional[str] = typer.Option(None, "--project", "-p"),
    scheme:      Optional[str] = typer.Option(None, "--scheme",  "-s"),
    output:      Optional[str] = typer.Option(None, "--output",  "-o", help="Archive output path (.xcarchive)"),
    export_plist:Optional[str] = typer.Option(None, "--export-plist", help="ExportOptions.plist for IPA export"),
):
    """Archive the app for distribution."""
    from scripts.build import cmd_archive
    cmd_archive(project, scheme, output, export_plist)


# ── Project Inspection ─────────────────────────────────────────────────────────

@app.command("info")
def info(
    project: Optional[str] = typer.Option(None, "--project", "-p"),
):
    """List schemes, targets, and configurations."""
    from scripts.inspect import cmd_info
    cmd_info(project)


@app.command("settings")
def settings(
    project: Optional[str] = typer.Option(None, "--project", "-p"),
    scheme:  Optional[str] = typer.Option(None, "--scheme",  "-s"),
    config:  str           = typer.Option("Debug", help="Build configuration"),
):
    """Show build settings for a scheme."""
    from scripts.inspect import cmd_settings
    cmd_settings(project, scheme, config)


@app.command("swift-version")
def swift_version():
    """Show active Swift and Xcode toolchain versions."""
    from scripts.inspect import cmd_swift_version
    cmd_swift_version()


# ── Simulators ─────────────────────────────────────────────────────────────────

@sim_app.command("list")
def sim_list(
    filter: Optional[str] = typer.Option(None, help="Filter by name or OS"),
    available: bool = typer.Option(True, help="Show only available simulators"),
):
    """List simulators with their state."""
    from scripts.simulators import cmd_list
    cmd_list(filter, available)


@sim_app.command("boot")
def sim_boot(udid: str = typer.Argument(..., help="Simulator UDID")):
    """Boot a simulator."""
    from scripts.simulators import cmd_boot
    cmd_boot(udid)


@sim_app.command("shutdown")
def sim_shutdown(udid: str = typer.Argument(..., help="Simulator UDID")):
    """Shutdown a simulator."""
    from scripts.simulators import cmd_shutdown
    cmd_shutdown(udid)


@sim_app.command("install")
def sim_install(
    udid: str = typer.Argument(..., help="Simulator UDID"),
    app:  str = typer.Argument(..., help="Path to .app bundle"),
):
    """Install an .app bundle on a simulator."""
    from scripts.simulators import cmd_install
    cmd_install(udid, app)


@sim_app.command("launch")
def sim_launch(
    udid:      str = typer.Argument(..., help="Simulator UDID"),
    bundle_id: str = typer.Argument(..., help="Bundle identifier"),
):
    """Launch an app on a simulator."""
    from scripts.simulators import cmd_launch
    cmd_launch(udid, bundle_id)


@sim_app.command("screenshot")
def sim_screenshot(
    udid:   str           = typer.Argument(..., help="Simulator UDID"),
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output file path"),
):
    """Capture a screenshot from a simulator."""
    from scripts.simulators import cmd_screenshot
    cmd_screenshot(udid, output)


# ── Signing ────────────────────────────────────────────────────────────────────

@certs_app.command("list")
def certs_list(
    kind: str = typer.Option("codesigning", help="Certificate type to show"),
):
    """List installed code signing certificates."""
    from scripts.signing import cmd_certs_list
    cmd_certs_list(kind)


@prof_app.command("list")
def profiles_list(
    expired: bool = typer.Option(False, "--expired", help="Show only expired profiles"),
):
    """List provisioning profiles."""
    from scripts.signing import cmd_profiles_list
    cmd_profiles_list(expired)


@prof_app.command("clean")
def profiles_clean():
    """Remove expired provisioning profiles."""
    from scripts.signing import cmd_profiles_clean
    cmd_profiles_clean()


# ── Diagnostics ────────────────────────────────────────────────────────────────

@app.command("doctor")
def doctor():
    """Run a full health check on Xcode, CLT, simulators, and signing."""
    from scripts.doctor import cmd_doctor
    cmd_doctor()


@app.command("logs")
def logs(
    udid:   str           = typer.Argument(..., help="Simulator or device UDID"),
    filter: Optional[str] = typer.Option(None, help="Grep filter for log output"),
):
    """Stream logs from a simulator or device."""
    from scripts.simulators import cmd_logs
    cmd_logs(udid, filter)


if __name__ == "__main__":
    app()
