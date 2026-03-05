"""
Subprocess runner with live Rich output and structured result.
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass, field
from typing import Sequence

from rich.console import Console

console = Console()


@dataclass
class RunResult:
    cmd: list[str]
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0

    @property
    def output(self) -> str:
        return (self.stdout + "\n" + self.stderr).strip()


def run(
    cmd: Sequence[str],
    cwd: str | None = None,
    env: dict | None = None,
    live: bool = True,
    timeout: int = 600,
) -> RunResult:
    """
    Run a subprocess. When live=True, stream stdout/stderr to terminal
    in real time while also capturing output.
    """
    import os

    merged_env = {**os.environ, **(env or {})}

    if live:
        proc = subprocess.Popen(
            list(cmd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=cwd,
            env=merged_env,
            text=True,
            bufsize=1,
        )
        captured: list[str] = []
        assert proc.stdout is not None
        for line in proc.stdout:
            captured.append(line)
            console.print(line, end="", markup=False, highlight=False)
        proc.wait(timeout=timeout)
        combined = "".join(captured)
        return RunResult(
            cmd=list(cmd),
            returncode=proc.returncode,
            stdout=combined,
            stderr="",
        )
    else:
        result = subprocess.run(
            list(cmd),
            capture_output=True,
            text=True,
            cwd=cwd,
            env=merged_env,
            timeout=timeout,
        )
        return RunResult(
            cmd=list(cmd),
            returncode=result.returncode,
            stdout=result.stdout,
            stderr=result.stderr,
        )
