# Applies landing_leads migration via Supabase Management API.
# Token is read from Windows Credential Manager (stored by `supabase login`).
# Token is never printed or written to disk.

$sig = @"
using System;
using System.Runtime.InteropServices;
public class CredMan {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credentialPtr);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  public static byte[] Read(string target) {
    IntPtr p;
    if (!CredReadW(target, 1, 0, out p)) return null;
    CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
    byte[] b = new byte[c.CredentialBlobSize];
    if (c.CredentialBlobSize > 0) Marshal.Copy(c.CredentialBlob, b, 0, (int)c.CredentialBlobSize);
    CredFree(p);
    return b;
  }
}
"@
Add-Type -TypeDefinition $sig -Language CSharp

$bytes = [CredMan]::Read("Supabase CLI:supabase")
if (-not $bytes) { Write-Error "Supabase CLI token not found in Credential Manager"; exit 1 }

$token = [System.Text.Encoding]::UTF8.GetString($bytes).Trim()
if ($token -notmatch '^sbp_') {
  $token = [System.Text.Encoding]::Unicode.GetString($bytes).Trim()
}
if ($token -notmatch '^sbp_') { Write-Error "Could not decode token (no sbp_ prefix)"; exit 1 }

$env:SUPABASE_ACCESS_TOKEN = $token
node scripts/_apply_leads_migration.mjs
exit $LASTEXITCODE
