/**
 * GET /api/install-profile
 * Serves an iOS configuration profile (.mobileconfig) with a Web Clip payload:
 * installing it puts a full-screen OP icon on the iPhone home screen.
 * Must be served as application/x-apple-aspen-config so Safari offers to install it.
 */
import { WEBCLIP_ICON_BASE64 } from './_webclip-icon.js';

const APP_URL = 'https://opgestion.vercel.app/';

// Fixed UUIDs so re-installing updates the same profile instead of duplicating it.
const PROFILE_UUID = '6958B970-C773-413A-914D-1FFEFAF30A5A';
const WEBCLIP_UUID = '98592CFB-951D-4C8A-B862-7F8D6130E3AE';

export default function handler(req, res) {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key><true/>
      <key>Icon</key><data>${WEBCLIP_ICON_BASE64}</data>
      <key>IsRemovable</key><true/>
      <key>Label</key><string>OP</string>
      <key>Precomposed</key><true/>
      <key>URL</key><string>${APP_URL}</string>
      <key>PayloadDescription</key><string>Acceso directo a OP</string>
      <key>PayloadDisplayName</key><string>OP</string>
      <key>PayloadIdentifier</key><string>app.op.profile.webclip</string>
      <key>PayloadType</key><string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key><string>${WEBCLIP_UUID}</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Agrega OP a tu pantalla de inicio</string>
  <key>PayloadDisplayName</key><string>OP</string>
  <key>PayloadIdentifier</key><string>app.op.profile</string>
  <key>PayloadOrganization</key><string>OP</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${PROFILE_UUID}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
`;
  res.setHeader('Content-Type', 'application/x-apple-aspen-config');
  res.setHeader('Content-Disposition', 'inline; filename="OP.mobileconfig"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(plist);
}