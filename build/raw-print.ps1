# Sends a file's raw bytes straight to a Windows printer queue via the
# Win32 WritePrinter API (bypassing GDI rendering / page-size negotiation
# entirely) — the standard technique for RAW/ESC-POS printing on Windows
# (Microsoft KB Q322091). Used by main.js's print:raw IPC handler instead
# of webContents.print(), because that path has no way to make the EPSON
# TM-T82III driver accept an arbitrary receipt length without either
# padding blank paper before or after the content — see hero-chrome.js's
# heroPrint() for the full story.
#
# Usage: raw-print.ps1 -PrinterName "<name>" -FilePath "<path to .bin>"

param(
    [Parameter(Mandatory=$true)][string]$PrinterName,
    [Parameter(Mandatory=$true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    [DllImport("winspool.drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    public static void SendBytesToPrinter(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
            throw new Exception("OpenPrinter failed for '" + printerName + "' (Win32 error " + Marshal.GetLastWin32Error() + ")");
        }
        try {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "POS Hero Receipt";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, di)) {
                throw new Exception("StartDocPrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")");
            }
            try {
                if (!StartPagePrinter(hPrinter)) {
                    throw new Exception("StartPagePrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")");
                }
                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                try {
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int dwWritten;
                    if (!WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten)) {
                        throw new Exception("WritePrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")");
                    }
                    if (dwWritten != bytes.Length) {
                        throw new Exception("WritePrinter only wrote " + dwWritten + " of " + bytes.Length + " bytes");
                    }
                } finally {
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                }
                EndPagePrinter(hPrinter);
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
'@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)
Write-Output "OK"
