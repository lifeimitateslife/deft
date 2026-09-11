"""Exercise the installed DEFT.Document handler through the Windows shell, without changing defaults."""
import ctypes
from ctypes import wintypes as w
import sys

class ShellExecuteInfo(ctypes.Structure):
    _fields_ = [("cbSize", w.DWORD), ("fMask", w.ULONG), ("hwnd", w.HWND),
                ("lpVerb", w.LPCWSTR), ("lpFile", w.LPCWSTR), ("lpParameters", w.LPCWSTR),
                ("lpDirectory", w.LPCWSTR), ("nShow", ctypes.c_int), ("hInstApp", w.HINSTANCE),
                ("lpIDList", ctypes.c_void_p), ("lpClass", w.LPCWSTR), ("hkeyClass", w.HKEY),
                ("dwHotKey", w.DWORD), ("hIcon", w.HANDLE), ("hProcess", w.HANDLE)]
shell = ctypes.WinDLL("shell32", use_last_error=True)
kernel = ctypes.WinDLL("kernel32", use_last_error=True)
shell.ShellExecuteExW.argtypes = [ctypes.POINTER(ShellExecuteInfo)]
shell.ShellExecuteExW.restype = w.BOOL
kernel.GetProcessId.argtypes = [w.HANDLE]
kernel.GetProcessId.restype = w.DWORD
kernel.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
kernel.WaitForSingleObject.restype = w.DWORD
kernel.CloseHandle.argtypes = [w.HANDLE]
wait = "--wait" in sys.argv
for file in [arg for arg in sys.argv[1:] if arg != "--wait"]:
    info = ShellExecuteInfo()
    info.cbSize = ctypes.sizeof(info)
    info.fMask = 0x1 | 0x40 | 0x100  # Class name, process handle, no asynchronous shell dispatch.
    info.lpVerb = "open"
    info.lpFile = file
    info.lpClass = "DEFT.Document"
    info.nShow = 1
    if not shell.ShellExecuteExW(ctypes.byref(info)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        print(kernel.GetProcessId(info.hProcess), flush=True)
        if wait and kernel.WaitForSingleObject(info.hProcess, 5000) != 0:
            raise RuntimeError("Registered-handler invocation did not exit within 5 seconds")
    finally:
        kernel.CloseHandle(info.hProcess)
