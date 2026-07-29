# Security

Privacyassay runs entirely in your browser and, by default, makes no third-party request. The one claim worth attacking is that the report never leaves your machine.

## Reporting a vulnerability

Report privately through GitHub's **Report a vulnerability** button on this repository's Security tab. Please do not open a public issue for a security bug.

If that button is not there, private reporting has not been switched on yet. Open a normal issue saying only that you have a security report and asking for a private channel. Leave out the details of the bug itself, and you will be given somewhere to send them.

In scope:

- a way to exfiltrate the fingerprint despite the Content-Security-Policy
- a CSP bypass, or injection into the report from a spoofed header or User-Agent
- a way to make the shown / blended / refused classification report a false result
- a raw value surviving into a report saved or screenshotted with Redact on

Out of scope:

- disagreement with a reading's weight or a browser's score (open a normal issue)
- anything that needs a browser extension or local malware already present

This is a solo project with no service-level commitment; expect a best-effort reply.
