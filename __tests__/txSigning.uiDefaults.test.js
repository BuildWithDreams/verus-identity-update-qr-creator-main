const fs = require('fs');
const path = require('path');

describe('Tx Signing UI defaults', () => {
  const panelPath = path.join(__dirname, '..', 'views', 'tabs', 'tx-signing', 'panel.ejs');
  const appJsPath = path.join(__dirname, '..', 'public', 'app.js');

  test('tx-signing signed checkbox is checked by default', () => {
    const panel = fs.readFileSync(panelPath, 'utf-8');

    expect(panel).toMatch(/<input\s+id="tx-signing-signed"\s+type="checkbox"\s+checked\s*\/>/i);
  });

  test('tx-signing submit payload includes signed state from checkbox', () => {
    const appJs = fs.readFileSync(appJsPath, 'utf-8');

    expect(appJs).toContain('const signed = isChecked("tx-signing-signed");');
    expect(appJs).toContain('signed,');
  });
});
