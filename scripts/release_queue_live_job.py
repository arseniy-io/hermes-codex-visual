"""Run an isolated Windows activation process with its entire process tree scoped."""

import ctypes
from ctypes import wintypes
import subprocess


class Limits(ctypes.Structure):
    _fields_ = [
        ("process_time", ctypes.c_int64), ("job_time", ctypes.c_int64),
        ("flags", wintypes.DWORD), ("min_working", ctypes.c_size_t),
        ("max_working", ctypes.c_size_t), ("max_processes", wintypes.DWORD),
        ("affinity", ctypes.c_size_t), ("priority", wintypes.DWORD),
        ("scheduling", wintypes.DWORD),
    ]


class ExtendedLimits(ctypes.Structure):
    _fields_ = [
        ("limits", Limits), ("io_counters", ctypes.c_uint64 * 6),
        ("process_memory", ctypes.c_size_t), ("job_memory", ctypes.c_size_t),
        ("process_peak", ctypes.c_size_t), ("job_peak", ctypes.c_size_t),
    ]


def _signature(function, result, *arguments):
    function.restype = result
    function.argtypes = arguments
    return function


def run(argv, *, cwd, env, startupinfo, timeout):
    """Start suspended, admit into a non-breakaway Job, then run."""
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    create = _signature(kernel.CreateJobObjectW, wintypes.HANDLE, ctypes.c_void_p, wintypes.LPCWSTR)
    set_limits = _signature(kernel.SetInformationJobObject, wintypes.BOOL, wintypes.HANDLE,
                            wintypes.INT, ctypes.c_void_p, wintypes.DWORD)
    assign = _signature(kernel.AssignProcessToJobObject, wintypes.BOOL, wintypes.HANDLE, wintypes.HANDLE)
    close = _signature(kernel.CloseHandle, wintypes.BOOL, wintypes.HANDLE)
    native = ctypes.WinDLL("ntdll")
    resume = _signature(native.NtResumeProcess, wintypes.LONG, wintypes.HANDLE)
    job = create(None, None)
    if not job:
        raise ctypes.WinError(ctypes.get_last_error())
    proc = None
    try:
        info = ExtendedLimits()
        info.limits.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not set_limits(job, 9, ctypes.byref(info), ctypes.sizeof(info)):
            raise ctypes.WinError(ctypes.get_last_error())
        proc = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                encoding="utf-8", errors="replace", startupinfo=startupinfo,
                                creationflags=0x4 | subprocess.CREATE_NO_WINDOW)
        if not assign(job, int(proc._handle)):
            raise ctypes.WinError(ctypes.get_last_error())
        if resume(int(proc._handle)) != 0:
            raise OSError("Could not resume the private activation process")
        stdout, stderr = proc.communicate(timeout=timeout)
        return subprocess.CompletedProcess(argv, proc.returncode, stdout, stderr)
    finally:
        close(job)
        if proc is not None and proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)
