const fs = require('fs');

let code = fs.readFileSync('packages/app/src/components/WebQRScanner.tsx', 'utf8');

const replacement = `style: {
              background: "#121820",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 14,
              color: "#f8fafc",
              fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
              fontSize: 16,
              minHeight: 56,
              padding: "8px 16px",
              cursor: "pointer",
            },`;

code = code.replace(/style: \{\s+background: "#121820",\s+border: "1px solid rgba\(255,255,255,0.18\)",\s+borderRadius: 8,\s+color: "#f8fafc",\s+font: "inherit",\s+minHeight: 40,\s+padding: "8px 10px",\s+\},/, replacement);

fs.writeFileSync('packages/app/src/components/WebQRScanner.tsx', code);
