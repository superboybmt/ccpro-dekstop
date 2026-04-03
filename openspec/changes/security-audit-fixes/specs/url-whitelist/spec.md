## ADDED Requirements

### Requirement: URL scheme whitelist for external links
The system SHALL only open external URLs that use the `https://` protocol. All other URL schemes (including `http://`, `file://`, `smb://`, `ftp://`) MUST be silently rejected.

#### Scenario: HTTPS URL is opened
- **WHEN** the renderer requests to open `https://github.com/example/releases`
- **THEN** the system opens the URL in the system default browser

#### Scenario: File protocol URL is blocked
- **WHEN** the renderer requests to open `file:///C:/Windows/System32/cmd.exe`
- **THEN** the system silently rejects the request and does NOT open any application

#### Scenario: HTTP URL is blocked
- **WHEN** the renderer requests to open `http://malicious-site.com`
- **THEN** the system silently rejects the request

### Requirement: Inline CSS moved to stylesheet
The system SHALL NOT use `dangerouslySetInnerHTML` for injecting CSS. All styles MUST be defined in external CSS files.

#### Scenario: Admin users page renders
- **WHEN** the admin users page is rendered
- **THEN** all hover effects and animations are applied via CSS classes from `styles.css` instead of inline `dangerouslySetInnerHTML`
