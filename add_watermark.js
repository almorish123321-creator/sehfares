const fs = require('fs');
let html = fs.readFileSync('pdf-template.html', 'utf8');

const watermark = `
    <!-- WATERMARK -->
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 80px; font-weight: bold; color: rgba(255, 0, 0, 0.1); z-index: 100; pointer-events: none; white-space: nowrap; font-family: Arial, sans-serif; text-align: center;">
        SAMPLE / DEMO<br>NOT OFFICIAL
    </div>
`;

if (!html.includes('WATERMARK')) {
    html = html.replace('<!-- === HEADER === -->', watermark + '\n    <!-- === HEADER === -->');
    fs.writeFileSync('pdf-template.html', html, 'utf8');
    console.log('Added watermark');
}
